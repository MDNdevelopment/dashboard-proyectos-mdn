# Reuniones

## Resumen
Calendario compartido de reuniones (reemplaza listas por WhatsApp): crear/editar/reagendar/cancelar/eliminar reuniones asignadas a clientes/marcas y empleados, con notificaciones automáticas.

## Rutas y archivos
- Ruta: `/reuniones` (única, sin sub-tabs).
- `src/pages/ReunionesPage.jsx`: host, realtime, cards de resumen y filtros (`StatusSummaryCard` local).
- `src/components/reuniones/`:
  - `src/components/reuniones/CalendarView.jsx`: grid mensual a mano con `date-fns` (`startOfMonth/endOfMonth/eachDayOfInterval`, locale `es`); incluye `MeetingPill`, `DayMeetingsList`, `sortedMeetings`, `meetingDisplayName`, `dotColor`, `handleCellClick`.
  - `MeetingDetail.jsx`: vista solo lectura + acciones (patrón `AdsDetail.jsx`).
  - `MeetingModal.jsx`: formulario crear/editar (convención `undefined`/`null`/objeto, patrón `AdsForm.jsx`).
  - `AttendeePicker.jsx`: chips + botones rápidos por cargo.
  - `meetingsApi.js`: CRUD, `markMeetingHeld(id)`, `unmarkMeetingHeld(id)`, `cancelMeeting(id)`, `updateMeeting`, `deleteMeeting`, `resolveClientsSnapshot`, `countMeetingsHeldForLine`, `loadHeldClientIdsForLine`.
- `src/components/common/ClientPicker.jsx`: selector múltiple de marcas (buscador + chips, sin botones por cargo); compartido con Tareas y CNP (§2.4/§2.4quinquies).
- `src/utils/formatDate.js` (`fmtTime12`).
- `netlify/functions/_lib/mcpWriteMeetings.js` (escritura vía MCP).

## Datos
Tabla `meetings`: `id, company_id, title, client_id→metric_clients (SET NULL), client_name, client_ids uuid[], client_names text[], line_id→metric_lines (SET NULL), line_ids uuid[], starts_at, ends_at, modality ('presencial'|'videollamada'), location, meeting_url, notes, attendee_ids text[], status ('programada'|'realizada'|'cancelada'), minuta_url, minuta_text, created_by, created_at, updated_at`.
- Multi-marca: `client_ids`/`client_names`/`line_ids` son arreglos posicionales (índice `i` = misma marca en los tres), elegidos con `ClientPicker.jsx`, resueltos por `resolveClientsSnapshot`.
- `client_id`/`client_name`/`line_id` escalares siempre = marca en posición 0 (los leen el monitor de Uso en `metricsApi.js`, tools de MAPPI en `aiChatData.js`/`aiChatTools.js` y el MCP de solo lectura, que no leen arreglos).
- Snapshot desde `metric_clients` al crear/editar: si la marca cambia de línea luego, la reunión conserva la línea original (no falsea meses cerrados).
- Solo se persiste el campo de la modalidad activa (`location` o `meeting_url`; el otro `null`).
- `meetings.minuta_url` texto libre (sin validar dominio); `meetings.minuta_text` resumen corto opcional.
- Habilitada en `supabase_realtime`.

## Permisos
- Ver: cualquier autenticado (RLS SELECT abierto).
- Crear/editar/eliminar/cancelar: capability `reuniones.manage` (default `access_level ≥ 2`, como `tareas.manage`); RLS INSERT/UPDATE/DELETE con `user_can('reuniones.manage')`.
- En UI, `canManage` gatea solo las acciones de `MeetingDetail` (marcar, reagendar, cancelar, Editar/Eliminar); `handleMeetingClick` no está gateado.

## Reglas de negocio

### Estados
- `'programada'` (default) · `'realizada'` (marcado manual, sin automático por fecha) · `'cancelada'` (queda en el calendario, no se borra).

### Contador para Reportes → Operaciones
- `countMeetingsHeldForLine`: solo `status='realizada'` del mes, `.contains("line_ids", [lineId])`, deduplicado por `client_id` (máx. 1 por cliente; reuniones sin cliente cuentan cada una). Sin fallback por fecha vencida.
- Reunión con marcas de líneas distintas: cada línea solo suma las marcas cuya posición en `line_ids` es suya.
- `loadHeldClientIdsForLine`: misma query, devuelve el set de `client_id`; alimenta el modal de cobertura de `OperacionesView` (§2.5).

### Flujo ver → editar
- Click en pill o fila de `DayMeetingsList` → `MeetingDetail` (nunca el formulario directo). Estados separados en `ReunionesPage`: `viewMeeting` (`undefined`/objeto) y `modalMeeting` (`undefined`/`null`/objeto).
- "Editar" → `onEdit(meeting)` → `ReunionesPage.handleEditFromDetail` cierra el detalle y abre `MeetingModal`.

### Marcar realizada y minuta
- "Marcar realizada" marca al instante (`markMeetingHeld`); después se abre panel inline con input de link y `<textarea>` de resumen, ambos opcionales, un solo submit (`updateMeeting(id, { minuta_url, minuta_text })`). Editable siempre ("Agregar minuta"/"Editar minuta").
- Realizadas muestran link y/o resumen (o "Sin minuta") bajo Participantes.
- Desmarcar (`unmarkMeetingHeld`) directo, sin pedir nada.

### Reagendar / Cancelar / Eliminar (en `MeetingDetail`)
- Reagendar (ícono calendario): panel inline que exige nueva fecha/hora → `handleReschedule` → `updateMeeting(id, { starts_at, status: 'programada' })`; reactiva aunque estuviera `cancelada`/`realizada`.
- Cancelar (ícono X): `cancelMeeting` directo, sin fecha.
- `MeetingModal`: si se cambia la fecha de una reunión `realizada`, el guardado resetea `status` a `'programada'`.
- Eliminar en dos pasos: 1er click → "¿Confirmar?" (rojo) + botón "No"; 2º → `deleteMeeting` y cierra.

### Calendario (`CalendarView`)
- Reuniones de cada día ordenadas por `starts_at` en `sortedMeetings` justo antes de agrupar (la página agrega realtime/guardados al final sin reordenar).
- Desktop (`≥ sm`): hasta 3 pills (las más tempranas); click en pill → `onMeetingClick`; click en resto de la celda → crear con esa fecha.
- Móvil (`< sm`): puntos de color por reunión (cap 4 + "+N", `dotColor`); tocar día con reuniones abre `DayMeetingsList`, día vacío crea. Breakpoint resuelto con `window.matchMedia` al click (sin listener ni árbol JSX duplicado).
- Hora en 12h A.M./P.M. (`fmtTime12`, no `HH:mm`) en calendario, `MeetingDetail.jsx` y "Mis reuniones" de `HomePage.jsx`; los `<input type="datetime-local">` usan el locale del navegador.
- Texto de pill / `title` de puntos (`meetingDisplayName`, mismo criterio en `HomePage.jsx`): primera marca de `client_names` + "+N" si hay más; fallback `client_name`, luego `title`.
- Estilos de `MeetingPill` (y `dotColor`): `programada` futura = azul sin ícono; `realizada` = check verde; `cancelada` = X gris + tachado; `programada` vencida = triángulo rojo decorativo (click abre detalle). Vencida compara por día (`startOfDay`): una de hoy no se marca vencida hasta mañana.
- Íconos SVG de trazo fino (viewBox 16×16, sin relleno; no emoji). Solo el check de `realizada` es `<button>` con `stopPropagation` → `onToggleHeld` para desmarcar; marcar siempre pasa por `MeetingDetail`.
- Si `currentUserId` está en `attendee_ids`, la pill muestra ícono de persona; "+N más" también si alguna oculta lo incluye.
- "+N más" (más de 3) abre `DayMeetingsList` (estado local `expandedDay`): popup con todas las reuniones del día (`MeetingPill` con `truncateTitle={false}`); click en fila cierra y llama `onMeetingClick`.

### Cards de resumen y filtros (`ReunionesPage`)
- 3 cards (Agendadas/Completadas/Canceladas) del mes visible (`period.year`/`period.month`), sin aplicar filtros de modalidad/alcance. "Agendadas" = todas las del mes sin importar `status`.
- Click "Completadas"/"Canceladas" → `statusFilter` con toggle; click "Agendadas" → `statusFilter = "todas"` (sin toggle). Las cards son el único control de ese filtro.
- Dos `<select className="input-base">` (patrón de filtros dropdown de Tareas/Tickets/Ads, ver `BaseView.jsx`; no segmented control): modalidad (Todas/Presencial/Videollamada) y alcance (Todas/Solo las mías: `attendee_ids.includes(userProfile.user_id)`).
- Los 3 filtros se combinan en `calendarMeetings` (lo que recibe `CalendarView`, en vez de `meetings` crudo); no se restringe al mes visible (preserva días de desborde). Todo client-side.

### Participantes (`AttendeePicker`)
- Botones rápidos por `users.access_level` (no por `positions.position_name`, texto libre): "Solo directores" = 4, "Solo jefes" = 3, "Directores y jefes" = ≥3, "Solo coordinadores" = 2, "Directores, jefes y coordinadores" = ≥2, "Toda la empresa" = todos. Cada botón reemplaza la selección; "Quitar a todos".
- Buscador por nombre: agregados marcados con check verde (click alterna); solo se listan los ya agregados.
- Prop `hideQuickGroups` (default `false`): oculta botones rápidos; lo usa Audiovisual (`AgendaRow` en `AvPhaseTable.jsx`), Reuniones no.

## Gotchas
- Mantener sincronizadas las columnas escalares (posición 0) con los arreglos: hay consumidores que solo leen escalares.
- La escritura MCP tiene BYPASSRLS: snapshot posicional y exclusión de modalidad se reimplementan en SQL en `mcpWriteMeetings.js`; cambios a esas reglas en `meetingsApi.js` deben replicarse allí.

## Conexiones con otros módulos
- §2.5 Reportes/Operaciones: `countMeetingsHeldForLine`, `loadHeldClientIdsForLine`.
- §2.2 Inicio (`HomePage.jsx`): "Mis reuniones".
- §2.9 Notificaciones/correo: triggers `trigger_notify_meeting_attendees` notifican a asistentes (también con escrituras MCP). WhatsApp no implementado: sería una edge function nueva disparada por el mismo patrón de trigger sobre `notifications` que el correo.
- §2.13 MCP: `MCP_WRITERS` pueden `create_meeting`/`update_meeting`/`delete_meeting` (agendar/editar/reagendar/marcar/cancelar/eliminar).
- §2.4/§2.4quinquies Tareas y CNP: reutilizan `ClientPicker.jsx`. §2.4ter Audiovisual: `AttendeePicker` con `hideQuickGroups`.
- Uso (`metricsApi.js`) y MAPPI (`aiChatData.js`/`aiChatTools.js`): leen columnas escalares.
