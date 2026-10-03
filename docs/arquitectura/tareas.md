# Tareas / Teams (§2.4)

## Resumen
- Gestión operativa mensual de tareas por línea. Navegación por mes. 3 vistas: **Dashboard**, **Base** (registro maestro), **Stand-up**.
- Sin tab Panorama: el selector de línea tiene botón **"Todos"** (solo nivel 4/admin, default para ellos). Con "Todos": Dashboard muestra la cartelera global (`PanoramaView`); Base/Stand-up combinan tareas de todas las líneas visibles (`tasksForVisibleLines`) con filtro de línea.

## Rutas y archivos
- `/tareas` (vista en estado interno; `?view=base` fuerza Base). `TareasPage` lee `?team=` (preselecciona línea).
- Deep-links que lee `BaseView` desde la URL: `?assignee=<userId>`, `?support=<userId>` (apoyo de dirección), `?status=`, `?fAlert=late|drag|cont|ok`, `?client=<id>` (UUID de `metric_clients`, pill removible). Los usa Inicio (§2.2, cards "Mis tareas"/"Apoyo de dirección") y Reportes (`ClientFichaModal`).
- `src/pages/TareasPage.jsx` · `src/components/tareas/PanoramaView.jsx` · `TeamView.jsx` · `BaseView.jsx` · `StandupView.jsx` · `TaskModal.jsx`
- `src/components/tareas/taskStatus.js` (`statusUpdatePatch`, `updateTaskStatus`) · `src/components/tareas/taskChecklist.js` (`newChecklistItem`, `clampItemDueDate`, `checklistProgress`)
- `src/utils/aggregateTaskMetrics.js` · `src/utils/lineFilters.js` (`tasksForVisibleLines`, `assignableUsers`, `crossLineUserIds`, `flattenAssignable`) · `src/utils/lineMembers.js` (`visibleLinesForUser`, `withDerivedGeneralMembers`) · `src/utils/rowClients.js` (`clientIdsOf`, `clientNamesOf`, `matchesClient`, `clientDisplayName`)
- `src/components/common/ClientPicker.jsx` (buscador + chips, compartido con Reuniones) · `UserPickerMulti` (`lockedIds`)

## Datos
- `tasks`: `id, company_id, team_id→metric_lines, client_id→metric_clients, client text (snapshot legado, sin FK), client_ids uuid[], description, source, assignee_ids text[] (múltiples responsables), assignee_id (DEPRECATED), support_id, created_by, request_date, due_date, closed_date, status, blocked_reason, checklist jsonb, created_at`.
- Status: `"En proceso" | "Por revisar" | "Paralizado" | "Pendiente" | "Terminado"`.
- `team_id` → `metric_lines.id` por convención, **sin FK formal**. Las tablas `teams`/`team_members` están inertes.
- **Varias marcas** `tasks.client_ids uuid[]` (mismo patrón que `meetings.client_ids`, §2.11): `client_ids uuid[]`. Los escalares `client_id`/`client` siempre = marca en posición 0 (los leen solo así: monitor de Uso, MAPPI, `employee-scores-snapshot.js`, `ceo-analysis.js`). Cliente opcional. Leer siempre vía `rowClients.js` (`BaseView`: 2 filtros de cliente, búsqueda y celda; `TeamView`: tarea multi-marca listada bajo cada marca; `StandupView`).
- **Checklist**: `tasks.checklist jsonb not null default '[]'`; ítem `{ id, title, assignee_id, due_date, done }`.

## Grupos especiales de línea (filas ocultas en `metric_lines`)
- **Independientes**: `is_general = true`, una por empresa, `sort_order` alto. Empleados sin línea real (dirección, IT, administración…), nivel < 4.
- **Alta Gerencia**: `is_management = true`, una por empresa (índice único parcial `metric_lines_one_management_per_company`). Empleados sin línea con `access_level >= 4`; aísla sus tareas de los independientes.
- Ambas sembradas por `seedMetricsIfEmpty` en empresas nuevas.
- Su `member_user_ids` **no se persiste** en `metric_line_members`: `withDerivedGeneralMembers(lines, users)` en `TareasPage.jsx` = empleados activos − miembros de líneas reales (`crossLineUserIds`), repartido por nivel (≥4 → Alta Gerencia, resto → Independientes). Se recalcula en cada carga/realtime (suscrito también a `metric_line_members`); asignar a alguien a una línea real lo saca del grupo automáticamente.
- Solo `TareasPage.jsx` carga con `loadLines(companyId, { includeGeneral: true, includeManagement: true })`; el resto de módulos usa el default (`includeGeneral: false`, `includeManagement: false`) y no las ve.
- Botones sujetos a `visibleLinesForUser` como cualquier línea. Al elegirlas se oculta Dashboard (`isNonOperational = activeTeam?.is_general || activeTeam?.is_management` filtra `VIEWS`) y se entra a Base con responsables visibles (no tienen clientes ni semáforo).
- Ambas excluidas del autocierre mensual de reportes (`enqueue_metric_report_closures()`).

## Asignables transversales
- Quien no está en ninguna línea real es asignable **desde cualquier línea**. `assignableUsers(users, team, allLines, currentUserId)` → `{ members, crossLine }` (miembros de `team` + pool `crossLineUserIds(users, allLines)`). `flattenAssignable(...)` aplana para pickers y anota sufijo `· Independiente` o `· Alta gerencia` (`access_level >= 4`).
- **Contrato:** `allLines` = TODAS las líneas de la empresa, no las visibles; si no, un miembro de línea fuera de alcance parece "sin línea". Por eso `TareasPage.jsx`/`CnpPage.jsx` guardan estado `allLines` aparte de `teams`, poblado antes de `visibleLinesForUser`.
- Consumidores: `TaskModal.jsx` (responsables, encargado de checklist), `CnpModal.jsx` (responsable), `ClientModal.jsx` (Social/Diseñador/Audiovisual, §2.6).
- Para hacer a alguien transversal (p. ej. Juan Pedro Sierra): sacarlo de `metric_line_members`. Si además debe **ver** todo: `users.tasks_view_all` (flag creado para Katherine Mora). No afecta `metric_reports`, que sigue exigiendo `access_level ≥ 3` (`metrics_user_can_view()`, §2.5).

## Permisos
### RLS (`tasks_select`/`tasks_insert`/`tasks_update`/`tasks_delete`)
- Nivel 4/admin: todo.
- Nivel 2-3: SELECT/INSERT/UPDATE/DELETE donde `task_user_in_line(team_id)` (está en `metric_lines.member_user_ids`).
- Nivel 1: SELECT/UPDATE si `auth.uid()::text = any(assignee_ids)`, `support_id` o `created_by`; INSERT si está en `assignee_ids` **o** `created_by = auth.uid()::text`; DELETE denegado (incluso siendo creador).
- `tasks_select_checklist_assignee`: SELECT para el encargado de un ítem del checklist.
- Rama Independientes: `task_is_general_line(team_id)` + `task_user_has_no_line()` → nivel ≥2 sin línea opera tareas del grupo.
- Rama Alta Gerencia (helper `task_is_management_line(team_id)`): `task_user_access_level() >= 4 and task_is_management_line(team_id::text)` (no hay membresía persistida; se apoya en el nivel).
- Helpers SECURITY DEFINER: `public.task_user_view_all()`, `public.task_user_access_level()`, `public.task_user_in_line(p_team_id)`, más los tres de grupos.

### UI
- Nivel 1 solo ve **Base** (Dashboard/Stand-up ocultos); botón Eliminar oculto.
- `TareasPage.jsx` filtra líneas con `visibleLinesForUser(lines, userProfile)`: nivel 4/admin todas; nivel 1-3 solo donde están en `member_user_ids` (nivel 1 además solo sus tareas por RLS).
- Botón "Todos": predicado propio `access_level >= 4 || admin === true`, independiente de `visibleLinesForUser`/`tasks_view_all` (nivel 3 con `tasks_view_all` ve todas las líneas pero sin "Todos"; default = su primera línea).
- `TaskModal.jsx`, nivel 1: al crear arranca preseleccionado como responsable pero puede quitarse. Al editar una tarea que **no** creó (`task.created_by !== userProfile.user_id`) queda bloqueado en responsables (chip sin ×, `isCreator`/`lockedAssigneeIds`), porque `assignee_ids`/`support_id` son su única vía de UPDATE.

## Reglas de negocio
- **Status siempre manual**; el checklist no lo modifica (chip "N/M hechos" informativo).
- Fechas de ítems de checklist recortadas a `[request_date, due_date]` por trigger `trg_a_clamp_checklist_item_dates`.
- Trigger `trg_notify_checklist_assignees` inserta en `notifications` tipo `checklist_item_assigned` (diff OLD→NEW por id de ítem).
- Badge de estado rápido en `BaseView.jsx`: botón → dropdown en portal (`createPortal`) que cambia estado sin abrir modal (lógica en `taskStatus.js`).
- Orden por columna en `BaseView.jsx` (Cliente/Tarea/Estatus/Responsable/Apoyo/Solicitud/Entrega) y en `CnpBaseView.jsx` de CNP (Cliente/Título/Piezas/Responsable/Impreso/Solicitado/Estado): `sortKey`/`sortAsc`, `SortIcon`; copia local por archivo (igual que `LeadsTable.jsx`/`AdsList.jsx`, sin componente compartido). Default: más reciente primero (`request_date`/`created_at` desc). Estatus/Estado ordena por posición en `ESTADOS`; Impreso: sin-impresión < pendiente < aprobado; Cliente/Responsable/Apoyo por nombre resuelto, no id.
- Mover una marca de línea (`reassign_client_open_tasks`, §2.5) solo arrastra tareas de esa única marca (`cardinality(client_ids) <= 1`); las compartidas no se mueven.

## Gotchas
- `assignee_id` está DEPRECATED: usar `assignee_ids`.
- `client`/`client_id` escalares deben mantenerse sincronizados con `client_ids[0]`; hay consumidores que solo leen el escalar.
- No pasar líneas filtradas como `allLines` a `assignableUsers`.

## Conexiones
- Tareas → Empresa/Métricas: `client_id`/`client_ids` → `metric_clients`; `team_id` → `metric_lines`.
- Tareas → Notificaciones: `notify_task_assignees()` y checklist (§2.9).
- Tareas → Reportes: conteo de solicitudes/entregados (§2.5); Inicio/`ceo-analysis.js` y score de empleados leen `tasks`.
