# CNP (Contenido No Planificado)

## Resumen
Módulo para solicitudes de contenido no planificado de clientes (casi siempre por WhatsApp, con copy ya redactado y a veces referencias), separado de Gestión de Tareas (§2.4). Dashboard y Base con el look-and-feel de Tareas y el mismo selector de línea + período.
- Dashboard: KPIs clickeables (Solicitados, Entregados, Cumplimiento, Paralizados, Retrasados, Impresión pendiente) que navegan a Base filtrada vía `navigate(..., { state })` (como `TareasPage.jsx`; "atrás" vuelve al Dashboard); barra de pipeline por estado; tabla "por cliente" con semáforo cuyas filas navegan a Base filtrada por cliente.

## Rutas y archivos
- `/cnp`: host único; tabs Dashboard/Base vía `?view=`.
- Deep-link `?assignee=<userId>` leído por `CnpBaseView`.
- Chips de línea + pseudo-scope **"Mis CNP"** (`?team=__mine__`), visible solo si el usuario tiene algún CNP con `assignee_id` propio. Muestra TODOS sus CNP asignados (de cualquier línea); los chips de línea solo muestran los de esa línea (KPIs no se contaminan).
- La card "CNP asignados" de Inicio (§2.2) enlaza a `/cnp?view=base&team=__mine__&assignee=<userId>`.
- Usuario sin línea real visible (Independientes/Alta Gerencia derivadas) con CNP asignados: arranca en "Mis CNP" en vez de "No hay líneas creadas".
- `src/pages/CnpPage.jsx` (recorte por línea `scopedCnps`, ignora `assignee_id`).
- `src/components/cnp/`:
  - `src/components/cnp/CnpDashboardView.jsx`.
  - `CnpBaseView.jsx`: `initialFilter` con `status`/`clientId`/`assignee`/`print`/`alert` (patrón de `BaseView.jsx` de Tareas); `<select>` propio de Responsable.
  - `CnpModal.jsx`: recibe `teams` + `allLines` (pool transversal, ver "Asignables transversales" §2.4) + `defaultTeamId`; `<select>` de Línea que resetea cliente/responsable (patrón `TaskModal.jsx`), así "Nuevo CNP" funciona en vista "Todos". Snapshot local `liveCnp` para reflejar checks del servidor sin reabrir.
  - `src/components/cnp/cnpApi.js`: `canCloseCnp`, `closeBlockedReason`, `countCnpSolicitudesForLine`.
  - `constants.js`: reexporta `ESTADOS`/`COL_META` de Tareas; añade `cnpInMonth`, `cnpMonthStats`, `cnpPieceCount`, `cnpPiecesDelivered`, `resizePieces`, `relabelAutoPieces`, `autoPieceLabel` (puras; tests `src/test/cnpDashboardStats.test.js`, `src/test/cnpPieces.test.js`).
- Compartidos: `src/components/tareas/KpiCard.jsx`; `ClientPicker` (`src/components/common/ClientPicker.jsx`, con Reuniones/Tareas, antes en `src/components/reuniones/`); `src/utils/rowClients.js` (`clientIdsOf`/`clientNamesOf`/`matchesClient`/`clientDisplayName`).

## Datos
`cnp_requests` (soft delete con `deleted_at`):
- `id`, `company_id`, `line_id→metric_lines`, `client_id→metric_clients CASCADE (NULLABLE)` (= marca en posición 0, se conserva para MCP de solo lectura y SQL externo), `client_ids uuid[]` (`cnp_requests.client_ids uuid[]`: varias marcas, patrón `meetings.client_ids`/`tasks.client_ids`), `no_client_note text` (trabajo interno).
- `title`, `content`, `assignee_id`, `refs jsonb` (`{url,note}`), `notes`, `due_date`, `status`.
- `is_audiovisual boolean default false`, `is_print boolean default false`, `team_checked_at/by`, `print_approved_at/by`.
- `pieces jsonb default '[]'`: checklist `{id,label,done,custom,content}`, cada pieza con su copy. `[]` = 1 pieza que usa el `content` general (sin backfill).
- `created_by`, `created_at`, `updated_at`.
- Status (mismo ciclo que `tasks`): `"Pendiente" \| "En proceso" \| "Por revisar" \| "Paralizado" \| "Terminado"`.

## Permisos
- Capabilities: `cnp` (acceso); `cnp.manage` (crear/editar/eliminar; abierto a todos: grupo `{all: []}` pasa siempre, ver `matchCondition`/`groupPasses` en `permissions.js` y `user_can()`); `cnp.print.approve` (sin reglas amplias; asignada en Empresa → Accesos con `{"type":"user","ids":[...]}` a Paola Urdaneta y Stephanie Portillo; admins bypass, §1).
- RLS `cnp_requests`: SELECT abierto a autenticados. INSERT/DELETE: `user_can('cnp.manage')` + visibilidad de línea (`task_user_view_all()`/`task_user_in_line()`).
- UPDATE: lo anterior OR `assignee_id = auth.uid()::text` OR `task_is_general_line(line_id) and task_user_has_no_line()` (líneas generales sin membresía en `metric_line_members`). `with check` igual.
- Por ese `with check`, quien solo accede por ser `assignee_id` **no puede reasignar** (perdería acceso): `CnpModal` muestra Responsable como texto fijo y Línea deshabilitada (resuelta desde `allLines`).

## Reglas de negocio
- **Audiovisual**: toggle "¿Es audiovisual?" (antes de "¿Es impreso?") oculta Referencias e impresión/doble check; el submit fuerza `is_print: false` y `refs: []`.
- **Sin cliente**: checkbox "Sin cliente (trabajo interno)" deshabilita el picker y muestra input "¿Para quién?" (`no_client_note`, ej. "Favor para dirección"). Si no se marca, ≥1 cliente es obligatorio (UI, MCP y `NOT NULL` en BD condicionado a no marcar "sin cliente").
- **Varias marcas**: Base muestra "Marca A +1" y filtra con helpers de `rowClients.js`; el Dashboard cuenta un CNP en la fila de cada marca (la suma puede superar el total) y el trabajo sin cliente bajo su `no_client_note` (o "Sin cliente").
- **Doble check de impresión** (`is_print = true`), requerido para "Terminado":
  1. Revisión del equipo (`team_checked_at/by`, cualquiera con `cnp.manage`).
  2. Aprobación de impresión (`print_approved_at/by`, solo `cnp.print.approve`), operable solo con el check 1; desmarcar el 1 limpia el 2.
  - Validación en `canCloseCnp`/`closeBlockedReason`.
  - Trigger `notify_cnp_print_approved` (BEFORE UPDATE): al completarse el check 2 pone `status = 'Terminado'` y notifica a `created_by` (tipo `cnp_print_approved`, deep-link `/cnp?cnpId=`).

## Gotchas
- Un jefe puede asignar CNP a un diseñador de otra línea (pool de Responsable = todo el depto Diseño); sin "Mis CNP" serían invisibles porque `scopedCnps` no mira `assignee_id`.
- `pieces = []` no es "cero piezas": es 1 pieza.

## Conexiones
- **Reportes**: `OperacionesView.jsx` calcula «4. Solicitudes vs Entregados» (§2.5) con `cnp_requests` + `tasks`, 5 pts cada fuente, desde `SOLICITUDES_MODULE_START = {year:2026, month:9}`; `countCnpSolicitudesForLine` (`cnpApi.js`, filtra por línea, nunca cliente: el trabajo sin cliente cuenta) y `countTareasSolicitudesForLine` (`src/components/tareas/tareasMetricsApi.js`). Unidad CNP = **pieza** (`cnpPieceCount`/`cnpPiecesDelivered`, fila "CNP (piezas)"). Fuente sin solicitudes en el mes → sus 5 pts pasan a la otra (`calcSolicitudes` en `src/utils/metricsScore.js`).
- **MCP** (§2.13): personas de `MCP_WRITERS` usan `create_cnp`/`update_cnp`/`delete_cnp`. `create_cnp` acepta `client_ids`, `no_client_note`, `is_audiovisual` (`client_id` opcional). `update_cnp` aplica `closeBlockedReason` antes de `status: 'Terminado'` y nunca expone `team_checked_*`/`print_approved_*` (exclusivos del dashboard). `delete_cnp` = soft delete.
- **Inicio**: card "CNP asignados".
- **Tareas**: estados, `KpiCard`, helpers RLS `task_*`, "Asignables transversales".
