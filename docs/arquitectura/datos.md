## 3. Modelo de datos y relaciones

Catálogo del estado actual. Leyenda FK: `──→` FK declarada · `··→` relación lógica sin constraint. "Snapshot" = valor copiado al crear, no se recalcula. Helpers RLS frecuentes: `user_can('<cap>')`, `task_user_view_all()`, `task_user_in_line()`, `task_is_general_line()`, `task_user_owns_client()`, `is_company_admin()`.

### 3.1 Tablas en `supabase/migrations/`

#### Núcleo: líneas, clientes, reportes

### `metric_lines`
- Líneas/jefas operativas; eje central de Tareas + Métricas. FK hijas: `metric_clients.line_id` (SET NULL), `metric_reports.line_id` (CASCADE), `cnp_requests.line_id`, `meetings.line_id`, `tasks.team_id` (sin FK).
- `is_management` (grupo "Alta Gerencia" en Tareas).
- `metas jsonb`: `{ tareas: [{ nombre, meta }] }` — defaults de metas de tareas fijas. La meta de reuniones NO va acá (es derivada, §2.5).
- Gotcha: `metric_lines.member_user_ids jsonb` ya no es fuente; la membresía vive en `metric_line_members`, y `loadLines()` expone `member_user_ids` como array derivado + `line.lead_user_id` (o `null`).

### `metric_line_members`
- N:M `(line_id, user_id)` líneas↔empleados. `is_lead boolean`: jefa real de la línea (máx. una por línea).
- `setLineLeader(lineId, userId)` limpia el flag de otras miembros antes; `removeLineLeader(lineId, userId)` (`metricsApi.js`). Editable con botón ⭐ en `LineFichaModal.jsx` (Empresa → Líneas, vista `canManage`).
- Mover/quitar a la jefa (`assignMemberToLine`/`removeMemberFromLine`, `src/utils/lineMembers.js`) borra su fila → el liderazgo no viaja con ella.
- Consumida por `loadAdsResponsables()` (Ads, §2.10).
- RLS: `for all to authenticated using(true) with check(true)`.

### `metric_clients`
- Cartera de clientes. FK `line_id→metric_lines` (SET NULL).
- Columnas: `contacts jsonb`, `social_links jsonb`, `anniversary_date date`, `mdn_since date`, `monthly_fee numeric`, `campaign_budget numeric` (presupuesto mensual Ads; visible a todos, no gated), `social_manager_id text`, `designer_id text`, `audiovisual_ids jsonb`, `apoyo_ids jsonb`, `rif text` (RIF, texto libre; `ClientModal` / `ClientFichaContent`).
- Baja: `deleted_at timestamptz` (soft delete), `baja_incluye_mes boolean` default `true` (si el mes de baja cuenta en reportes), `contract_end date` (prioridad sobre `deleted_at` en `clientInMonth`; al fijarlo `cleanupClientAfterContractEnd` borra reportes guardados de meses posteriores salvo cerrados), `contract_end_reason text`.
- Cambio de línea diferido: `pending_line_id uuid` + `line_change_at date` (1° del mes siguiente) + `pending_task_assignee text` (responsable manual si la línea destino no tiene jefe, p.ej. Independientes). El pg_cron `apply_due_client_line_moves` (diario 10:00 UTC) flipea `line_id`, limpia staff y mueve tareas abiertas.
- API: `loadClients` excluye archivados por defecto (`{ includeArchived: false }`); `{ includeArchived: true }` en `OperacionesView`/`FinanzasView` (nombres históricos) y `ClientsView` (vista por mes, toggle archivados). `deleteClient(clientId, { incluyeMes, contractEnd, reason })` hace UPDATE de `deleted_at`, `baja_incluye_mes`, `contract_end`, `contract_end_reason`; `restoreClient` pone `deleted_at`, `contract_end`, `contract_end_reason` en `null`.
- Gotcha: archivados conservan `id` para que `metric_reports.data`, `tasks.client_id`, `campaigns.client_id`, `paid_campaigns.client_id` sigan resolviendo nombre. La policy DELETE física no se usa desde el cliente.

### `metric_client_private`
- `client_id PK→metric_clients` (`ON DELETE CASCADE`), `phone text`, `instagram_email text` (correo de la cuenta IG del cliente, uso interno), `updated_at`.
- Separada porque RLS es por fila: lectura NO abierta. UI gated por `isFinancePrivileged(userProfile)`.
- `loadClientPrivate(clientId)`/`upsertClientPrivate(clientId, fields)` (`metricsApi.js`); solo `ClientModal.jsx`.

### `metric_reports`
- Un reporte por `(line_id, year, month)` (único). FK `line_id→metric_lines` CASCADE. `data jsonb` (ver 3.4). Cierre: `closed_at`/`closed_by`/`closed_auto` (manual o automático; §2.5 "Cierre de reporte").

### `metric_client_line_moves`
- Auditoría de movimientos de cuenta entre líneas: `company_id, client_id→metric_clients CASCADE, from_line_id/to_line_id→metric_lines (SET NULL), effective_date, split_old/split_new numeric, created_by`.
- No recalcula ownership; el dato correcto está materializado en `metric_reports.data` (§2.5 "Mover cuenta de línea"). RLS abierta a autenticados.

#### Tareas, CNP, Chequeo, Tareas Fijas

### `tasks`
- Tareas operativas. FK `client_id→metric_clients` (SET NULL). `team_id` ··→ `metric_lines` (sin FK).
- `assignee_ids text[]` (responsables; sin FK). `assignee_id` texto singular **deprecada** (solo filas históricas). `support_id`, `created_by` ··→ users (texto).
- `blocked_reason text`: razón cuando el estado es "Paralizado" (antes "Bloqueado"). Estado siempre manual.
- `checklist jsonb`, con triggers de clamp de fechas y notificaciones a encargados de ítems.

### `cnp_requests`
- Solicitudes de Contenido No Planificado (§2.4quinquies), separadas de `tasks`. FK `client_id→metric_clients` CASCADE, `line_id→metric_lines` SET NULL (snapshot, mismo patrón que `tasks.team_id`). `assignee_id`, `created_by`, `team_checked_by`, `print_approved_by` ··→ users (texto).
- Doble check de impresión `team_checked_at/by`, `print_approved_at/by` (validado en app, no en BD).
- `pieces jsonb default '[]'` — checklist de piezas (`[]` = 1 pieza). `deleted_at timestamptz` (soft delete).
- RLS: SELECT autenticados; INSERT/DELETE `user_can('cnp.manage')` + (`task_user_view_all()`/`task_user_in_line()`); UPDATE además `assignee_id = auth.uid()` y caso líneas generales (responsable asignado desde otra línea). Realtime.

### `publication_checks`
- Grilla del módulo Chequeo (§2.4quater): una fila por `(client_id, network, content_type)` **y semana** (`period_year/period_month/period_week`), UNIQUE por la combinación completa. `comment`.
- Fecha de la fila libre (no atada a la semana); color de alerta `recentCheckStatus` = días desde la fecha registrada hasta hoy.
- FK `client_id→metric_clients` CASCADE, `line_id→metric_lines` SET NULL (snapshot).
- RLS: SELECT autenticados; escritura `user_can('chequeo.manage')` + (`task_user_view_all()` o `user_can('chequeo.ver_todo')` o `task_user_in_line()` o `task_is_general_line()` — este último para el team "Independientes"). Realtime.
- Gotcha: `publication_check_events` ya no existe (dropeada); no referenciar.

### `fixed_task_marks`
- Tildes de Tareas Fijas (§2.4bis), uno por `(client_id, task_key, period_year, period_month, period_week, network)`. FK `client_id→metric_clients` CASCADE, `line_id→metric_lines` CASCADE (snapshot para RLS/rollup).
- `network` default `''`; las 4 tareas vigentes usan `''` (solo la removida `'plataformas'` lo usaba).
- RLS: SELECT autenticados; escritura `user_can('tareas.fijas.manage')` + (`task_user_view_all()`/`task_user_in_line()` sobre el `line_id` snapshot, o `task_user_owns_client()` sobre la línea actual). Realtime.

#### Audiovisual

### `av_pautas`
- Pautas audiovisuales (§2.4ter), flujo `solicitada→programada→realizada/declinada`. FK `client_id→metric_clients SET NULL`, `line_id→metric_lines SET NULL` (snapshot).
- `recurso_ids text[]`: lista autoritativa de quién grabó ("Recursos"; patrón `attendee_ids`). La UI solo la amplía (`syncRecursoIds`), nunca la reduce.
- `grabacion_por_formato jsonb default '{}'`: `{"V": {"<user_id>": 3}}` — reparto por formato y persona (`GrabacionSection` en `PautaDetailModal.jsx`). `'{}'` en pautas viejas → `AvAnalytics` las marca `≈` (atribución legacy estimada).
- `piezas_editadas` (lo mantiene el trigger de `av_pauta_piezas`), `piezas_totales` (manual).
- Legacy sin uso en UI: `graba_user_id`/`graba_other`, `edita_user_id`/`edita_other` (`→users SET NULL`).
- `deleted_at timestamptz` (mismo patrón que `metric_clients.deleted_at`): "Borrar" = soft delete (`avPautasApi.deletePauta`/`restorePauta`, pestaña **Papelera** de `AvPhaseTable.jsx`).
- RLS: SELECT autenticados; escritura `user_can('audiovisual.coordina') OR user_can('audiovisual.manage')`, sin visibilidad de línea. Realtime.

### `av_pauta_piezas`
- Checklist de piezas de una pauta 'realizada', una fila por pieza: `nombre`, `status`, `position`, `editor_user_id text` (sin FK; puede ser `ext:<uuid>` de `external_resources`), `prev_editor_user_id text`. FK `pauta_id→av_pautas` CASCADE.
- `prev_editor_user_id`: al quitar un editor en `RemoveEditorDialog.jsx` con "dejarlas sin asignar", guarda el editor previo para ofrecer devolvérselas (banner en `PautaDetailModal.jsx`); ningún trigger lo lee.
- `nombre` puede ir vacío: "Video #1", "Reel #2" se derivan en cliente (`piezaOrdinals`/`piezaDisplayName`, `utils/audiovisual.js`), nunca se persisten.
- Trigger `av_pauta_piezas_sync_counters` (AFTER INSERT/UPDATE/DELETE) → `av_pautas.piezas_editadas` = piezas con `status='listo'`.
- RLS: SELECT autenticados; escritura `user_can('audiovisual.coordina') OR (auth.uid()::text = any(av_pautas.recurso_ids) de la pauta referenciada)`. Realtime.

### `external_resources`
- Recursos externos (no empleados): `id, company_id, full_name, roles text[] ⊆{grabacion,edicion,ads}, deleted_at, created_at`. Sin FK a `users` (a propósito; no aparecen en Tareas, Líneas ni Evaluaciones).
- RLS `for all to authenticated using(true) with check(true)`. Sin realtime. Usada en Pautas (`AudiovisualView.jsx`); gestión en Empresa → Empleados (`ExternalResourcesView.jsx`).

### `av_workload_insight`
- Caché IA de carga de Audiovisual del Home (§2.14.1): `company_id text PRIMARY KEY`, `data jsonb` (respuesta OpenRouter o mensaje fijo "todo tranquilo"), `generated_at`, `generated_by`.
- RLS activa **sin políticas** (deny-by-default); solo `service_role` desde `netlify/functions/av-workload-insight.js` (gated `requireAdmin`).

#### Ads, reuniones, notificaciones, permisos

### `paid_campaigns`
- Pauta pagada (≠ `campaigns`, tácticas orgánicas). FK `client_id→metric_clients` (`ON DELETE SET NULL`); `client` = nombre snapshot. `responsable_id` texto sin FK (como `campaigns.assignee`; resuelto con `loadAdsResponsables()`). `created_by` ··→ users.
- Resultados `reach/interactions/followers/impressions/views/profile_visits` (`integer` nullable, sin CHECK): al pasar `status = 'Finalizado'` se captura ≥1 de los 6 (§5). `results_pending`.
- RLS: SELECT autenticados; escritura `user_can('ads.manage')`. Realtime (`supabase_realtime`).
- Gotcha: se creó como tabla `ads` y se renombró.

### `meetings`
- Reuniones (§2.11). FK `client_id→metric_clients` (SET NULL; `client_name` snapshot), `line_id→metric_lines` (SET NULL; snapshot de la línea del cliente). Varias marcas: `client_ids[]`/`client_names[]`, `line_ids[]`.
- `attendee_ids text[]` sin FK; `created_by` ··→ users.
- `status`: `programada`/`realizada`/`cancelada` (manual). Al `realizada`, opcionales `minuta_url` (link Drive) y `minuta_text` (resumen).
- Triggers + cron de notificación. RLS: SELECT autenticados; escritura `user_can('reuniones.manage')`. Realtime.

### `notifications`
- In-app y correo. `user_id` ··→ users (sin FK). `entity_type`/`entity_id`: `task`→`tasks.id`, `project`→`projects.id`, `client`→`metric_clients.id`, `employee`→`users.user_id`, `meeting`→`meetings.id`.
- Índice único parcial sobre `dedupe_key` (idempotencia de notificaciones de fecha).
- RLS: lectura/actualización solo destinatario (`auth.uid()::text = user_id`). Realtime.

### `notif_cron_runs`
- Observabilidad de `enqueue_date_notifications()` (§2.9): `ran_at, notifications_inserted, errors_count, error_sample, ok`.
- RLS: SELECT solo `access_level ≥ 4`; sin INSERT policy (escribe solo la función SECURITY DEFINER).

### `module_permissions`
- Acceso por módulo (DNF: OR de grupos AND). Una fila por `(company_id, module_key)`. `rules jsonb`: `{"rules":[{"all":[{"type":"department","ids":[...]},{"type":"min_level","value":N},...]},...]}`. Sin filas = módulo abierto.
- RLS: SELECT `authenticated`; escritura solo `is_company_admin()` (SECURITY DEFINER).

#### Otros

### `projects`
- Proyectos; fases/tareas en `phases jsonb` (3.4). Independiente: team/members/departments son text/arrays sin FK.

### `leads`
- Formulario de contacto web: `nombre, empresa, telefono, email, servicios text[], objetivo, mensaje, source, tipo_pagina`; altas vía `service_role`. Sin `company_id`.
- Seguimiento: `status` (`pendiente`/`contactado`/`cancelado`, default `pendiente`), `updated_at`, `updated_by`→`users`.
- RLS: SELECT/UPDATE `leads_can_access()` (admin o `access_level >= 3`); sin INSERT/DELETE (§2.12).
- Gotcha: tabla base preexistente (sin `CREATE TABLE` propio).

### `ceo_analysis`
- Caché del análisis ejecutivo IA del Home (§2.2): una fila por `company_id` (UNIQUE), `data jsonb` (respuesta Gemini), `generated_at`, `generated_by`.
- RLS **sin políticas** (deny-by-default, datos financieros/estratégicos); solo `service_role` de `netlify/functions/ceo-analysis.js` (allowlist de `user_id` + tenant-check).

### `mappi_chat_logs`
- Log del chat MAPPI (§2.14): `company_id text`, `user_id uuid`, `question`, `reply`, `tools_used text[]`, `outcome` (`respondida`|`sin_cobertura`|`error`|`timeout`), `created_at`.
- Escribe `netlify/functions/_lib/aiChatLog.js` (service-role) al cerrar cada request de `ai-chat.js`. RLS: sin insert para `authenticated`; SELECT admins de la misma empresa (`MappiLogsView.jsx`, Empresa → MAPPI).

### `anonymous_feedback`
- Buzón anónimo (§2.8bis): `company_id text`, `type` (`recomendacion`|`error`), `area` (opcional), `message`, `status` (`nuevo`|`en_revision`|`resuelto`|`descartado`, default `nuevo`), `admin_note`, `created_at`, `updated_at`. **Sin columna de autor** (a propósito).
- RLS: INSERT `authenticated` (`with check (true)`); SELECT/UPDATE admins de la misma empresa; sin DELETE.

### `teams`, `team_members`
- **LEGACY — inertes.** Reemplazadas por `metric_lines`.

#### Finanzas (§2.15)
Común: RLS SELECT `user_can('finanzas')`; todas bloqueadas por trigger `fin_block_closed_month()` si el mes está cerrado.

### `fin_months`
- Unidad de cierre: `company_id text, year, month, closed, closed_at, closed_by→users, summary_only` + columnas `pct_*`; unique `(company_id, year, month)`.
- RLS escritura (INSERT/UPDATE): `user_can('finanzas.cerrar_mes')`.

### `fin_invoices`
- `month_id→fin_months` (cascade), `client_id→metric_clients` (set null; nulo = cliente externo), `client_name` snapshot, `concept, amount, currency, recurring`.
- Escritura: `user_can('finanzas.facturacion.manage')`. Reconciliada por `syncMonthInvoices()`.

### `fin_payments`
- Abonos: `invoice_id→fin_invoices` (cascade), `paid_on, amount, method, note`. Estado de factura derivado de pagos (no es columna).
- INSERT/DELETE: `user_can('finanzas.cobros.manage')`.

### `fin_distributions`
- Reparto del cobro y pagos contra partidas: `month_id→fin_months` (cascade), `partida` (`gastos`|`socios`|`ganancia`; además `'cambio'` generada por `fin_fx_sync()`), `kind` (`in`=asignación desde cobro o ajuste | `out`=pago/egreso), `moved_on, concept, beneficiary, amount, invoice_id→fin_invoices` (set null).
- Escritura: `user_can('finanzas.distribucion.manage')`.

### `fin_month_totals`
- Una fila por mes (`month_id→fin_months`, cascade, PK): totales de un **Mes resumen** o snapshot de divisas de un mes normal al cerrar. `total_facturado, total_cobrado, total_gastos, total_socios, total_ganancia` (`check >= 0`), `note, created_by→users`, `total_divisa_fisica, saldo_bs, saldo_bs_usd_ref, resultado_cambio` (sin check).
- Escritura: `user_can('finanzas.cerrar_mes')`.

### `fin_invoice_exclusions`
- Marcas cuya facturación se borró a propósito para que `syncMonthInvoices()` no la recree; aplica de ese mes en adelante. `company_id, client_id→metric_clients` (cascade), `year, month`; unique por los cuatro.
- INSERT/DELETE: `user_can('finanzas.facturacion.manage')`.

### `fin_rates`
- Tasa BCV por fecha (carga manual): PK `(company_id, rate_date)`, `rate_bcv, created_by→users`. Helper `fin_rate_bcv(company, date)` (`stable`): la más reciente con `rate_date <= date`.
- INSERT/UPDATE: `user_can('finanzas.distribucion.manage')` (sin capability propia).

### `fin_fx_operations`
- Compra/venta de divisas: `company_id, month_id→fin_months` (cascade), `op_type` (`compra`|`venta`), `moved_on, amount_bs, amount_usd, rate_real` (generated `amount_bs/amount_usd`), `rate_bcv, counterparty, purpose, note, created_by→users`.
- **Inmutable**: sin UPDATE; corregir = borrar y re-registrar (el `on delete cascade` limpia derivadas sin resync).
- Trigger `fin_fx_sync()` (`AFTER INSERT`, `SECURITY DEFINER`) crea la fila del ledger y, si hay brecha, una `fin_distributions` con `partida='cambio'`.
- INSERT/DELETE: `user_can('finanzas.distribucion.manage')`.

### `fin_bs_ledger`
- Libro único ACUMULADO de la Caja Bs (no se cierra por mes): `company_id, month_id→fin_months` (cascade), `moved_on, kind` (`in`|`out`), `source` (`cobro`|`venta_divisa`|`compra_divisa`|`pago_directo`|`ajuste`), `amount_bs, rate, amount_usd_ref`, `payment_id`/`fx_operation_id`/`distribution_id` (cascade; exactamente uno según `source`, ninguno si `ajuste`), `concept, created_by→users`.
- Generada por triggers `SECURITY DEFINER` sobre `fin_payments`/`fin_fx_operations`/`fin_distributions` (no pasan por RLS).
- INSERT/DELETE manual solo el ajuste (`source='ajuste'`, sin FK de origen, mes abierto) con `user_can('finanzas.distribucion.manage')`.

### 3.2 Tablas externas (base compartida, sin `CREATE TABLE` en el repo)

`users` · `departments` · `positions` · `vacations` · `questions` · `question_positions` · `question_tags` · `evaluation_sessions` · `evaluation_responses` · `evaluation_comments` · `campaigns` · `support_tickets` · `ticket_comments`. Esquema detallado: `docs/MIGRATION_EVALUACION.md`.

### `users` (columnas añadidas)
- `monthly_salary numeric`: sueldo mensual USD; editable solo nivel 4 / admin (`isFinancePrivileged`); precarga Sueldos de `FinanzasView`.
- `deleted_at timestamptz`: `NULL` = activo; no-`NULL` = archivado (nunca se borra). Índice parcial `users_active_idx` en `(company_id) WHERE deleted_at IS NULL`. Gestionado por `netlify/functions/archive-employee.js` (banea/desbanea en `auth.users`). Excluidos de `notif_client_recipients()`/`enqueue_date_notifications()`.
- Filtrar archivados con `src/lib/employees.js#activeEmployees` en selectores/conteos, no en loaders (para resolver nombres en historial).
- Gotcha: `users` NO está en `supabase_realtime` (pendiente).

### `positions` (columnas añadidas)
- `position_description text` (Empresa › Departamentos, modal de cargo); `position_functions jsonb` default `[]` (array de strings, bullets en `EmployeeInfoModal`).

### `vacations`
- Base: `id`/`user_id`/`start_date`/`end_date`/`created_at`.
- `status` `NOT NULL DEFAULT 'tentative'`, `CHECK (status IN ('tentative','confirmed','rejected'))`. Gotcha: valores legados (`pending`/`programmed`/`approved`/`fulfilled`/`completed`/`programado`) ya fueron normalizados; no usarlos.
- `company_id` (backfill desde `users.company_id`) — no se usa para filtrar; scoping por `user_id` (`src/lib/vacations.js`).
- Índice `vacations_user_id_start_date_idx` en `(user_id, start_date)`. RLS: las 4 operaciones restringidas a `authenticated`.
- En `supabase_realtime` (canal `empresa-empleados-changes` de `EmployeesView.jsx`). `VacationsDialog.jsx` recibe `onChange` para que el padre refresque `loadVacations`, `loadTodayVacations`, `loadPanelVacations` sin depender solo de realtime.

### 3.3 Diagrama de relaciones

```
users (user_id PK)
  ├─ department_id ──→ departments(department_id)
  └─ position_id   ──→ positions(position_id)   positions.department_id ──→ departments
vacations.user_id ──→ users
questions ─── question_positions(question_id, position_id──→positions) · question_tags(question_id)
evaluation_sessions
  ├─ manager_id / employee_id ──→ users
  └─── evaluation_responses(evaluation_id, question_id──→questions) · evaluation_comments(evaluation_id)

metric_lines (id PK)
  ├─── metric_clients.line_id (SET NULL) · metric_reports.line_id (CASCADE)
  ├─── cnp_requests.line_id / meetings.line_id (SET NULL, snapshot) · tasks.team_id (··, sin FK)
  └─── metric_line_members(line_id, user_id ··→ users)
metric_clients (id PK)
  ├─── tasks / campaigns / paid_campaigns / meetings .client_id (SET NULL)
  └─── cnp_requests.client_id (CASCADE)
tasks: assignee_ids[] / assignee_id(DEPRECATED) / support_id / created_by ··→ users
cnp_requests: assignee_id / created_by / team_checked_by / print_approved_by ··→ users
campaigns: client_id ──→ metric_clients · created_by, assignee ··→ users
paid_campaigns: created_by, responsable_id ··→ users
meetings: attendee_ids[] / created_by ··→ users
support_tickets: requester_id / assigned_to ──→ users ─── ticket_comments(ticket_id, author_id──→users)
notifications.user_id ··→ users ; entity_id ··→ tasks | projects | metric_clients | users | meetings
projects: independiente
```
(Las tablas de Tareas Fijas, Chequeo, Audiovisual y Finanzas tienen sus FK en 3.1.)

### 3.4 Columnas jsonb

- `projects.phases`: `[{ id, name, tasks: [{ id, name, status }] }]`.
- `metric_reports.data`: `{ reuniones:{realizadas,meta}, productividad:{tareas:[]}, crecimiento:{items:[{clienteId,seguidoresGanados,seguidoresGanadosPrev,seguidoresActuales,seguidoresBase,meta}]}, solicitudes, pautas:{items:[]}, piezas, feedback:{items:[]}, finanzas:{ingresos:[],gastosOperativos:[],sueldos:[],otrosGastos:[]}, incompleto?:boolean }`.
  - `seguidoresGanadosPrev`: línea base del periodo anterior; editable si el reporte previo no lo tiene o en bootstrap (override guardado en el reporte actual).
  - `incompleto`: true → excluye el mes de promedio anual/ranking/cobertura/gráfico, pero acumula finanzas.
  - Gotcha: es lo **capturado**; 5 de 6 indicadores (todo salvo crecimiento) se re-derivan en lectura con `buildEffectiveReport` (§2.5 "Reporte efectivo"). Converge al abrir Resumen/Operaciones (auto-persistencia) o al guardar.
- `metric_reports.data.finanzas.ingresos`: auto-sembrados desde `metric_clients.monthly_fee` → `{ id:"ing-<clientId>", clienteId, descripcion, monto }`; manuales con `clienteId: null`. `syncReportClients` reconcilia ligados (preserva monto editado, agrega nuevos, descarta salidos) y conserva manuales.
- `metric_reports.data.finanzas.gastosOperativos`: `{ id, descripcion, monto, clienteId? }`; `monto` número o `null`. `calcConsolidado(report, lineClients)` (`metricsFinance.js`) arma "Consolidado de gastos" por cliente.
- `metric_reports.data.finanzas.sueldos`: auto-sembrados desde `users.monthly_salary` → `{ id:"sue-<userId>", empleadoId, descripcion, monto }`; manuales con `empleadoId: null`. Reconciliados por `syncReportClients`. Visible solo nivel 4 / admin (`isFinancePrivileged`).
- `metric_lines.metas`: `{ tareas: [{ nombre, meta }] }`.
- `metric_clients.social_links`: `[{ red, link }, ...]`.
- `metric_clients.contacts`: `[{ name, role, birth_day, birth_month }, ...]` (día 1–31, mes 1–12, sin año).
- `metric_clients.audiovisual_ids`: `[user_id, ...]` de empleados de Audiovisual (dept_id=2) de la línea del cliente; sin FK.
- `metric_clients.apoyo_ids`: `[user_id, ...]` de cualquier empleado de la empresa.
- `av_pautas.grabacion_por_formato`: `{"<formato>": {"<user_id>": n}}`.
- `cnp_requests.pieces`, `tasks.checklist`: checklists (forma no documentada aquí).
- `module_permissions.rules`, `positions.position_functions`, `ceo_analysis.data`, `av_workload_insight.data`: ver su tabla.
- No jsonb pero array: `tasks.assignee_ids` (`text[]`, `["user_id", ...]`).
