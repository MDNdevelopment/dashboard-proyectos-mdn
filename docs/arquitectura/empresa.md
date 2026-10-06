# Empresa

## Resumen
Administración organizacional: departamentos, cargos, empleados, vacaciones, permisos/ausencias de RRHH, preguntas de evaluación, clientes, líneas operativas, recursos externos y accesos por módulo.

## Rutas y archivos
**Rutas:** `/empresa` · `/empresa/departamentos` · `/empresa/empleados` · `/empresa/preguntas` · `/empresa/clientes` · `/empresa/lineas` · `/empresa/permisos` (RRHH, `PermisosRrhhView.jsx`) · `/empresa/accesos` (accesos por módulo, `PermisosView.jsx`) · `/empresa/mappi` (backlog de huecos de MAPPI, `MappiLogsView.jsx`, capability `empresa.mappi`, ver §2.14 "Registro de huecos").

**Página:** `src/pages/EmpresaPage.jsx`.

**Componentes (`src/components/empresa/`):**
- `src/components/empresa/DepartmentsView.jsx` · `QuestionsView.jsx`
- Empleados: `EmployeesView.jsx` · `EmployeeModal.jsx` · `NewEmployeeDialog.jsx` · `AvatarUpload.jsx` · `TeamStatusCards.jsx` · `EmployeeDatesCalendar.jsx` · `EmployeeDayEventsModal.jsx` · `VacationsDialog.jsx` · `VacationsPanel.jsx`
- Recursos externos: `ExternalResourcesView.jsx` · `ExternalResourceModal.jsx`
- Clientes: `ClientsView.jsx` · `ClientModal.jsx`
- Líneas: `LinesView.jsx` · `LineModal.jsx` · `LineMetasModal.jsx` · `LineFichaModal.jsx`
- Accesos/RRHH: `PermisosView.jsx` (pestaña "Accesos") · `PermisosRrhhView.jsx` / `PermissionFormDialog.jsx` (pestaña "Permisos")
- Otros: `src/components/common/ConfirmDeleteDialog.jsx` · `src/components/metricas/EmployeePermissionsBlock.jsx` (historial de permisos en la ficha del empleado)

**Lib / utils:**
- `src/lib/employees.js` (`activeEmployees`)
- `src/lib/vacations.js` (`fetchVacationsInRange`, `fetchVacationsByYear`)
- `src/lib/employeePermissions.js` (`fetchPermissionsByMonth`, `fetchPermissionsForEmployee`, `createPermission`, `deletePermission`)
- `src/utils/employeeCalendar.js` (lógica pura: `buildEmployeeCalendarEvents`, `monthGridRange`, `EVENT_TYPES`, `resolveVacationStatus`, `vacationDays`)
- `src/utils/employeePermissions.js` (lógica pura: `aggregatePermissionsByMonth`, `permissionInMonth`, `permissionDaysInMonth`, `PERMISSION_TYPES`)
- `src/utils/lineFilters.js` · `lineMembers.js` · `src/utils/clientInMonth.js` · `src/utils/clientsPerMonth.js` · `src/utils/employeeInMonth.js` (`employeeActiveInMonth`)
- Export: `src/utils/exportClientsToPdf.js` (jsPDF; `buildClientColumns`, `computeClientSheetLayout`, `renderClientSheet`)
- `src/lib/permissions.js` (`canViewEmployeeFicha`)

**Netlify functions:** `netlify/functions/create-employee.js` (`/api/employees`, service role + invite Supabase Auth) · `netlify/functions/archive-employee.js` (`/api/employees/manage`, service role).

## Datos
- `departments` · `positions` · `users` (empleados) · `vacations` · `metric_clients` · `metric_lines` · `metric_line_members` (N:M línea↔empleado) · `module_permissions` · `external_resources`.
- `questions` + `question_positions` + `question_tags`: banco de preguntas del flujo manual de Evaluaciones, retirado en F6 → solo lectura (§2.7).
- `users`: `deleted_at` (soft delete), `baja_incluye_mes` (default `true`), `on_probation` (bool, default false), `birth_date`, `hire_date`, `monthly_salary`, `access_level`, `admin`, `first_name`.
- `metric_clients`: `deleted_at`, `contract_end`, `contract_end_reason`, `baja_incluye_mes`, `mdn_since`, `created_at`, `social_manager_id`.
- `metric_lines`: `sort_order`, `lead_user_id` (jefa); miembros expuestos como `line.member_user_ids`.
- `vacations`: `start_date`, `end_date`, `status` (vocabulario abierto, ver Gotchas).
- `employee_permissions`: `id, user_id→users, company_id, type ('permiso'/'ausencia'/'reposo'/'llegada_tarde'/'salida_temprana'), start_date, end_date, event_time, reason, created_by, created_at`. Análogo a `vacations` pero sin status tentativa/confirmada.
- RPC `users_on_vacation_today` (`security definer`): devuelve solo los user_id de vacaciones hoy, sin fechas ni estado.
- Realtime: canal `empresa-empleados-changes` (incluye `vacations`) · canal `empresa-permisos-changes` (`employee_permissions`).

## Permisos
- Departamentos / Empleados (ver tab) / Preguntas / Accesos: solo `admin`.
- Clientes / Líneas: `access_level ≥ 2`.
- Capabilities RRHH vía `module_permissions` (admin siempre pasa):
  - `empresa.empleados.manage`: crear/editar/archivar empleado (seed `min_level 4` + grant por `user_id` a Sofía Lauretta, Coord. de Desarrollo Laboral, `admin = false`).
  - `empresa.vacaciones.manage`: leer y escribir vacaciones (mismo seed).
  - `empresa.empleados.sensible`: ver sueldos y niveles de acceso (mismo seed), además de `admin`/`access_level ≥ 3` (criterio de `isFinancePrivileged`).
  - `empresa.permisos`: ver reporte de permisos RRHH (`min_level 3`).
  - `empresa.permisos.manage`: registrar/editar/eliminar permisos (`min_level 4` o `user_id` de Sofía Lauretta).
- Asignar `access_level`/`admin` a otro empleado: solo admin (toggle y selector ocultos en `EmployeeModal`/`NewEmployeeDialog`). `create-employee.js`/`archive-employee.js` usan `requireCapability(event, 'empresa.empleados.manage')` (no `requireAdmin`) con clamp server-side de `admin`/`access_level` si el caller no es admin.
- RLS `vacations`: SELECT/INSERT/UPDATE/DELETE exigen `user_can('empresa.vacaciones.manage')`.
- `users` select de `loadAll` usa columnas explícitas (no `*`); `monthly_salary` solo se pide si `canSeeLevels`.
- Ficha de empleado: nivel 1-2 solo la propia; nivel ≥3/admin todas (`canViewEmployeeFicha`). Si se monta igual `EmployeeFichaContent`, muestra aviso en vez de datos.
- Finanzas en ficha de línea: solo nivel 4/admin (`isFinancePrivileged`).

## Reglas de negocio

### Empleados (`EmployeesView`)
- Modo activos (default): `deleted_at IS NULL`; botón "Eliminar" por card (no para uno mismo) → `ConfirmDeleteDialog` pidiendo nombre completo. Toggle "Ver eliminados" → badge "Eliminado" + "Restaurar". Ambas llaman `/api/employees/manage` con token de sesión.
- Baja = soft delete: marca `users.deleted_at` y banea login en `auth.users` (`updateUserById(..., { ban_duration })`); reversible. No borra el registro (preserva `tasks`, `meetings`, `paid_campaigns`, `evaluation_sessions`, sueldos de reportes cerrados). Borra sus filas de `metric_line_members`. No limpia asignaciones en `metric_clients` (ver Conexiones).
- El diálogo de baja pregunta si el mes de salida aún cuenta → `users.baja_incluye_mes` (espejo de `metric_clients.baja_incluye_mes`), consumido por `employeeActiveInMonth` (§2.5).
- Eliminado: `AuthContext.fetchUserProfile` cierra sesión ("cuenta deshabilitada" en `LoginPage`); sale de selectores/conteos (`activeEmployees`), pero su nombre se sigue resolviendo en tareas/reuniones/evaluaciones previas.
- Período de prueba (`users.on_probation`): interruptor en `NewEmployeeDialog` (default on) y `EmployeeModal` (apagar = pasar a fijo). Chip "En prueba" (`bg-[#fff3e0] text-[#e65100]`), contador "N en prueba", toggle "Solo en prueba"; combinado con "Ver eliminados" muestra archivados que estaban en prueba. Se conserva al archivar. Sin RLS nueva.
- Recursos externos (`ExternalResourcesView.jsx`, bloque bajo la lista): personal contratado afuera (grabación/edición/ads); viven en `external_resources`, no en `users`; no aparecen en Tareas/Líneas/Evaluaciones, solo en Pautas (§2.4ter). Tarjeta + roles como chips, crear/editar/archivar/restaurar; hereda el gating de `empresa.empleados`.

### Tarjetas de estado (`TeamStatusCards.jsx`)
- Encima del calendario, solo en modo activos. "De vacaciones ahora" y "En período de prueba", siempre respecto a hoy (independiente del mes navegado). Presentacional, sin fetch propio.
- Vacaciones: solo si `canManageVacations` (prop `showVacations`, default `true`). Dato de `loadTodayVacations` → `fetchVacationsInRange(userIds, todayKey, todayKey)`, filtrado a `resolveVacationStatus() ∈ {confirmed, tentative}`; tentativas con borde punteado y badge ámbar "tentativa".
- Prueba: derivada de `activeEmployees` (mismo pool que el contador del toolbar).

### Calendario de fechas (`EmployeeDatesCalendar.jsx`)
- Solo modo activos. Grid mensual con date-fns, calcado de `pautas/AvCalendar.jsx`; presentacional (los datos los carga `EmployeesView`).
- `EVENT_TYPES` (5): cumpleaños (`birth_date`), aniversario (`hire_date`), fin de prueba (derivado `hire_date + 30 días`, `PROBATION_DAYS`, mientras `on_probation`; no hay columna), inicio de vacaciones (`vacations.start_date`) y regreso (`end_date + 1`) — solo esos dos días, no el rango.
- Fechas proyectadas por aritmética de strings sobre `yyyy-MM-dd`, nunca `new Date(string)` (desfase UTC−4).
- `resolveVacationStatus` → `'tentative' | 'confirmed' | 'completed' | null`; filtro por negación con `EXCLUDED_VACATION_STATUSES = ['rejected']`.
- Vacaciones del mes vía `fetchVacationsInRange`; el handler realtime de `vacations` en `empresa-empleados-changes` recarga este fetch y el de `TeamStatusCards` (no `loadAll()`).
- Botón "Solo vacaciones" filtra pills a inicio/regreso.
- Clic en día (o pill, decorativa) → `EmployeeDayEventsModal` (layout de `DayPautasModal.jsx`), solo lectura: label, badge de tipo, `detail` ("N años", "prueba vencida"). Nunca navega a `EmployeeInfoModal`.

### Vacaciones
- `VacationsDialog.jsx` (por empleado, ícono calendario de su card): bloques "Próximas y en curso" (`end_date ≥ hoy`, asc) e "Historial" por año (`AAAA · N períodos · N días`, colapsable, colapsado salvo año en curso). Comparación de strings `yyyy-MM-dd`. Cada fila muestra días totales (`vacationDays`, inclusivo).
- `handleCreate` bloquea si el rango se solapa con otro del mismo empleado. Escribe `tentative`/`confirmed` (crear/confirmar/revertir/eliminar).
- Borrado: `ConfirmDeleteDialog` pide fecha de inicio en `dd/mm/aaaa`; el mensaje nombra el año y avisa si ya pasó.
- Sin `empresa.vacaciones.manage`: no se ve botón "Vacaciones" (`EmployeeCard`, prop `canVacations`), ni tarjeta "De vacaciones ahora", ni `VacationsPanel`, ni pills de vacaciones; `loadVacations`/`loadTodayVacations`/`loadPanelVacations` devuelven `[]` sin consultar.
- `VacationsPanel.jsx` (colapsable bajo `TeamStatusCards`, solo activos, sin ruta/permiso propio): todas las vacaciones de un año (`fetchVacationsByYear`, selector fijo de 5 años alrededor del actual), filtros por equipo (`lineOfMember`) y estado; fila abre el `VacationsDialog` de la persona; chip ámbar "coincide con N del equipo" si se solapan dos de la misma línea.

### Permisos RRHH (`PermisosRrhhView.jsx`)
- Tabla del mes (selector mes/año), una fila por empleado activo, una columna por `PERMISSION_TYPES` (Permisos/Ausencias/Reposos/Llegadas tarde/Salidas temprano; agregar tipo ahí agrega columna) + Días + fila TOTAL.
- Días recortados al mes (`permissionDaysInMonth`; un registro que cruza meses se reparte). Solo suman tipos `fullDay: true` (`PERMISSION_TYPES[key].fullDay`) (permiso/ausencia/reposo); `llegada_tarde`/`salida_temprana` son días trabajados con hora puntual.
- "+ Registrar novedad" solo con `empresa.permisos.manage`. Clic en fila → `PermissionFormDialog` con historial de esa persona (editar/eliminar); sin fila fija sirve para registrar con selector de empleado.
- Tipos `hasTime` (llegada_tarde/salida_temprana): campo Fecha + Hora (`event_time`, `<input type="time">`), guarda `end_date = start_date`.
- Solapamiento: solo advierte si es del mismo tipo; no bloquea entre tipos distintos.
- Historial también en `EmployeePermissionsBlock.jsx` dentro de `EmployeeFichaContent.jsx`, gateado por `can('empresa.permisos')` (visible en `EmployeeInfoModal` y drill-down de `LineFichaModal`).

### Clientes (`ClientsView`)
- Carga todos incl. archivados (`loadClients({ includeArchived: true })`). Modo Actual: activos (`deleted_at IS NULL`); "Ver archivados" → Restaurar (limpia `contract_end`/`contract_end_reason`).
- Archivar = soft delete (`deleteClient(clientId, { incluyeMes, contractEnd, reason })`): pide fecha real de fin (default hoy → `contract_end`) y motivo opcional (`contract_end_reason`). Si la fecha cae en el mes actual, radio "Sí, facturó/trabajó" → `baja_incluye_mes=true` / "No, sacarlo también de este mes" → `false`; si es de un mes anterior, manda `contract_end` (texto informativo).
- Modo histórico: selector mes/año con `clientInMonth(client, year, month)`: alta (`mdn_since ?? created_at`) ≤ fin de mes y activo según baja — con `baja_incluye_mes=true` cuenta si baja ≥ inicio de mes; con `false`, si baja > fin de mes. Solo lectura (sin "Nuevo"/"Archivar"), chip "archivado".
- Panel "Clientes por mes" (modo Actual): activos/altas/bajas/neto por mes del año (`clientsPerMonth.js`, reutiliza `clientInMonth`, sin queries nuevas); meses con bajas se expanden con nombre y motivo.
- Deep-link `?line=<lineId>` preselecciona filtro por línea (leído una vez con `useSearchParams`, patrón `BaseView.jsx`).
- Botón "PDF" (modo Actual, sin gating de `canManage`; spinner mientras genera):
  - Todos los clientes activos (ignora filtros en pantalla) agrupados por `social_manager_id` (resuelto contra `employees`, solo `first_name`).
  - Una columna por línea (`lines` por `sort_order`): primero la jefa (`line.lead_user_id`), luego socials de `line.member_user_ids` alfabéticos. Socials sin línea (alfabéticos) y "Sin social asignado" al final de la última columna. Línea sin socials con cuentas no genera columna.
  - Social de vacaciones hoy → "(de vacaciones)" vía RPC `users_on_vacation_today`; si falla, sale sin la marca.
  - Formato hoja impresa: cuadrícula de 4 columnas, filas fijas de 17pt, nombre del social centrado en negritas en su fila, una fila por cuenta (`N. Nombre`, numeración reinicia por columna) con mitad derecha libre para marcar a mano, fila en blanco entre grupos, todas las celdas con borde (incl. vacías del pie).
  - Si una línea no cabe, continúa en la misma columna de la página siguiente (nunca en la vecina); líneas que exceden columnas por página pasan a la siguiente.

### Líneas (`LinesView` / `LineFichaModal`)
- Clic en card (no en controles) → `LineFichaModal`: nombre, color, contadores, Miembros y Clientes.
- Con `canManage`: miembros como chips con × (`removeLineMember` → `metric_line_members`) + selector para agregar/mover (`addLineMember`). Sin `canManage`: `EntityGridList` con toggle tarjetas/lista.
- Drill-down en un solo modal: `EmployeeFichaContent` / `ClientFichaContent` con "← Volver a {línea}". Escape sube un nivel (en raíz cierra); X cierra siempre. Miembros sin permiso de ficha aparecen deshabilitados.
- Finanzas del último período (mes más alto con reporte del año actual, `calcFinanzas`); reportes solo se cargan si es privilegiado.
- Carga on-mount: `loadCompanyEmployees` + `loadClients` + `loadYearReports` (`metricsApi`).
- Deep-link `?line=<lineId>` en `/empresa/lineas` abre la ficha al montar.

## Gotchas
- `vacations.status` no tiene vocabulario cerrado: además de `tentative`/`confirmed` hay datos legacy `pending`/`programmed`/`fulfilled`. Filtrar por negación (`rejected`), nunca por lista blanca.
- Nunca `new Date('yyyy-MM-dd')` en este módulo (UTC−4 corre el día).
- `vacations` tiene SELECT restringido; quien no tiene la capacidad recibe `[]` — por eso la hoja PDF usa el RPC `users_on_vacation_today`.
- `archive-employee.js` no limpia `metric_clients`: un archivado puede seguir asignado como recurso.

## Conexiones con otros módulos
- §2.2 Inicio: cards "Clientes de mi línea" / "Empleados de mi línea" usan los deep-links `?line=`. Aviso de recursos archivados asignados (hoja "Clientes por social"): `utils/staleClientResources.js`, `hooks/useStaleClientResources.js`, `components/StaleClientResourcesModal.jsx` obligan a la jefa de línea a reasignar.
- §2.5 Métricas/Reportes: `baja_incluye_mes`, `clientInMonth`, `employeeActiveInMonth`.
- §2.7 Evaluaciones: banco de preguntas legacy de solo lectura.
- §2.4ter Pautas/Audiovisual: consume `external_resources`; calendario calcado de `AvCalendar.jsx`.
- §2.14 MAPPI: `/empresa/mappi`.
- §5: convención de soft delete.
