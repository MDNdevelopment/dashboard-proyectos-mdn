### Modelo de permisos

Sistema único de **capability keys**, config-driven, gestionable por cualquier admin desde Empresa → Accesos, respaldado por RLS. Granularidad: `módulo`, `módulo.tab`, `módulo.acción`.

#### Evaluador (`src/lib/permissions.js` → `canAccessModule()` / alias `can()`)
- Config en `module_permissions.rules` (jsonb): `{ "rules": [ { "all": [cond, ...] }, ... ], "deny": [ cond, ... ] }`.
- `rules` = DNF: grupos en OR; dentro de cada grupo `all: []` es AND.
- `deny` = lista plana (OR): si cumple cualquiera, queda excluido. Forma correcta de "todos menos X", p. ej. `deny: [{ type: 'department', ids: [5] }]`.
- Tipos de condición: `min_level`, `department`, `position`, `user`.
- Orden: sin perfil → false · `admin=true` → true · deny → false · sin rules → **true (abierto)** · DNF rules.
- `negate`: solo soporte interno (retrocompat), no en la UI; solo aplica a tipos conocidos, tipo ausente/desconocido → `false` sin invertir.
- Gotcha: al configurar "usuario X **o** nivel ≥ N", cada condición va en **su propio grupo**. Ponerlas en un mismo grupo `all` las hace AND (error real que dejó capabilities imposibles de cumplir).

**Paridad JS ↔ SQL (fuente única de verdad):**
- JS: `can(capabilityKey)` en `AuthContext` (carga todas las filas de `module_permissions` al login).
- SQL: `public.user_can(p_capability_key text) returns boolean` (`security definer`), usada en RLS. Versión activa en prod: la de `20260708000000_user_can_deny.sql` (con `deny`, aplicada con otro version id).
- Permisos por **alcance** (dependen de la fila, no del perfil) no son capability: `public.user_leads_line(uuid)` y `public.user_leads_av_pauta(uuid)` (`security definer`, leen `metric_line_members.is_lead`) = "soy la jefa de esta línea"; usados en policies de Pautas.
- Tests: si `useAuth()` no trae `can`, las páginas usan `can = () => true`; los tests de nivel inyectan su `can` en el mock.
- **`department_id = 0`** = rol IT para sub-features de Tickets (no es capability).

#### Claves de capacidad (`clave` — qué permite — default/quién)
Todo lo no sembrado queda **abierto** y configurable. Registro completo: `src/config/modules.js → capabilitiesForModule()`.
Gotcha: el seed `20260706000002` nunca se aplicó en prod; los defaults de prod se sembraron por otra vía (los listados abajo son el estado esperado).

**Empresa**
- `empresa` — módulo Empresa — abierto.
- `empresa.clientes` — tab Clientes — `min_level 2`.
- `empresa.clientes.manage` — crear/editar/eliminar clientes (y `metric_clients.audiovisual_ids`, bloque "Audiovisual" de `ClientModal.jsx`) — prod: dos grupos OR: `min_level ≥ 3`, o usuarios Nairim + Lizdania (nivel 2) (`20260928170000_empresa_clientes_manage_or_lizdania.sql`). A Lizdania mensualidad/día de pago le siguen ocultos (`isFinancePrivileged`).
- `empresa.lineas` — tab Líneas — `min_level 2`.
- `empresa.lineas.manage` — crear/editar/eliminar Líneas y miembros — `min_level 4`.
- `empresa.departamentos`, `empresa.empleados`, `empresa.preguntas` — tabs — `admin=true`.
- `empresa.empleados.manage` — editar empleados vía `update-employee.js` — (sin default documentado).
- `empresa.empleados.sensible` — ver sueldo/fee y ficha de cualquier empleado (RRHH, p. ej. Sofía Lauretta) — (sin default documentado).
- `empresa.accesos` — tab "Accesos" de configuración (`/empresa/accesos`) — `min_level 4`.
- `empresa.permisos` — reporte RRHH de permisos/ausencias/reposos, tab "Permisos" (`/empresa/permisos`) — `min_level 3`.
- `empresa.permisos.manage` — registrar/editar/eliminar permisos, ausencias y reposos — `min_level 4` o `user_id` de Sofía Lauretta.
- Gotcha: `empresa.permisos` antes gateaba la tab de configuración (hoy `empresa.accesos`); hoy gatea el reporte RRHH (`employee_permissions`, §2.6).

**Tareas**
- `tareas.team`, `tareas.standup` — tabs — `min_level 2`.
- `tareas.manage` — crear/editar/eliminar tareas — abierto a propósito, fila explícita `rules: [{all: []}]`.
- `tareas.panorama` — legacy huérfana (tab Panorama retirado; fila sigue en `module_permissions`, UI no la consulta) — `deny` a los 9 departamentos, a propósito.

**Evaluaciones**
- `evaluaciones.resumen`, `evaluaciones.manage` — `min_level 2`.
- `evaluaciones.evaluar` — evaluar mensualmente criterios subjetivos por cargo (§2.7), sin autoevaluación.
- `evaluaciones.ver_todo` — leer todas las `evaluation_*` (reemplaza a `evaluaciones.empleados`, retirada).
- `evaluaciones.perfil-v2` — `deny` a los 9 departamentos (solo admins), a propósito.

**Audiovisual**
- `audiovisual.manage` — solicitar pautas — abierto a propósito.
- `audiovisual.coordina` — agendar/aprobar/marcar realizada + todo sobre recursos y piezas — Lizdania Andrade + admins.
- `audiovisual.pautas.gestion` — gestionar recursos (`recurso_ids`) y piezas de CUALQUIER pauta, sin agendar/aprobar — seed copia `rules` de `audiovisual.coordina`. Prod (2026-09-30): grupo `all` con Lizdania **Y** `min_level ≥ 3` **Y** `department 2` → nadie la cumple; para habilitar a alguien, separar condiciones en grupos OR.
- `audiovisual.piezas` — sembrada a todo el depto Audiovisual; solo cuenta para ver todas las líneas (`canViewAll`), NO edita piezas. No reutilizar para edición.
- `audiovisual.ver_todo` — ver todas las líneas (`canViewAll`).

**Reportes / Monitor / Ads / Proyectos / Leads**
- `reportes.manage` — editar/importar reportes — `min_level 3`.
- `reportes.close` — cerrar cualquier reporte mensual — `min_level 4`/admin (la jefa de línea siempre puede cerrar el suyo).
- `monitor_uso` — módulo Monitor de uso (§2.5bis) — `min_level 4`.
- `ads.manage` — crear/editar/eliminar campañas — `min_level 3`.
- `proyectos.manage` — crear/editar/eliminar proyectos (RLS `projects`).
- `leads` — módulo Leads — `min_level 3`.
- `leads.manage` — cambiar estado de un lead — `min_level 3`.

**Finanzas** (todas `min_level 4`, seed `20260914202422_create_finanzas.sql`)
- `finanzas` — módulo (facturación real, cobranza, reparto en partidas).
- `finanzas.dashboard` — Dashboard.
- `finanzas.facturacion` — tab Facturación.
- `finanzas.clientes` — tab Clientes (solo lectura financiera).
- `finanzas.distribucion` — Distribución y drill-down de Partida.
- `finanzas.movimientos` — Movimientos (diario consolidado, solo lectura).
- `finanzas.divisas` — Divisas (compra/venta y libro de Caja Bs). Antes `finanzas.cajabs`.
- `finanzas.facturacion.manage` — crear/editar/eliminar facturación.
- `finanzas.cobros.manage` — registrar/quitar cobros y abonos.
- `finanzas.distribucion.manage` — registrar distribuciones y pagos de partida.
- `finanzas.cerrar_mes` — cerrar mes activo y abrir el siguiente.
- `finanzas.clientes.manage` — modificar datos económicos del cliente (mensualidad, día de pago, intercambio). **Único camino**: `empresa.clientes.manage` no alcanza; lo impone un trigger en `metric_clients`.

#### Audiovisual: edición de pautas y piezas
- Edición de piezas = `canEditPiezasForPauta` (`src/utils/audiovisual.js`): `audiovisual.coordina`, recurso asignado (`av_pautas.recurso_ids`), `audiovisual.pautas.gestion`, o jefa de la línea de la pauta (`leadLineIds`, derivado con `leadLineIdsFor(lines, userId)` desde `lines[].lead_user_id` de `loadLines`).
- Editor de una pieza (`av_pauta_piezas.editor_user_id`) ≠ grabador (`recurso_ids`): `canActOnEditorGroup` le deja marcar estado de sus piezas (y el stepper "Listas" de su lote de fotos) sin `canEditPiezas`. Crear/borrar piezas, reasignar editores y "Piezas totales" exigen `canEditPiezas`.
- Jefa de línea (`is_lead` en `metric_line_members`): gestiona `recurso_ids`, `grabacion_por_formato` y piezas (incl. `editor_user_id`) de pautas con `av_pautas.line_id` = su línea. Pautas con `line_id` nulo ("Independientes") no tienen jefa: solo coordinación.
- RLS `av_pauta_piezas` insert/update/delete: `user_can('audiovisual.coordina')`, `auth.uid()::text` en `recurso_ids`, o `user_leads_line`/`user_leads_av_pauta` (que `audiovisual.pautas.gestion` también esté en estas policies no está documentado explícitamente: verificar en la migración); `av_pauta_piezas_update` además acepta `auth.uid()::text = editor_user_id`.
- `av_pautas_update`: `audiovisual.coordina`, `audiovisual.manage` o `auth.uid()::text = any(recurso_ids)` (permite `grabacion_por_formato`/`piezas_por_formato`).
- Trigger `before update` `prevent_av_pautas_recurso_escalation` protege `recurso_ids`: solo coordinación, `audiovisual.pautas.gestion`, recurso ya asignado (vs `OLD.recurso_ids`) o jefa de la línea (vs `OLD.line_id`, para no mover la pauta a su línea en el mismo `UPDATE`).
- Panel "Rendimiento por recurso" (`AvAnalytics.jsx`, `aggregateResourcePerformance` en `utils/audiovisual.js`):
  - "Capturadas" lee `recurso_ids` en vivo, acotado al mes visible (`visiblePautas`); una reasignación vieja se ve navegando a ese mes.
  - "Editadas" suma piezas entregadas de CNP audiovisual (`cnp_requests.is_audiovisual = true`, por `assignee_id`): `AudiovisualView.jsx` carga `loadCnp`, filtra con `cnpInMonth` + `pautasInScope` y pasa prop `cnpAv`; se cuentan en `editaCnp` (con `cnpPiecesDelivered` de `components/cnp/constants.js`), sumado a `edita` y mostrado aparte ("🗂️ N CNP").
  - CNP **NO** entra en `sumPiezasVideoForLine`/`sumPiezasVideoBreakdownForLine` (indicador «6. Nº Piezas vs Piezas editadas» de Reportes → Operaciones), que solo lee `av_pauta_piezas`.

#### RLS de escritura (vigente: `20260828160600_fix_projects_lines_clients_write_rls.sql`)
- `metric_lines` I/U/D → `user_can('empresa.lineas.manage')`; `metric_clients` I/U/D → `user_can('empresa.clientes.manage')`; `projects` I/U/D → `user_can('proyectos.manage')`. SELECT de `metric_lines`/`metric_clients`: `using(true)`.
- `tasks` y `metric_reports`: RLS especializado por nivel/membresía.
- `metric_line_members`: SELECT `using(true)`; I/U/D → `user_can('empresa.lineas.manage')` (evita auto-insertarse y heredar acceso vía task_user_in_line()).
- `users`: DELETE/INSERT → `is_company_admin()`; UPDATE → `auth.uid() = user_id` o admin. Trigger `prevent_users_privilege_escalation` bloquea a no-admin cambiar `access_level`/`admin`/`monthly_salary`/`deleted_at`/`company_id`; exime a `service_role`.
  - Edición de empleados (`EmployeeModal.jsx`) vía Netlify `update-employee.js` (`requireCapability('empresa.empleados.manage')`), que **conserva** `admin`/`access_level` actuales si el caller no es admin (anti-escalada real). `archive-employee.js` escribe `deleted_at`.
  - "Modo dios" de `Sidebar.jsx` (solo `CEO_ANALYSIS_USER_IDS`, hoy Juan Lauretta) va por `self-god-mode.js` (`requireUser` + check de `CEO_ANALYSIS_USER_IDS`, service-role); un update directo lo bloquearía el trigger.
- `evaluation_sessions`/`evaluation_responses`/`evaluation_comments`/`questions`/`question_positions`/`question_tags`: solo lectura para `authenticated` (solo `service_role` escribe). SELECT de `evaluation_*`: evaluado, evaluador (`manager_id`) o `user_can('evaluaciones.ver_todo')`. `evaluation-analysis.js` replica la regla sobre el score automático.
- `positions`: escritura `access_level >= 2`.
- `task_comments`: SELECT/INSERT según visibilidad de la tarea padre (`tasks_select`); DELETE solo el autor.
- `metric_client_private` (teléfono/correo de Instagram): SELECT/I/U/D gated por `client_private_can_access()` (admin o `access_level >= 3`); escritura además `user_can('empresa.clientes.manage')`. Lectura NO abierta (dato sensible aislado en su propia tabla).
- `leads`: SELECT/UPDATE gated por `leads_can_access()` (admin o `access_level >= 3`). Sin INSERT/DELETE: entran por web con `service_role` y no se borran.
- Gotcha: `20260706000000/001/002` y `20260707000000` están en el repo pero **nunca se aplicaron** en prod; no tomarlas como referencia.

#### Modo "Ver como" (impersonación visual, solo desarrollador)
- `AuthContext` expone `userProfile` = **perfil efectivo** (el suplantado si está activo, `src/lib/viewAs.js`): guards, `can()` y checks de `access_level`/`admin` cambian sin tocar consumidores. Real en `realUserProfile`; además `isViewingAs`, `startViewAs(userId)`, `stopViewAs()`.
- Gate: `canUseViewAs(realUserProfile)` — lista de `user_id` en `src/lib/viewAs.js` (hoy Juan Lauretta).
- **Sin paridad JS↔SQL:** el JWT sigue siendo el real; `user_can()`, `is_company_admin()`, `user_leads_line()` y lo que dependa de `auth.uid()` responden como el real. Datos filtrados por usuario (`notifications`, `tasks` de nivel 1, `manager_ratings`, `anonymous_feedback`) son del real. `src/components/ViewAsBanner.jsx` lo advierte; `NotificationBell` se oculta.
- **Solo lectura, impuesta en el cliente** (ninguna policy distingue el modo y `created_by`/`author_id` salen de `userProfile`): `src/lib/viewOnlyClient.js` envuelve `supabase.from()` y `supabase.rpc()` (todas las escrituras del frontend); RPC de lectura en allowlist `READONLY_RPCS`. Netlify functions con service-role (`/api/employees*`, `/api/self-god-mode`) se guardan con `blockedByViewOnly()`.

#### Archivos clave
- `src/lib/permissions.js` — evaluador; `isFinancePrivileged(userProfile, hasCapability)` (nivel ≥3, admin o `empresa.empleados.sensible`: ver `monthly_fee`/`payment_day` de clientes y `monthly_salary`); `canViewEmployeeFicha(userProfile, targetUserId, hasCapability)` (nivel ≥3/admin/`empresa.empleados.sensible` ven cualquier ficha; nivel 1-2 solo la propia; usado con `can('empresa.empleados.sensible')` en `EmployeeFichaContent.jsx` y `LineFichaModal.jsx`).
- `src/config/modules.js` — `MODULES`, `capabilitiesForModule()`.
- `src/context/AuthContext.jsx` — carga `module_permissions`, `can()`, perfil efectivo.
- `src/lib/viewAs.js` — gate, flag solo lectura, persistencia en `sessionStorage`, allowlist RPC.
- `src/lib/viewOnlyClient.js` — `wrapSupabaseClient`, `blockedByViewOnly()`.
- `src/components/ViewAsBanner.jsx` — barra fija (en `AppLayout`).
- `src/components/empresa/PermisosView.jsx` — UI de accesos (una card por capacidad), `/empresa/accesos`.
- `src/components/empresa/PermisosRrhhView.jsx` — reporte RRHH, `/empresa/permisos`.
- `src/components/RequireModule.jsx` — guard del módulo completo.
- `supabase/migrations/20260708000000_user_can_deny.sql` — `user_can()` real en prod.
