# Arquitectura del Sistema — MDN Dashboard

Suite de gestión interna de **MDN Publicidad** (agencia de publicidad venezolana). Reúne en un solo
dashboard 8 módulos: Proyectos, Tareas, Métricas, Empresa, Evaluaciones, Tickets, Ads y Autenticación.

> **Fuente de verdad del sistema.** Actualizar este archivo en el mismo commit cada vez que se agregue
> un módulo nuevo o cambie el modelo de datos / rutas / relaciones entre tablas.

---

## 1. Visión general

| Capa | Tecnología |
|---|---|
| Frontend | React 18 + Vite, React Router v6 (`BrowserRouter`) |
| Estilos | Tailwind CSS 3 · DM Sans / DM Mono · colores hex hardcoded |
| Backend | Supabase (PostgreSQL, Auth, Realtime, Edge Functions) |
| Deploy | Netlify (SPA redirect, `netlify.toml`) |
| Imágenes | **Cloudinary** (`src/utils/uploadToCloudinary.js`) — no Supabase Storage |
| IA | Gemini (Evaluaciones vía Netlify fn `evaluation-analysis.js`) |
| Notificaciones email | Resend (Edge fn `notify-campaign-assignee`) + Edge fn `express` (tickets) + Edge fn `notify-dispatch` (asignaciones de tarea/proyecto) |
| Notificaciones in-app | Tabla `notifications` con campanita realtime en toda la app (`NotificationBell.jsx`) |

### Punto de entrada y routing

```
src/main.jsx          ← BrowserRouter + <Routes> (definición completa de rutas)
  └─ <ProtectedRoute> ← redirige a /login si no hay sesión (solo verifica sesión)
       └─ <RequireModule moduleKey="X"> ← redirige a / si can(key)=false
            └─ <AppLayout> ← Outlet + suscripción realtime a `projects`
                 └─ rutas hijas (ver mapa de módulos)
```

- Cliente Supabase: `src/supabase.js`
- Auth context + hook `useAuth`: `src/context/AuthContext.jsx`
- Navegación central: `src/components/Sidebar.jsx`
- Guard de módulo: `src/components/RequireModule.jsx`
- Registro central de módulos: `src/config/modules.js`

### Modelo de permisos

El acceso opera en un **sistema de capacidades (capability keys)** único y config-driven, gestionable
desde Empresa → Permisos por cualquier admin, respaldado por RLS en la base de datos.

#### Claves de capacidad

La granularidad es `módulo`, `módulo.tab` y `módulo.acción`:

| Clave | Tipo | Significado |
|---|---|---|
| `empresa` | módulo | Acceso al módulo Empresa |
| `empresa.clientes` | ver-tab | Ver la pestaña Clientes |
| `empresa.lineas.manage` | modificar | Crear/editar/eliminar Líneas |
| `tareas.panorama` | ver-tab | Ver la vista Panorama en Tareas |
| `tareas.manage` | modificar | Crear/editar/eliminar tareas |
| `evaluaciones.manage` | modificar | Guardar evaluaciones |
| `reportes.manage` | modificar | Editar/importar reportes |
| `ads.manage` | modificar | Crear/editar/eliminar campañas |
| `proyectos.manage` | modificar | Crear/editar/eliminar proyectos |
| … | … | (ver `src/config/modules.js → capabilitiesForModule()`) |

**Invariantes del evaluador** (`src/lib/permissions.js` → `canAccessModule()` / alias `can()`):
- Sin reglas configuradas para esa clave → **abierto** (cualquier autenticado pasa).
- `admin=true` → siempre pasa, sin importar las reglas ni las exclusiones.
- Formato de config guardado en `module_permissions.rules` (jsonb):
  ```json
  { "rules": [ { "all": [cond, ...] }, ... ],  "deny": [ cond, ... ] }
  ```
- `rules`: DNF — array de grupos OR; cada grupo tiene `all: []` (AND de condiciones).
- `deny`: lista plana de condiciones (OR). Si el usuario cumple **cualquiera**, queda excluido aunque las `rules` lo permitirían. Se evalúa **después** del check de `admin` y **antes** de las `rules`.
- Tipos de condición: `min_level`, `department`, `position`, `user`.
- **Exclusiones ("todo el mundo menos X"):** usar el bloque `deny` en la UI. Ejemplo: `deny: [{ type: 'department', ids: [5] }]` → todos acceden excepto el departamento 5. Es la forma correcta de expresar "MENOS X".
- **Negación por condición (`negate`):** soporte interno en el evaluador (retrocompat con datos viejos). No se expone en la UI. Guarda crítica: `negate` solo aplica a tipos conocidos; tipo ausente o desconocido siempre devuelve `false` sin invertir.
- **Orden de evaluación:** sin perfil → false · admin → true · deny → false · sin rules → true · DNF rules.

**Fuente única de verdad:** el mismo evaluador corre en JS (frontend) y en SQL:
- JS: `can(capabilityKey)` en `AuthContext` — carga todas las filas de `module_permissions` al login.
- SQL: `public.user_can(p_capability_key text) returns boolean` (`security definer`) — usada en RLS.

**Defaults sembrados** (migración `20260706000002`):
- `empresa.clientes`, `empresa.lineas` → `min_level 2`
- `empresa.clientes.manage` → `min_level 2`
- `empresa.lineas.manage` → `min_level 4`
- `empresa.departamentos`, `empresa.empleados`, `empresa.preguntas`, `empresa.permisos` → `admin=true`
- `tareas.panorama`, `tareas.team`, `tareas.standup`, `tareas.manage` → `min_level 2`
- `evaluaciones.empleados`, `evaluaciones.resumen`, `evaluaciones.manage` → `min_level 2`
- `ads.manage` → `min_level 3`
- `reportes.manage` → `min_level 3`
- Todo lo no sembrado queda **abierto** y es configurable en la UI.

**RLS de escritura** (migración `20260706000001`):
- `metric_lines` INSERT/UPDATE/DELETE → `user_can('empresa.lineas.manage')`
- `metric_clients` INSERT/UPDATE/DELETE → `user_can('empresa.clientes.manage')`
- `projects` INSERT/UPDATE/DELETE → `user_can('proyectos.manage')`
- SELECT de `metric_lines`/`metric_clients` conserva `using(true)` (leídas por Tareas/Ads también).
- `tasks` y `metric_reports` mantienen su RLS especializado por nivel/membresía (sin cambio).

**Fallback en tests:** si `useAuth()` no devuelve `can`, las páginas usan `can = () => true`
(abierto por defecto, consistente con "sin reglas = abierto"). Los tests de restricciones de nivel
inyectan su propio `can` en el mock.

**`department_id = 0`** sigue siendo el indicador del rol IT para sub-features de Tickets (no se
gestiona por capability).

#### Archivos clave del sistema de permisos

| Archivo | Rol |
|---|---|
| `src/lib/permissions.js` | Evaluador puro (`canAccessModule` + alias `can`) · `isFinancePrivileged(userProfile)` → boolean (nivel 4 o admin: controla visibilidad de `monthly_fee`/`payment_day` de clientes y `monthly_salary` de empleados) |
| `src/config/modules.js` | Registro central: `MODULES`, `capabilitiesForModule()` |
| `src/context/AuthContext.jsx` | Carga `module_permissions`, expone `can()` |
| `src/components/empresa/PermisosView.jsx` | UI de configuración (una card por capacidad) |
| `src/components/RequireModule.jsx` | Guard de acceso al módulo completo |
| `supabase/migrations/20260706000000_user_can_evaluator.sql` | Función SQL `user_can()` original |
| `supabase/migrations/20260706000001_rls_capabilities.sql` | Políticas de escritura config-driven |
| `supabase/migrations/20260706000002_seed_capability_defaults.sql` | Defaults iniciales |
| `supabase/migrations/20260707000000_user_can_negation.sql` | `create or replace user_can()` con soporte de `negate` |
| `supabase/migrations/20260708000000_user_can_deny.sql` | `create or replace user_can()` con soporte de exclusiones (`deny`) |

### Base de datos compartida

Parte del esquema vive en `supabase/migrations/` (tables: `projects`, `tasks`, `metric_lines`,
`metric_clients`, `metric_reports`, legacy `teams`/`team_members`). Las tablas de Empresa, Evaluación,
usuarios, tickets y campañas **preexisten en una base compartida** y no tienen DDL en este repo —
su esquema está documentado en `docs/MIGRATION_EVALUACION.md`.

RLS en tablas de migración: patrón uniforme permisivo (`true`) para rol `authenticated`, **excepto
`tasks`** (policies por nivel, §2.3), **`metric_reports`** (policies por nivel y team, §2.4), y
**`projects`, `metric_lines`, `metric_clients`** (escrituras gated por `user_can()`, ver §Modelo de permisos).
Realtime habilitado en todas.

---

## 2. Mapa de módulos

### 2.1 Autenticación

| | |
|---|---|
| **Propósito** | Login, logout, recuperación y reseteo de contraseña. Carga el perfil del usuario (`userProfile`) y los permisos de módulo (`modulePermissions`) que gobiernan el acceso en toda la app. |
| **Archivos principales** | `src/context/AuthContext.jsx` (provider + `useAuth` + `can()`) · `src/components/ProtectedRoute.jsx` · `src/components/RequireModule.jsx` · `src/lib/permissions.js` (`canAccessModule`) · `src/config/modules.js` (registro central) · `src/pages/LoginPage.jsx` · `src/pages/ForgotPasswordPage.jsx` · `src/pages/ResetPasswordPage.jsx` |
| **Tablas** | `auth.users` (Supabase Auth) · `users` (perfil: `user_id, first_name, last_name, email, department_id→departments, position_id→positions, company_id, access_level, admin, avatar_url, receive_ticket_notifications, monthly_salary numeric`) · `module_permissions` (reglas de acceso por módulo) |
| **Contexto Auth** | `userProfile` (perfil del usuario) · `modulePermissions` (mapa `{[capability_key]: {rules:[]}}`) · `can(capabilityKey)` → boolean — evalúa cualquier clave de capacidad (`empresa`, `empresa.clientes`, `empresa.lineas.manage`, etc.) contra el perfil actual |
| **Rutas** | `/login` · `/forgot-password` · `/reset-password` |
| **Permisos** | Público (sin sesión) |

### 2.2 Proyectos / Dashboard

| | |
|---|---|
| **Propósito** | Gestión de proyectos con fases y tareas anidadas (jsonb). Filtrado por estado/departamento, duplicación, exportación Markdown, deeplink por ID. |
| **Archivos principales** | `src/App.jsx` · `src/components/AppLayout.jsx` (state owner + realtime) · `src/components/Dashboard.jsx` · `src/components/ProjectCard.jsx` · `src/components/ProjectModal.jsx` · `src/utils/projectProgress.js` · `src/utils/exportProjectsToMarkdown.js` |
| **Tablas** | `projects` (`id, name, team, requirements, status, departments[], phases jsonb, members[], created_at`) |
| **jsonb `phases`** | `[{ id, name, tasks: [{ id, name, status }] }]` — status de tarea: `"pendiente" \| "en_proceso" \| "pausada" \| "completada"` |
| **Rutas** | `/*` (catch-all dentro de AppLayout) · deeplink `?projectId=<uuid>` abre ProjectModal |
| **Permisos** | Cualquier usuario autenticado |
| **Convenciones** | Status de proyecto: title-case (`"Pendiente" \| "En proceso" \| "Completado"`). Modal: `undefined`=cerrado, `null`=crear, objeto=editar. |
| **Filtrado / scroll** | `Dashboard.jsx` aplica filtrado client-side usando `src/utils/filterProjects.js` (search + activeFilter + rango de fechas por `created_at`). Windowing de 30 proyectos por tanda con `IntersectionObserver` nativo (`sentinelRef`). |

### 2.3 Tareas / Teams

| | |
|---|---|
| **Propósito** | Gestión operativa mensual de tareas por línea, con 5 vistas: Panorama (los 4 teams), Dashboard de línea, Base (registro maestro), Kanban y Stand-up. Navegación por mes. |
| **Archivos principales** | `src/pages/TareasPage.jsx` · `src/components/tareas/PanoramaView.jsx` · `TeamView.jsx` · `BaseView.jsx` · `KanbanView.jsx` · `StandupView.jsx` · `TaskModal.jsx` · `src/components/tareas/taskStatus.js` · `src/utils/aggregateTaskMetrics.js` |
| **Tablas** | `tasks` (`id, company_id, team_id→metric_lines, client_id→metric_clients, description, source, assignee_ids text[] (múltiples responsables), assignee_id (DEPRECATED), support_id, created_by, request_date, due_date, closed_date, status, created_at`) |
| **Status de tarea** | `"En proceso" \| "Por revisar" \| "Bloqueado" \| "Pendiente" \| "Terminado"` |
| **Rutas** | `/tareas` (vistas por estado interno; `?view=base` fuerza la vista Base) |
| **Permisos (RLS)** | Visibilidad scoped por nivel. **Nivel 4 / admin:** ven y operan todas las tareas. **Nivel 2 y 3:** SELECT/INSERT/UPDATE sobre tareas donde `task_user_in_line(team_id)` (pertenecen a `metric_lines.member_user_ids`); DELETE permitido. **Nivel 1:** SELECT/UPDATE solo sobre tareas donde `auth.uid()::text = any(assignee_ids)`, `support_id` o `created_by`; INSERT requiere `auth.uid()::text = any(assignee_ids)`; DELETE denegado. Helpers SECURITY DEFINER: `public.task_user_view_all()`, `public.task_user_access_level()`, `public.task_user_in_line(p_team_id)`. Migración activa: `20260709000000_tasks_line_scoped_rls.sql` (reemplaza `20260702000002_tasks_multi_assignee_rls.sql`). |
| **Permisos (UI)** | Nivel 1 solo ve vistas **Base** y **Kanban** (Panorama/Dashboard/Stand-up ocultos). En TaskModal, el nivel 1 siempre aparece como responsable fijo (chip bloqueado en `UserPickerMulti`) pero puede agregar a otros miembros del team. Botón Eliminar oculto para nivel 1. **Visibilidad de líneas en UI:** `TareasPage.jsx` aplica `visibleLinesForUser(lines, userProfile)` (`src/utils/lineMembers.js`) tras cargar `metric_lines`: nivel 4/admin ven todas las líneas; nivel 2/3 ven solo las líneas donde aparecen en `member_user_ids`; nivel 1 ídem (solo ve líneas a las que pertenece, y dentro de ellas solo sus propias tareas por RLS). |
| **Status badge rápido** | En la vista Base (`BaseView.jsx`) el badge de estado es un botón que abre un dropdown (portal via `createPortal`) para cambiar el estado sin abrir el modal. Lógica compartida en `taskStatus.js` (`statusUpdatePatch` + `updateTaskStatus`). |
| **Nota FK** | `team_id` apunta a `metric_lines.id` por convención (sin FK formal; las tablas `teams`/`team_members` quedaron inertes tras migración `20260627000000_tareas_use_metric_lines.sql`) |

### 2.4 Métricas

| | |
|---|---|
| **Propósito** | Reportes mensuales ponderados (100 pts) por línea operativa: reuniones, productividad, crecimiento, solicitudes, pautas y piezas. Dashboard anual comparativo. |
| **Archivos principales** | `src/pages/MetricasPage.jsx` · `src/components/metricas/DashboardView.jsx` · `LineView.jsx` · `LineHubView.jsx` · `OperacionesView.jsx` · `FinanzasView.jsx` · `ScoreDial.jsx` · `metricsApi.js` · `constants.js` · `src/utils/metricsScore.js` · `metricsFinance.js` · `initMetricReport.js` · `aggregateMetricsDashboard.js` · **`EmployeeInfoModal.jsx`** · **`ClientFichaModal.jsx`** · **`EmployeeFichaContent.jsx`** · **`ClientFichaContent.jsx`** |
| **Tablas** | `metric_lines` (`id, company_id, name, color, sort_order, member_user_ids jsonb, metas jsonb`) · `metric_clients` (`id, company_id, line_id→metric_lines, name, website, payment_day, monthly_fee, social_links jsonb, logo_url, contacts jsonb, anniversary_date, mdn_since`) · `metric_reports` (`id, company_id, line_id→metric_lines, year, month, data jsonb` — UNIQUE por `line_id+year+month`) |
| **jsonb `metric_lines.metas`** | `{ "reuniones": 15, "tareas": [{ "nombre": "Calendario", "meta": 10 }, ...] }` — Metas de la línea para periodos no guardados. Tienen **prioridad sobre el carry-forward** del mes anterior (pisan `reuniones.meta` y `productividad.tareas`). Los reportes ya guardados quedan congelados. `{}` usa los defaults del código. Se configura en Empresa › Líneas. |
| **jsonb `metric_reports.data`** | `{ reuniones:{realizadas,meta}, productividad:{tareas:[{nombre,realizado,meta}]}, crecimiento:{items:[{clienteId,seguidoresGanados,seguidoresGanadosPrev,seguidoresActuales,seguidoresBase,meta}]}, solicitudes:{solicitudes,editadas}, pautas:{items:[{clienteId,realizadas,meta}]}, piezas:{piezas,editadas}, finanzas:{ingresos:[],gastosOperativos:[],sueldos:[],otrosGastos:[]}, incompleto?:boolean }` — `crecimiento.items`: `seguidoresGanados` (ganados del mes actual, editable — es lo que se compara contra `meta`); `seguidoresGanadosPrev` (ganados del periodo anterior guardados como línea base, editable solo en bootstrap, puramente informativo — no afecta el score); `seguidoresActuales` (totales al cierre del mes actual, editable); `seguidoresBase` (totales del periodo anterior guardados como línea base en bootstrap; en meses posteriores equivale al `seguidoresActuales` del mes previo traído de `loadPrevReport`). La UI muestra columnas del **mes anterior** (disabled por campo si el reporte previo tiene un valor para ese campo; editables si el campo está vacío o no hay reporte previo — en ambos casos el override se guarda en `seguidoresGanadosPrev`/`seguidoresBase` del reporte actual sin modificar el mes anterior) y del **mes del reporte** (siempre editables), más la casilla `meta` y un indicador ✓ Cumple / Pendiente con porcentaje `ganados/meta×100`. Flag `incompleto`: si `true`, el mes queda excluido del promedio anual, del ranking, de la cobertura y del gráfico histórico de la línea (`aggregateMetricsDashboard.js` + `LineHubView.jsx`). Las finanzas del mes se acumulan igualmente. Default ausente/false = el mes sí cuenta. Nota: el campo `feedback` existente en reportes guardados ya no se captura ni se puntúa; se ignora en los cálculos. |
| **Rutas** | `/reportes` (Dashboard anual) · `/reportes/linea/:lineId` (reporte de línea) |
| **Permisos** | Acceso al módulo: controlado por `can('reportes')` del módulo Permisos config-driven (`src/lib/permissions.js`). Sin reglas configuradas → acceso libre a autenticados; admins siempre pasan. La compuerta aplica en el Sidebar (`Sidebar.jsx`) y en `MetricasPage.jsx` (redirige a `/` si no tiene acceso). **Caveat RLS:** los helpers de BD `metrics_user_can_view()` (≥3 o admin) y `metrics_user_view_all()` (≥4 o admin) siguen hardcodeados por nivel — si se concede acceso vía Permisos a alguien por debajo de nivel 3, el frontend lo dejará entrar pero la BD devolverá datos vacíos (fase 2 pendiente). Nivel 3: ve y edita **solo su propia línea** (filtrado en frontend + RLS). Nivel 4 y admin: ven y editan todas las líneas. Filtrado de líneas: `visibleLinesForUser(lines, userProfile)` en `src/utils/lineMembers.js`. Migración activa: `20260704000000_metric_reports_team_rls.sql`. |
| **Estado de captura** | Mayoritariamente manual (inputs en `OperacionesView`/`FinanzasView`). Automatismos: para periodos no guardados → `initMetricReport.js` aplica carry-forward del mes anterior y después sobreescribe con `metric_lines.metas` (la línea tiene prioridad); reconciliación de cartera actual en crecimiento/pautas e **ingresos** y **sueldos** vía `syncReportClients.js`. **Finanzas → Ingresos** se auto-puebla desde `metric_clients.monthly_fee` (sembrar-y-editar: valores conservados por `clienteId`; clientes fuera de línea se descartan; filas manuales `clienteId==null` se conservan). **Finanzas → Sueldos** se auto-puebla desde `users.monthly_salary` filtrando por `metric_lines.member_user_ids` (mismo patrón: valores conservados por `empleadoId`; empleados que salen del team se descartan; filas manuales `empleadoId==null` se conservan). Reportes ya guardados quedan congelados. **No lee de `tasks` ni de `projects`.** |
| **Modelo de score (6 indicadores, 100 pts)** | `reuniones` 20 · `productividad` 20 · `crecimiento` 20 · `pautas` 20 · `solicitudes` 10 · `piezas` 10. El indicador `feedback` fue eliminado. Lógica en `src/utils/metricsScore.js`; pesos en `constants.js` (`INDICATORS`). |
| **UX — modales de detalle** | Clic en empleado del Resumen → `EmployeeInfoModal` (foto de perfil prominente `w-24 h-24`, nombre, cargo, dpto, email, teléfono, fechas, línea; descripción del cargo (`positions.position_description`) y funciones del cargo como bullets (`positions.position_functions jsonb[]`)). Clic en marca/cliente en Resumen, Operaciones o Finanzas → `ClientFichaModal` (mensualidad, día pago, web, contactos, redes — mensualidad y día de pago visibles **solo para nivel 4 y admin** vía `isFinancePrivileged`). Ambos coexisten con el deep-link a Tareas (botón interno en `ClientFichaModal`). Los cuerpos de ambas fichas viven en `EmployeeFichaContent.jsx` / `ClientFichaContent.jsx` (embebibles); los modales son wrappers finos (overlay + X + Escape). `LineFichaModal` (Empresa) los embebe en su drill-down. |
| **UX — Resumen (LineHubView)** | Siempre renderiza aunque no haya reportes del año (banner de aviso en vez de early-return). Sección "Equipo de la línea" con dos columnas (Empleados | Marcas), cada una con toggle Lista/Tarjetas (`ViewToggle` + `EntityGridList` de `src/components/common/EntityGridList.jsx`, compartidos con `LineFichaModal` de Empresa). Carga empleados completos con `loadCompanyEmployees(companyId)` (select canónico con joins position+department). Sin "Promedio anual" ni "Radar de indicadores". |
| **UX — Finanzas (FinanzasView)** | Sección Ingresos tiene toggle Lista/Tarjetas; **la vista por defecto es Tarjetas** y el monto es editable inline (el nombre del cliente en la tarjeta abre `ClientFichaModal`). Sección Sueldos auto-genera una fila por empleado del team (mismo patrón sembrar-y-editar que Ingresos): valores conservados mes a mes, empleados que salen del team se descartan, filas manuales se conservan. Las filas de sueldo son clickeables → abre `EmployeeInfoModal`. **La sección Sueldos solo es visible para nivel 4 y admin** (`isFinancePrivileged`). KPIs "Ingresos brutos" y "Total egresos" son botones con scroll a su sección. |

### 2.5 Empresa

| | |
|---|---|
| **Propósito** | Administración organizacional: departamentos, cargos, empleados, vacaciones, preguntas de evaluación, clientes, líneas operativas y **permisos de acceso por módulo**. |
| **Archivos principales** | `src/pages/EmpresaPage.jsx` · `src/components/empresa/DepartmentsView.jsx` · `EmployeesView.jsx` · `EmployeeModal.jsx` · `NewEmployeeDialog.jsx` · `QuestionsView.jsx` · `ClientsView.jsx` · `ClientModal.jsx` · `LinesView.jsx` · `LineModal.jsx` · `LineMetasModal.jsx` · **`LineFichaModal.jsx`** · **`PermisosView.jsx`** · `AvatarUpload.jsx` · `VacationsDialog.jsx` · `src/utils/lineFilters.js` · `lineMembers.js` |
| **Tablas** | `departments` · `positions` · `users` (empleados) · `vacations` · `questions` + `question_positions` + `question_tags` (banco de preguntas de evaluación) · `metric_clients` · `metric_lines` · **`module_permissions`** |
| **Creación de empleado** | Netlify fn `netlify/functions/create-employee.js` (service role + invite Supabase Auth) |
| **Rutas** | `/empresa` · `/empresa/departamentos` · `/empresa/empleados` · `/empresa/preguntas` · `/empresa/clientes` · `/empresa/lineas` · **`/empresa/permisos`** |
| **Permisos** | Departamentos/Empleados/Preguntas/**Permisos**: solo `admin`. Clientes/Líneas: `access_level ≥ 2`. |
| **UX — ficha de línea** | Clic en el card de una línea en `LinesView` (título o cuerpo, excluyendo controles de gestión) abre `LineFichaModal`: ficha read-only con nombre, color, contadores, y miembros y clientes en vista tarjetas (default) o lista — mismo toggle de `LineHubView` vía `ViewToggle`/`EntityGridList` (`src/components/common/EntityGridList.jsx`). Sin departamentos. Miembros y clientes son clickeables con **drill-down en un solo modal**: el contenido se reemplaza por `EmployeeFichaContent` / `ClientFichaContent` con botón "← Volver a {línea}". Escape sube un nivel (en la raíz cierra); el botón X cierra desde cualquier nivel. Incluye resumen de **Finanzas del último período** (mes más alto con reporte del año actual, `calcFinanzas`): visible solo para nivel 4 / admin (`isFinancePrivileged`); los reportes solo se cargan si el usuario es privilegiado. Carga sus datos on-mount (`loadCompanyEmployees` + `loadClients` + `loadYearReports` de `metricsApi`). |

### 2.6 Evaluaciones

| | |
|---|---|
| **Propósito** | Evaluaciones de desempeño: manager evalúa empleado respondiendo preguntas 1–5 asignadas al cargo. Historial, perfil propio, resumen/ranking y análisis IA opcional. |
| **Archivos principales** | `src/pages/EvaluacionesPage.jsx` · `src/components/evaluaciones/EmployeeEvalList.jsx` · `EvaluationModal.jsx` · `EmployeeProfileView.jsx` · `SummaryView.jsx` · `MiPerfilView.jsx` · `MiPerfilV2View.jsx` · `AiEvaluation.jsx` · `src/utils/aggregateEvaluationSummary.js` · `aggregateProfileMetrics.js` · `aggregateGroupAverages.js` |
| **Tablas** | `evaluation_sessions` (`manager_id, employee_id, period, total_score`) · `evaluation_responses` (`evaluation_id, question_id, response 1-5`) · `evaluation_comments` · `questions / question_positions / question_tags` · Vista `employee_evaluation_summary_last_month` · RPC `summary(period_param)` |
| **IA** | Netlify fn `netlify/functions/evaluation-analysis.js` → Gemini (bajo demanda, desde `AiEvaluation.jsx`) |
| **Rutas** | `/evaluaciones` · `/evaluaciones/resumen` · `/evaluaciones/perfil` · `/evaluaciones/perfil-v2` · `/evaluaciones/empleado/:id` |
| **Permisos** | Evaluar: `access_level ≥ 2` o admin. Sin permiso: solo vista del perfil propio. |
| **Cruce con otros módulos** | `MiPerfilView`/`MiPerfilV2View` leen métricas reales de `tasks` vía `src/utils/aggregateTaskMetrics.js` (completadas, a tiempo, días promedio). Deeplink `?projectId=` abre `ProjectModal` en AppLayout. |

### 2.7 Tickets / Soporte IT

| | |
|---|---|
| **Propósito** | Mesa de ayuda IT: crear/gestionar tickets, comentarios, SLA, analítica y preferencias de notificación. |
| **Archivos principales** | `src/pages/TicketsPage.jsx` · `TicketAnalyticsPage.jsx` · `NotificationPreferencesPage.jsx` · `src/components/tickets/*` (TicketList, TicketForm, TicketDetail, TicketCard, TicketComments, slaUtils, constants) · `src/components/tickets/analytics/*` · `src/hooks/useTicketAnalytics.js` |
| **Tablas** | `support_tickets` (`requester_id→users, assigned_to→users, title, description, category, priority, status, company_id`) · `ticket_comments` (`ticket_id, author_id→users, body`) · `users.receive_ticket_notifications` |
| **Notificaciones** | Edge fn `express` (`supabase.functions.invoke('express')`) |
| **Rutas** | `/tickets` · `/tickets/analytics` · `/tickets/notificaciones` |
| **Permisos** | Rol IT: `department_id === 0` |

### 2.8 Notificaciones

| | |
|---|---|
| **Propósito** | Centro de notificaciones in-app (campanita) + correos para asignaciones. Tres grupos: (1) asignación a tarea/proyecto → in-app + correo; (2) fechas de cliente (aniversario empresa, aniversario MDN, cumpleaños de contacto) → solo in-app, a miembros de la línea + nivel 4; (3) fechas de empleados MDN (cumpleaños y aniversario de entrada) → solo in-app, a toda la empresa. |
| **Archivos principales** | `src/components/notifications/NotificationBell.jsx` (campanita global con realtime y panel desplegable) · `src/utils/notificationFormat.js` (ícono, etiqueta, ruta de navegación, tiempo relativo) |
| **Tabla** | `notifications` (`id, company_id, user_id, type, title, body, entity_type, entity_id, email, read, dedupe_key, created_at`) — RLS: solo el destinatario puede leer/actualizar sus notificaciones. Habilitada en `supabase_realtime`. |
| **Types** | `task_assigned` · `project_added` · `client_anniversary` · `client_mdn_anniversary` · `client_contact_birthday` · `employee_birthday` · `employee_mdn_anniversary` |
| **Detección de asignaciones** | Triggers Postgres `notify_task_assignees()` (sobre `tasks.assignee_ids`) y `notify_project_members()` (sobre `projects.members`). Comparan OLD vs NEW; en INSERT todos los ids son "nuevos". Migraciones `20260703000001_notif_assignment_triggers.sql`. |
| **Job de fechas** | `pg_cron` diario a las 08:00 Caracas (12:00 UTC): función `enqueue_date_notifications()` SECURITY DEFINER. Usa `dedupe_key` con `ON CONFLICT DO NOTHING` para idempotencia (re-ejecutar el mismo día no duplica). Timing: fechas de cliente → 3 días antes + el día; fechas de empleado → solo el día exacto. Destinatarios fecha-cliente: `notif_client_recipients()` (miembros de línea ∪ usuarios `access_level ≥ 4`; `line_id` nulo → solo nivel 4). Migraciones `20260703000002_notif_date_cron.sql`. |
| **Correo** | `supabase/functions/notify-dispatch/index.ts` → Resend. Invocado por un Database Webhook de Supabase en INSERT sobre `notifications` cuando `email = true`. Solo aplica a `task_assigned` y `project_added`. Secrets: `RESEND_API_KEY`, `SENDER_EMAIL`. |
| **Campanita** | `NotificationBell.jsx` montada en la barra mobile de `AppLayout.jsx` y en la sección de usuario del `Sidebar.jsx` (desktop). Carga las últimas 40 notificaciones del usuario y suscribe a `postgres_changes` (INSERT + UPDATE) filtrado por `user_id`. Badge de no leídas; marcar leída individual o todas; navega a la entidad relacionada al hacer clic. |
| **Fechas en empleados MDN** | `users.birth_date` (cumpleaños) y `users.hire_date` (aniversario de entrada). Campos ya existentes en la tabla, editables desde `EmployeeModal.jsx`. No requirieron migración. |
| **Rutas** | Sin ruta propia — la campanita es un widget global. La navegación al hacer clic en una notificación: tarea → `/tareas`, proyecto → `/?projectId=<id>`, cliente → `/empresa/clientes`, empleado → `/empresa/empleados`. |
| **Permisos** | Cualquier usuario autenticado ve sus propias notificaciones (RLS). Los INSERTs los hacen únicamente los triggers y funciones SECURITY DEFINER. |
| **Setup manual** | Configurar un Database Webhook en Supabase dashboard: tabla `notifications`, evento INSERT, URL `{SUPABASE_URL}/functions/v1/notify-dispatch`, header `Authorization: Bearer {SERVICE_ROLE_KEY}`. Habilitar extensión `pg_cron` vía Supabase dashboard → Extensions. |

### 2.9 Ads / Campañas

| | |
|---|---|
| **Propósito** | Gestión de campañas publicitarias y tácticas; estadísticas. |
| **Archivos principales** | `src/pages/AdsPage.jsx` · `src/components/ads/AdsList.jsx` · `AdsCard.jsx` · `AdsForm.jsx` · `AdsDetail.jsx` · `AdsStats.jsx` · `constants.js` |
| **Tablas** | `campaigns` (`id, name, client_id→metric_clients, assignee→users, priority, status, notes, start_date, end_date, created_by→users, updated_at`) |
| **Notificaciones** | Edge fn `supabase/functions/notify-campaign-assignee/index.ts` → Resend email al asignar campaña |
| **Rutas** | `/ads` |
| **Permisos** | Ver: cualquier autenticado. Editar/crear: `access_level ≥ 3` o admin. |

---

## 3. Modelo de datos y relaciones

### 3.1 Tablas definidas en `supabase/migrations/`

| Tabla | Migración | Descripción |
|---|---|---|
| `projects` | `20260525000000` + `20260525000001` | Proyectos con fases/tareas en jsonb. Sin FKs a otras tablas. |
| `teams` | `20260622000000` | **LEGACY — inerte.** Reemplazada por `metric_lines`. |
| `team_members` | `20260622000000` | **LEGACY — inerte.** |
| `tasks` | `20260622000000` (mod. hasta `20260702000002`) | Tareas operativas. FK `client_id→metric_clients`. Múltiples responsables via `assignee_ids text[]` (migración `20260702000001`). `assignee_id` (texto singular) conservada como columna deprecada. |
| `metric_lines` | `20260625000000` (mod. 2026-2030) | Líneas/jefas operativas. Eje central de Tareas + Métricas. |
| `metric_clients` | `20260625000000` (mod. hasta `20260702000003`) | Cartera de clientes. FK `line_id→metric_lines`. Columnas añadidas: `contacts jsonb` (personas con nombre, cargo, día+mes de cumpleaños — sin año), `anniversary_date date`, `mdn_since date`, `monthly_fee numeric(12,2)` (mensualidad en USD para auto-poblar ingresos de Finanzas). |
| `metric_reports` | `20260625000000` | Un reporte jsonb por `(line_id, year, month)`. FK `line_id→metric_lines` CASCADE. |
| `notifications` | `20260703000000` | Notificaciones in-app y de correo. RLS: lectura/actualización solo del destinatario (`auth.uid()::text = user_id`). Realtime habilitado. Índice único parcial sobre `dedupe_key` para idempotencia de las notificaciones de fecha. |
| `module_permissions` | `20260705000000` | Reglas de acceso por módulo (DNF: grupos OR de condiciones AND). Una fila por `(company_id, module_key)`. Estructura `rules jsonb`: `{"rules":[{"all":[{"type":"department","ids":[...]},{"type":"min_level","value":N},...]},...]}`. Sin filas = módulo abierto. RLS: SELECT abierto a `authenticated`; INSERT/UPDATE/DELETE solo si `is_company_admin()` (función SECURITY DEFINER). |

### 3.2 Tablas externas (base compartida — no en migraciones)

`users` · `departments` · `positions` · `vacations` · `questions` · `question_positions` ·
`question_tags` · `evaluation_sessions` · `evaluation_responses` · `evaluation_comments` ·
`campaigns` · `support_tickets` · `ticket_comments`

Ver esquema detallado en `docs/MIGRATION_EVALUACION.md`.

Columnas añadidas vía migración `supabase/migrations/20260709000000_position_details_and_salary.sql`:

| Tabla | Columna | Tipo | Descripción |
|---|---|---|---|
| `positions` | `position_description` | `text` | Descripción narrativa del cargo, editble desde Empresa › Departamentos (modal de cargo). |
| `positions` | `position_functions` | `jsonb` (default `[]`) | Lista de funciones del cargo como array de strings (bullets mostrados en `EmployeeInfoModal`). |
| `users` | `monthly_salary` | `numeric` | Sueldo mensual en USD del empleado. Editable solo por nivel 4 / admin vía `isFinancePrivileged`. Precarga la sección Sueldos de `FinanzasView`. |

### 3.3 Diagrama de relaciones

```
users (user_id PK)  ←── tabla central de personas
  ├─ department_id ──→ departments(department_id)
  └─ position_id   ──→ positions(position_id)
                         positions.department_id ──→ departments

vacations.user_id ──→ users

questions
  ├─── question_positions.question_id    .position_id ──→ positions
  └─── question_tags.question_id

evaluation_sessions
  ├─ manager_id  ──→ users
  ├─ employee_id ──→ users
  ├─── evaluation_responses.evaluation_id    .question_id ──→ questions
  └─── evaluation_comments.evaluation_id

metric_lines (id PK)  ←── eje operativo
  ├─── metric_clients.line_id   (FK, SET NULL)
  ├─── metric_reports.line_id   (FK, CASCADE; único por line+year+month)
  ├─── tasks.team_id            (convención sin FK formal)
  └─ member_user_ids[]  ······→ users (array jsonb, sin FK)

metric_clients (id PK)  ←── cliente central
  ├─── tasks.client_id          (FK, SET NULL)
  └─── campaigns.client_id      (FK, SET NULL)

tasks
  ├─ client_id    ──→ metric_clients
  ├─ team_id      ··→ metric_lines  (sin FK formal)
  ├─ assignee_ids ··→ users[]  (array text[], sin FK; reemplaza assignee_id)
  └─ assignee_id / support_id / created_by ··→ users (texto, sin FK; assignee_id DEPRECATED)

campaigns
  ├─ client_id  ──→ metric_clients
  ├─ created_by ··→ users
  └─ assignee   ··→ users (texto)

support_tickets
  ├─ requester_id ──→ users
  ├─ assigned_to  ──→ users
  └─── ticket_comments.ticket_id    .author_id ──→ users

projects  ←── independiente (team/members/departments son text/arrays sin FKs)

notifications (user_id ··→ users — sin FK formal, RLS by auth.uid()::text)
  ├─ entity_type='task'     entity_id ··→ tasks.id
  ├─ entity_type='project'  entity_id ··→ projects.id
  ├─ entity_type='client'   entity_id ··→ metric_clients.id
  └─ entity_type='employee' entity_id ··→ users.user_id
```

Leyenda: `──→` FK formal declarada · `··→` relación lógica por convención (sin constraint) · `───` uno-a-muchos (tabla hija contiene la FK)

### 3.4 Columnas jsonb relevantes

| Tabla · columna | Forma |
|---|---|
| `projects.phases` | `[{ id, name, tasks: [{ id, name, status }] }]` |
| `metric_reports.data` | `{ reuniones:{realizadas,meta}, productividad:{tareas:[]}, crecimiento:{items:[{clienteId,seguidoresGanados,seguidoresGanadosPrev,seguidoresActuales,seguidoresBase,meta}]}, solicitudes, pautas:{items:[]}, piezas, feedback:{items:[]}, finanzas:{ingresos:[],gastosOperativos:[],sueldos:[],otrosGastos:[]}, incompleto?:boolean }` — `seguidoresGanadosPrev`: ganados del periodo anterior (línea base; editable cuando el reporte previo no tiene valor para ese campo, o en bootstrap — el override se guarda en el reporte actual). `incompleto`: si true, excluye el mes del promedio anual/ranking/cobertura/gráfico pero acumula finanzas igualmente. |
| `metric_reports.data.finanzas.ingresos` | Items auto-sembrados desde `metric_clients.monthly_fee` tienen `{ id:"ing-<clientId>", clienteId, descripcion, monto }`. Items manuales (sin vínculo a cliente) tienen `clienteId: null` y la misma forma. `syncReportClients` reconcilia los ligados a cliente (preserva monto editado, agrega nuevos, descarta clientes que salieron) y conserva los manuales. |
| `metric_reports.data.finanzas.gastosOperativos` | Items de la forma `{ id, descripcion, monto, clienteId? }`. `clienteId` (opcional) asocia el gasto a un cliente de la línea; se elige con un selector en la UI. `monto` se almacena como número o `null` (campo vacío). `calcConsolidado(report, lineClients)` en `metricsFinance.js` agrega ingresos, gastos y diferencia por cliente para la sección "Consolidado de gastos", que se muestra automáticamente debajo de Gastos operativos. |
| `metric_reports.data.finanzas.sueldos` | Items auto-sembrados desde `users.monthly_salary` tienen `{ id:"sue-<userId>", empleadoId, descripcion, monto }`. Items manuales (sin vínculo a empleado) tienen `empleadoId: null` y la misma forma. `syncReportClients` reconcilia los ligados a empleado (mismo patrón que ingresos/clientes). La sección solo es visible para nivel 4 / admin (`isFinancePrivileged`). |
| `metric_lines.member_user_ids` | `["uuid", ...]` |
| `metric_lines.metas` | `{ reuniones: 15, tareas: [{ nombre, meta }] }` — Defaults de metas por línea |
| `metric_clients.social_links` | `[{ red, link }, ...]` |
| `metric_clients.contacts` | `[{ name, role, birth_day, birth_month }, ...]` — personas de la empresa cliente. `birth_day` (1–31) y `birth_month` (1–12) sin año; pensado para notificaciones de cumpleaños futuras. |
| `tasks.assignee_ids` | `["user_id", ...]` — array de responsables (reemplaza `assignee_id`; columna singular conservada como deprecada para compat con filas históricas) |

---

## 4. Cómo se interconectan los módulos hoy

### Conexiones activas (implementadas)

| Punto de cruce | Descripción |
|---|---|
| **Evaluaciones ↔ Tareas** | `MiPerfilView` y `MiPerfilV2View` leen `tasks` vía `src/utils/aggregateTaskMetrics.js`: totales, completadas, % a tiempo, días promedio, por usuario. |
| **Evaluaciones ↔ Proyectos** | `MiPerfilV2View` usa deeplink `?projectId=uuid` para abrir `ProjectModal` en AppLayout. |
| **Ads ↔ Empresa/Métricas** | `campaigns.client_id → metric_clients.id`: las campañas se asocian al cliente central de Métricas/Empresa. |
| **Tareas ↔ Empresa/Métricas** | `tasks.client_id → metric_clients.id` y `tasks.team_id → metric_lines.id`: las tareas están relacionadas relacionalmente a clientes y líneas. |
| **Métricas ↔ Empresa (mensualidad)** | `metric_reports.data.finanzas.ingresos` se auto-puebla desde `metric_clients.monthly_fee`: `FinanzasView` carga los clientes de la línea, y `syncReportClients`/`initMetricReport` sincronizan los ingresos con la mensualidad guardada (valores editables mes a mes). |
| **Métricas ↔ Empresa (sueldos)** | `metric_reports.data.finanzas.sueldos` se auto-puebla desde `users.monthly_salary` filtrando por `metric_lines.member_user_ids`: `FinanzasView` carga los empleados de la línea y `syncReportClients`/`initMetricReport` sincronizan los sueldos (mismo patrón sembrar-y-editar). Visible solo para nivel 4 / admin (`isFinancePrivileged`). El campo `monthly_salary` solo es editable por nivel 4 / admin en `EmployeeModal`/`NewEmployeeDialog`. |
| **Notificaciones ↔ Tareas/Proyectos** | Triggers Postgres en `tasks.assignee_ids` y `projects.members` insertan notificaciones al detectar nuevos miembros → Edge fn `notify-dispatch` envía correo vía Resend. |
| **Notificaciones ↔ Empresa (fechas)** | Job pg_cron diario consulta `metric_clients.anniversary_date`, `metric_clients.mdn_since`, `metric_clients.contacts[].birth_day/birth_month`, `users.birth_date` y `users.hire_date` para generar notificaciones de fecha in-app. Recipients derivados de `metric_lines.member_user_ids` y `users.access_level`. |
| **Reportes → Tareas (deep-link)** | Clic en "Ver tareas de este cliente" dentro de `ClientFichaModal` navega a `/tareas?view=base&team={lineId}&client={clienteId}`. `TareasPage` lee `?team=` para pre-seleccionar el team; `BaseView` lee `?client=` (UUID de `metric_clients`) para filtrar tareas por `client_id`, mostrando una pill removible con el nombre del cliente. |
| **Reportes → Evaluaciones (deep-link)** | `EmployeeInfoModal` (abierto desde `LineHubView`) muestra el botón "Ver perfil completo" → `/evaluaciones/empleado/{userId}` si `can('evaluaciones')`. |
| **Reportes → ficha empleado (modal)** | `LineHubView` (pestaña Resumen) carga los miembros de la línea vía `loadCompanyEmployees(companyId)` (select completo con joins) + `line.member_user_ids`. Clic en empleado → `EmployeeInfoModal`. |
| **Reportes → ficha cliente (modal)** | Clic en marca/cliente en `LineHubView` (columna Marcas), `OperacionesView` (ClientLink), o `FinanzasView` (filas de ingresos / tarjetas) → `ClientFichaModal`. Los objetos completos de `metric_clients` ya están en el estado local de cada vista. |
| **Empresa → fichas de empleado/cliente (drill-down)** | Clic en el card de una línea en `LinesView` → `LineFichaModal` (ficha read-only de la línea). Sus listas de miembros y clientes drillean **dentro del mismo modal** a `EmployeeFichaContent` / `ClientFichaContent` (los mismos cuerpos de ficha del módulo Reportes), heredando el gating financiero y los deep-links a Evaluaciones y Tareas. |
| **Empresa → Reportes (deep-link financiero)** | Los KPIs "Ingresos brutos" y "Total egresos" del resumen de finanzas de `LineFichaModal` (visibles solo con `isFinancePrivileged`; navegables solo si además `can('reportes')`) cierran el modal y navegan a `/reportes/linea/{lineId}?tab=finanzas&section=ingresos|gastos`. `FinanzasView` lee `?section=` con `useSearchParams`: scroll one-shot a la sección (refs `ingresosRef`/`gastosRef`) tras la primera carga y limpia el param con `replace` (no re-scrollea al cambiar mes/sub-tab). |
| **Reportes → Reportes (deep-link interno)** | KPI "Línea líder" en `DashboardView` navega a `/reportes/linea/{lineId}`. Las tarjetas financieras de la tabla resumen navegan a `/reportes/linea/{lineId}?tab=finanzas`. Los sub-links "N cuentas" / "N empleados" de las tarjetas financieras navegan a `?tab=operaciones` y al Resumen de la línea respectivamente. `LineView` lee `?tab=hub|operaciones|finanzas` para pre-seleccionar la sub-pestaña al cargar. |

### Desconexión notable (doble fuente de verdad)

`Métricas` tiene un indicador *Productividad–Tareas Fijas* (`metric_reports.data.productividad.tareas[]`)
que se rellena **manualmente** en `OperacionesView`, aunque la tabla `tasks` ya contiene los datos reales
filtrados por línea (`team_id`) y mes (`closed_date`). Lo mismo aplica al indicador *Solicitudes vs.
Entregados*. Esta desconexión es el principal punto de deuda de interconexión del sistema.

---

## 5. Convenciones y referencias

### Convenciones de código

| Convención | Detalle |
|---|---|
| Status de proyecto | Title-case español: `"Pendiente"`, `"En proceso"`, `"Completado"` |
| Status de tarea (phases jsonb) | Lowercase underscore: `"pendiente"`, `"en_proceso"`, `"pausada"`, `"completada"` |
| Status de tarea (tabla `tasks`) | `"En proceso"`, `"Por revisar"`, `"Bloqueado"`, `"Pendiente"`, `"Terminado"` |
| Modal convention (AppLayout) | `undefined` = cerrado · `null` = crear · objeto = editar |
| Filtros sidebar | `"all"`, `"En proceso"`, etc. para estado; `"dept:Diseño"` para departamento |
| Color de marca | `#FFB800` (amarillo/dorado) para estados activos y acentos |
| Fondo | `#f2f0e8` (crema cálido) con patrón de puntos (clase `.main-bg`) |

### Archivos de referencia

- `CLAUDE.md` — instrucciones para Claude Code (este repo)
- `docs/MIGRATION_EVALUACION.md` — bitácora de migración de Evaluaciones + esquema de tablas externas
- `supabase/migrations/` — DDL de las tablas propias del repo
- `src/test/` — suite Vitest (un archivo por componente/util)
- `netlify/functions/` — `create-employee.js`, `evaluation-analysis.js`
- `supabase/functions/` — `notify-campaign-assignee/index.ts`
