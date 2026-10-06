# Inicio (Home)

## Resumen
Landing personal tras login. Widgets: saludo + nivel; "Fechas del equipo y clientes" (calendario); "Análisis IA" (Gemini, allowlist de dirección); "Mis tareas" (como responsable, incluye card "CNP asignados"); "Mi línea" (nivel 3); "Apoyo de dirección" y "Resumen general" (nivel 4/admin, con salud de empresa y enlaces a Reportes/Tareas/Empresa); accesos rápidos a módulos habilitados. Además, modal global "Aviso de recursos archivados".
- Sin tabla propia: lee `tasks`, `cnp_requests`, `users`, `metric_clients`, `metric_lines`/`metric_line_members`, `metric_reports` (Inicio→Métricas) y `projects` del outlet context de `AppLayout`.

## Rutas y archivos
- `/` (ruta índice dentro de `AppLayout`).
- `src/pages/HomePage.jsx` (estado `calMonth`/`calDay`, patrón `EmployeesView.jsx`).
- `src/components/common/KpiCard.jsx` (card KPI compartida, patrón de AdsStats/SummaryCards).
- Calendario: `src/components/home/HomeDatesCalendar.jsx`, `src/components/home/HomeDayEventsModal.jsx`, `src/utils/homeCalendar.js` (`buildHomeCalendarEvents`, puro; `EVENT_TYPES`), íconos en `EventTypeIcon.jsx`.
- Análisis IA: `src/components/home/CeoAnalysisCard.jsx`, `src/lib/ceoAnalysisAccess.js` (allowlist compartida front/back), `netlify/functions/ceo-analysis.js`, `netlify/functions/_lib/ceoSnapshot.js` (agregación pura para el prompt).
- Recursos archivados: `src/utils/staleClientResources.js` (puro: `RESOURCE_FIELDS`, `staleResourceClients`, `resolvedValue`), `src/hooks/useStaleClientResources.js` (orquestación + escritura), `src/components/StaleClientResourcesModal.jsx`.

## Permisos
Página visible a cualquier autenticado (sin `RequireModule`); cada widget se gatea con `can()`/`access_level`:
- "Análisis IA" → `canSeeCeoAnalysis(userProfile)`: lista fija de 3 `user_id` (César Aldana, Jesús García, Juan Lauretta). **No** derivar de `admin`/`access_level` (hay admins que no deben verlo y un nivel 2 que sí).
- "Mis tareas" → `can('tareas')`.
- "CNP asignados" → `can('cnp')`: cuenta CNP no `Terminado` con `assignee_id === userProfile.user_id`; enlaza a `/cnp?view=base&assignee=<userId>`.
- "Mi línea" → `access_level === 3` (no director); sub-cards clientes/empleados además `can('empresa') && can('empresa.clientes' | 'empresa.empleados')`.
- "Apoyo de dirección"/"Resumen general" → `access_level >= 4 \|\| admin`.
- Accesos rápidos → `can(modulo.key)` por módulo de `MODULES`.
- `metric_reports` scoped por RLS (nivel 3 solo su línea vía `metric_line_members`); `metric_clients`/`metric_lines` lectura abierta, filtrado client-side por `line_id`/`member_user_ids`.

## Reglas de negocio
### Widgets de tareas y línea
- "Apoyo de dirección" = tareas activas con `support_id === userProfile.user_id` (§2.4). Atrasadas/activas con `isLate`/`isClosed` (`src/components/tareas/constants.js`).
- "Mi línea": línea vía `visibleLinesForUser` (`src/utils/lineMembers.js`); salud del mes cerrado con `monthLineScore` (`src/utils/metricsScore.js`); empleados = `line.member_user_ids`; clientes = `metric_clients.line_id` (vía `loadClients`). Mismo filtrado que `LinesView.jsx`.
- Director: salud de empresa con `aggregateMetricsDashboard` + `scoreDialColor` (§2.5) sobre el último mes cerrado; "Clientes activos"/"Líneas" salen de los mismos `clients`/`lines` (sin queries de conteo extra).

### Fechas del equipo y clientes
- Debajo del panel de bienvenida; calendario mensual navegable calcado de `empresa/EmployeeDatesCalendar.jsx`/`EmployeeDayEventsModal.jsx` (grid, pills, puntos móvil, leyenda).
- 5 tipos de evento:
  - Equipo MDN: `birthday`/`anniversary` vía `buildEmployeeCalendarEvents` (`employeeCalendar.js`) filtrado; **sin** fin de prueba ni vacaciones (exclusivo de Empresa → Empleados).
  - Clientes (`metric_clients`): `client_anniversary` (`anniversary_date`, "Aniversario empresa"), `client_mdn_anniversary` (`mdn_since`, "Cliente MDN desde"), `client_contact_birthday` (`contacts[].birth_day/birth_month`). Labels de `ClientModal.jsx`/`ClientFichaContent.jsx`.
- Calculado en cliente; reutiliza `monthGridRange`/`projectRecurringDate` de `employeeCalendar.js`. **No** lee `notifications` (funciona aunque el cron §2.9 falle).
- **Sin restricción de línea**: todo empleado ve fechas de todos los clientes. Difiere a propósito de `notif_client_recipients()` (§2.9: miembros de línea + nivel 4). No existe capability para esto.
- `users`/`lines`/`clients` se cargan para cualquier logueado; `lines` no la usa el calendario sino la salud/conteos de línea.

### Análisis IA
- `CeoAnalysisCard.jsx` → `POST /api/ceo-analysis` (Bearer del usuario) al montar y con botón "Actualizar".
- `ceo-analysis.js`: `requireUser` + allowlist; caché en `ceo_analysis` (una fila por `company_id`, 24h).
- Regenerar: con `service_role` carga `metric_lines`, `metric_reports`, `tasks`, `metric_clients`, `paid_campaigns`, `leads`; agrega con `buildCeoSnapshot()` (reutiliza `metricsScore.js`/`metricsFinance.js`/`aggregateMetricsDashboard.js`/`tareas/constants.js`, mismos cálculos que la UI de Métricas); llama a Gemini `gemini-2.5-flash` (`responseMimeType: 'application/json'`) con `systemInstruction` fijo: semáforo, métricas clave, fortalezas, áreas de mejora, críticos con acción concreta. `upsert` por `company_id`.
- RLS `ceo_analysis`: activado sin políticas para `authenticated`/`anon` (deny-by-default); solo `service_role`.

### Aviso de recursos archivados (modal bloqueante)
- Para jefas de línea (`lead_user_id`): clientes de su línea con un empleado archivado (`users.deleted_at`) en `social_manager_id`, `designer_id`, `audiovisual_ids` o `apoyo_ids` de `metric_clients`. Cuentas sin línea ("Independientes") quedan fuera.
- El hook carga primero `loadLines`; si no lidera ninguna, no hace las otras dos queries.
- Reasignación dentro del modal (bloque por cuenta, `UserPickerSingle`/`UserPickerMulti`, candidatos `flattenAssignable(assignableUsers(...))` filtrados por `departmentId`), guarda con `updateClient` en cada cambio; requiere `empresa.clientes.manage` (jefas lo cumplen por `min_level >= 3`).
- No cierra con Escape ni clic en fondo; botón deshabilitado 5 s (`CLOSE_DELAY_SECONDS`, countdown como `ForgotPasswordPage.jsx`); descarte solo en memoria (no `localStorage`): reaparece en cada entrada mientras haya asignaciones obsoletas.
- Montado en `AppLayout.jsx` como tercer aviso global: `whatsNewEntries.length === 0 && !reportReminder.show && staleResources.show`.

## Gotchas
- `archive-employee.js` borra la fila de `metric_line_members` pero **no** limpia las asignaciones de equipo en `metric_clients`; por eso existe el aviso (si no, la hoja PDF "Clientes por social" §2.6 muestra a gente archivada).
- La capability `empresa.calendario.ver_todo` (y `canSeeClientDates`) fue eliminada; no reintroducir filtro por línea en el calendario.

## Conexiones
- Tareas (§2.4), CNP (card), Métricas/Reportes (§2.5), Empresa → Empleados/Clientes, Notificaciones (§2.9), PDF (§2.6), `AppLayout` (cola de avisos).
