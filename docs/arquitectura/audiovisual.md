### 2.4ter Pautas Audiovisual (Tareas — sub-sección Audiovisual)

## Resumen
- Calendario de pautas (grabaciones/sesiones) audiovisuales por cliente con flujo de aprobación: quien tiene `audiovisual.manage` SOLICITA (`solicitada`); la coordinadora AGENDA (`programada`) o DECLINA (`declinada`); al ejecutarse se marca `realizada` y se da seguimiento a la edición de piezas.
- Incluye: generador de agenda WhatsApp (semanal y por día), analítica de piezas/rendimiento por recurso, papelera (soft delete), recursos externos, control de disponibilidad de recursos, notificaciones y alimentación automática de Reportes.

## Rutas y archivos
- Ruta: `/tareas/pautas` (`PautasPage.jsx`), sub-link de Gestión de Tareas en el Sidebar.
  - Deep-link `?pautaId=<id>` (leído en `AudiovisualView.jsx`): abre `PautaDetailModal` y ajusta mes/pestaña/línea para que no quede oculta por filtros. Lo usa la campanita (`notifRoute`).
- Todo vive en `src/components/pautas/` (contenedor: `src/components/pautas/AudiovisualView.jsx`; las rutas viejas `src/components/tareas-fijas/audiovisual/` están obsoletas):
  - `AudiovisualView.jsx` — contenedor: estado, realtime de `av_pautas` y `av_pauta_piezas`, alcance por línea, pickers, `canViewAll`/`canEditPiezas`.
  - `AvCalendar.jsx` — grilla mensual (adaptada de `reuniones/CalendarView.jsx`).
  - `AvPhaseTable.jsx` — tabla por pestañas Solicitudes/Agenda/Realizadas/Papelera, edición inline; en Realizadas la fila es clickeable y muestra una sola columna «Piezas» con progreso (la edición vive en el modal). Contiene `DraftSolicitudRow`/`makeDraft`, `handleCreate`, `handleFields`.
  - `PautaDetailModal.jsx` — detalle + `GrabacionSection` (reparto de grabación por formato/persona) + edición de piezas (`PiezasSection`, `FormatoChecklistBlock`, `PiezaRow`, `LoteRow`). Layout panel flex-col igual que `ProjectDetailModal.jsx` (test: `src/test/modalLayout.test.jsx`).
  - `RemoveEditorDialog.jsx` — confirmación al quitar un editor con piezas: reasignarlas u ofrecer devolverlas después.
  - `DayPautasModal.jsx` — pautas de un día + agenda WhatsApp de ese día.
  - `WhatsAppAgendaModal.jsx` — agenda semanal. `WhatsAppTextPanel.jsx` — textarea + "Copiar" compartido por ambos modales.
  - `AvAnalytics.jsx`, `ResourceWarningDialog.jsx` (avisos de recursos).
  - `avPautasApi.js` — `loadPautas/createPauta/updatePauta/deletePauta/fetchPautasByDate`, `restorePauta`, `permanentlyDeletePauta` (`avPautasApi.deletePauta`/`restorePauta` = `UPDATE ... SET deleted_at = now()/null`; `avPautasApi.permanentlyDeletePauta` = DELETE físico), `loadPiezas/createPiezas/createLotePieza/updatePieza/deletePiezas`.
- Componentes comunes: `Stepper.jsx` (`src/components/common/`), `AttendeePicker`, `StatusPill`, `SummaryCard`, `ExtraBadge`, `DeleteButton`, `RestoreButton`, `ConfirmDeleteDialog.jsx`.
- Recursos externos (gestión): `ExternalResourcesView.jsx`/`ExternalResourceModal.jsx` en `src/components/empresa/` (Empresa → Empleados).
- `src/utils/audiovisual.js` (lógica pura): `grillaStatus`, `nextAgendaDeadline`, `avEditMode`, `briefComplete`, `pautasInMonth`, `piezasProgress`, `piezasByEditor`, `piezaUnidades`, `piezaListas`, `piezasUnidadesActivas`, `piezaOrdinals`, `piezaDisplayName`, `nextPosition`, `defaultLoteName`, `distributePiezas`, `planPiezaRemoval`, `FOTO_FORMAT`, `piezasPorFormato`, `setPiezaFormatoCount`, `piezasPorBucket`, `piezasBalancePorFormato`, `sumPiezasPorFormato`, `formatoBreakdownLabel`, `grabacionPorFormato`, `setGrabacionCount`, `grabacionBalance`, `grabacionResourceIds`, `hasGrabacionReparto`, `syncRecursoIds`, `aggregateResourcePerformance` (reemplaza a `aggregateByResource`), `aggregatePiezasByLine`, `editorLabel`, `unresolvedEditorUser`, `externalAsUser`, `canEditPiezasForPauta`, `PIEZA_STATUS_*`, `generateAgendaText`, `generateDayAgendaText`, `timeRangesOverlap`, `assumedEnd`, `resourceConflicts`, `RESOURCE_DAILY_LIMIT` (3), `ASSUMED_DURATION_HOURS` (3), `countPiezasForLine`, `sumPiezasVideoForLine`, `sumPiezasVideoBreakdownForLine`, `countPautasRealizadasByClient`.
- Otros utils: `src/utils/lineMembers.js` (`visibleLinesForUser`), `utils/lineFilters.js` (`effectiveLineId`, `pautasInScope`), `src/utils/notificationFormat.js`.

## Datos
### `av_pautas` (realtime)
- `id, company_id, client_id→metric_clients, client_name, line_id→metric_lines` (snapshot; `null` para cuentas sin línea), `tema, place, requirements, has_model, pauta_date, salida, llegada`.
- `formats text[]` ⊆ {V,R,F} (V = Video de marca/4K, R = Reel, F = Foto).
- `recurso_ids text[]` (sin FK): quienes graban (empleados del depto Audiovisual `department_id=2` o externos `ext:<uuid>`), selección múltiple.
- `attendee_ids text[]`, `link`, `grilla_delivered_at`, `piezas_desc`, `submitted`, `created_by` (text; `av_pautas.created_by`).
- `status`: `'solicitada'/'programada'/'realizada'/'declinada'`.
- `piezas_totales`: manual sin desglose; DERIVADO si hay desglose. `piezas_editadas`: siempre DERIVADO (trigger).
- `piezas_por_formato jsonb default '{}'` — p. ej. `{"R":{"salieron":3,"editadas":2}}`; validado por `av_pautas_valid_piezas_por_formato`.
- `extra boolean default false` — pauta fuera del plan mensual; se marca al crear/editar, `ExtraBadge` en solicitudes/agendadas/realizadas/calendario/detalle.
- `deleted_at` — soft delete (Papelera).
- Legacy sin UI: `graba_user_id`/`graba_other` (reemplazados por `recurso_ids`), `edita_user_id`/`edita_other` (editor único previo a `av_pauta_piezas`, solo histórico).
- Índice `av_pautas_company_date_idx` (usado por `fetchPautasByDate`).
- Trigger `av_pautas_sync_formato_counters`: con desglose, `piezas_totales`/`piezas_editadas` = suma del desglose.

### `av_pauta_piezas` (realtime)
- Checklist de piezas de una pauta `realizada`, repartidas entre varios editores.
- `id`, `pauta_id→av_pautas (on delete cascade)` (`av_pauta_piezas.pauta_id`), `company_id`, `editor_user_id text` (`av_pauta_piezas.editor_user_id`, sin FK: `user_id` de empleado o `ext:<uuid>`), `nombre` (default `Video #N`), `status` (`pendiente`/`en_edicion`/`espera_aprobacion`/`listo`/`cancelado`), `position`, `formato text null` ⊆ {V,R,F}, `es_lote boolean default false`, `cantidad int default 1` (≥1), `listas int default 0` (0≤listas≤cantidad).
- Índice único `(pauta_id, editor_user_id) where es_lote` — un solo lote por editor.
- Trigger `av_pauta_piezas_sync_lote` (BEFORE INSERT/UPDATE): fila normal → `cantidad=1` y `listas` derivada de `status`; lote → `status` derivado de `listas/cantidad` (0→`pendiente`, parcial→`en_edicion`, completo→`listo`).
- Trigger `av_pauta_piezas_sync_counters` (insert/update/delete): `av_pautas.piezas_editadas` = suma de `listas` (no conteo de filas); por formato, `piezas_por_formato[F].editadas` (y V/R) = unidades listas de ese formato, clampeada a `salieron`. No toca `piezas_editadas` si la pauta tiene desglose (lo hace el trigger de formato). No toca `piezas_totales`.

### `external_resources`
- `id, company_id, full_name, roles text[]` ⊆ {grabacion,edicion,ads}, `deleted_at, created_at`. Sin realtime (la vista recarga on-mount). Desacoplada de `users`.

## Permisos
Capabilities del módulo `tareas` (configurables en Empresa → Accesos; `PermisosView.jsx` deriva la UI de `capabilitiesForModule`):
- `audiovisual.manage` — solicitar/editar. Seed nivel 2+, pero abierto a todos los autenticados (`module_permissions.rules = []`).
- `audiovisual.coordina` — agendar/declinar/marcar realizada/editar fecha-recurso en cualquier línea. Seed: solo Lizdania + admin (bypass).
- `audiovisual.ver_todo` — ver pautas de todas las líneas. Seed: solo Lizdania. Coordinar NO implica ver todo.
- `audiovisual.piezas` — gestionar piezas/editores de realizadas (picker de editores, checklist, desglose por formato). Seed: todo el depto Audiovisual (`department_id=2`). No cambia `editMode` ni RLS.
- `audiovisual.notificaciones` — destinatarios de notificaciones (ver abajo); sin auto-pase de admin.
- Frontend (`AudiovisualView.jsx`):
  - `canViewAll = access_level≥4 || admin || can('audiovisual.ver_todo') || can('audiovisual.piezas')`.
  - `canEditPiezas = canCoordinate || can('audiovisual.piezas')`; espejo de RLS por pauta: `canEditPiezasForPauta`.
- RLS `av_pautas`: lectura abierta a autenticados; insert/update/delete con `user_can('audiovisual.coordina') OR user_can('audiovisual.manage')`, SIN membresía de línea (`task_user_in_line` no aplica, a diferencia de `tasks`). DELETE físico vía policy `av_pautas_delete`; soft delete/restore usan la policy de UPDATE.
- RLS `av_pauta_piezas`: lectura abierta; escritura sólo `user_can('audiovisual.coordina')` o recurso que grabó la pauta (`auth.uid()::text = any(av_pautas.recurso_ids)`).
- RLS `external_resources`: `for all to authenticated using(true)` (igual que `metric_line_members`).

## Alcance por línea
- `PautasPage.jsx` carga líneas con `visibleLinesForUser(data, userProfile, { extraViewAll: can('audiovisual.ver_todo') || can('audiovisual.piezas') })`. Sin `extraViewAll`, un usuario con ver_todo, nivel<4 y sin membresía en `metric_line_members` recibiría `lines=[]`.
- Pills: "Todos" + una por línea + **"Independientes"** (línea general `metric_lines.is_general`, cuentas sin `line_id`). Estilo como `TareasPage.jsx`/`TareasFijasPage.jsx` (activa `bg-[#FFB800]`, inactiva `bg-white border`).
- La línea general se carga con `loadLines({ includeGeneral: true })` y se pasa APARTE (prop `generalLine`), nunca dentro de `lines`: quien no tiene `canViewAll` toma su alcance de `lines[0]`.
- Filtrado resuelve `p.line_id ?? generalLineId` en lectura (`pautasInScope`, `effectiveLineId`, `aggregatePiezasByLine`, `generateAgendaText`); `av_pautas.line_id` se guarda `null`.
- Clientes de la solicitud (`scopeLine`/`defaultLineId`, vía `metric_line_members`): acotados a la línea del empleado solo si es miembro de alguna; si no (caso común), ve cualquier cliente de la empresa.

## Reglas de negocio
### Creación y fases
- "+ Solicitar pauta" (rol solicita) y "+ Agregar pauta" (rol coordina) arman un borrador 100% local (`DraftSolicitudRow`/`makeDraft`); nada se inserta hasta "Guardar solicitud", que inserta con `submitted:true` en un solo paso. Al guardar salta a Solicitudes (`onPhaseChange`).
- Brief completo (`briefComplete()`): `client_id` + (`link` o `piezas_desc`). Autoguardado `onBlur` en `AvPhaseTable.jsx`.
- La creación solo existe en `AvPhaseTable.jsx`; el calendario no crea pautas.
- Pestaña activa (`phase`: Solicitudes/Agenda/Realizadas/Papelera) vive en `AudiovisualView` y es independiente del calendario.

### Calendario y tarjetas
- `calendarFilter` ('todas'/'agendadas'/'realizadas', default 'todas'), controlado solo por 3 `SummaryCard`: Todas / Agendadas / Realizadas (sin solicitudes: no tienen fecha confirmada).
- "Agendadas" cuenta `status='programada'` con o sin fecha (igual que el badge de Agenda). "Todas" = `agendadasCount + realizadasCount` y limpia el filtro (`statusFilter=null`).
- `AvPhaseTable`, `SummaryCard` y `AvAnalytics` se acotan al mes visto con `pautasInMonth(pautas, year, month)`; pautas sin `pauta_date` siempre visibles. `AvCalendar` recibe la lista sin ese filtro (arma su propia grilla con días de relleno).
- Clic en un día o en "+N más" (más de 3 pautas) abre `DayPautasModal.jsx`: solo lectura, pautas 'programada'/'realizada' de esa fecha; clic en una pauta cierra el modal y abre `PautaDetailModal`; "Generar mensaje WhatsApp" usa `generateDayAgendaText` (copiar o volver).
- Agenda semanal (`WhatsAppAgendaModal.jsx` → `generateAgendaText`) omite días ya pasados.

### Papelera
- "Borrar" (✕ con doble clic, `DeleteButton`) = `deleted_at = now()`; la pauta sale de su fase y aparece en "Papelera" con "Restaurar" (`RestoreButton`, ícono de `EmployeesView.jsx`) que pone `deleted_at = null`.
- `AvPhaseTable.jsx` recibe pautas del mes con y sin borrar (`monthPautas`); `AudiovisualView.jsx` excluye borradas de `AvCalendar`, `SummaryCard`, `AvAnalytics` y agenda WhatsApp.
- "Eliminar definitivamente" = DELETE físico (`permanentlyDeletePauta`), con `ConfirmDeleteDialog.jsx` (teclear nombre exacto del cliente); cascada borra sus piezas.

### Recursos externos
- Personas contratadas afuera (grabar/editar/ads); no son empleados: no aparecen en Tareas, Líneas ni Evaluaciones, ni como asistentes (`allEmployees` = solo `employees`).
- Se modelan como pseudo-usuario (`externalAsUser`, `user_id` = `ext:<uuid>`) junto a `audiovisualUsers`: `recursoOptions` (rol `grabacion`) → picker de Recursos en `AvPhaseTable.jsx`; `editorOptions` (rol `edicion`) → picker de Editores en `PautaDetailModal.jsx`. Ambos entran a `usersById` (`resourceNames`, `piezasByEditor`, agregaciones los resuelven sin rama especial).
- Solo rol `ads` o sin roles: no aparece en ningún picker.

### Disponibilidad de recursos (solo frontend, sin constraint en BD)
- `avPautasApi.fetchPautasByDate(companyId, pauta_date, excludeId)`: `handleFields` intercepta cambios a `recurso_ids`/`pauta_date`/`salida`/`llegada`; si hay fecha y recursos la consulta (todas las líneas, sin respetar alcance por línea) y evalúa `resourceConflicts`:
  - Choque cierto (horas reales, `timeRangesOverlap`, intervalos `[salida, llegada)`; sin `llegada` = instante de salida): **bloquea** el guardado e indica con qué pauta choca. Se muestra en `assignError = {pautaId, message}` dentro del panel de Recursos de esa fila (el banner `error` de la cabecera es solo para errores de red/BD).
  - `warnings` de tipo `probable_overlap` (solo choca rellenando `llegada` con `assumedEnd` = +`ASSUMED_DURATION_HOURS`): aviso en `ResourceWarningDialog.jsx` ("Asignar igual"/"Cancelar"); se re-evalúa en cada guardado.
  - `daily_limit`: el recurso llegaría a `RESOURCE_DAILY_LIMIT` pautas ese día; avisa solo al agregar el recurso por primera vez (`previousRecursoIds`).

### Piezas de una pauta realizada (`PautaDetailModal`)
- Editores: sección colapsada ("Aún no se han agregado editores." + "+ Agregar editor" con `AttendeePicker`). Agregar un editor solo lo suma en estado local con bloque vacío (no persiste sin piezas). Quitar un editor con piezas → `RemoveEditorDialog.jsx`.
- `Stepper` (`−`/valor escribible/`+`), guardado inmediato: Enter/blur confirma, Escape revierte, clamp a `min`/`max`; los clics se acumulan y se envían en una sola escritura serializada (nunca dos en vuelo).
- Tope global: nunca repartir más de `piezas_totales - asignadas` (`faltantes`); `asignadas` = `piezasUnidadesActivas` (excluye `cancelado`, mismo criterio que `piezasProgress`). Prop `max` del `Stepper` + clamp defensivo en `handleAssignedChange`.
- Bajar la cantidad borra piezas `pendiente` desde el final (`planPiezaRemoval`); si hay piezas con avance se conservan y se muestra aviso dentro del panel (nunca `window.alert`).
- "Repartir automáticamente" (`distributePiezas`): reparte el faltante por turnos empezando por quien tiene menos; con desglose, cada formato por separado; si la pauta es 100% Foto, crece el lote.
- `piezas_editadas` nunca se edita a mano.
- Unidades: `piezaUnidades(pz)`/`piezaListas(pz)` son lo único que traduce fila→unidades; `piezasProgress`, `distributePiezas` y agregaciones suman unidades.

### Desglose por formato
- Sin desglose (`piezas_por_formato = '{}'`, camino legacy, hasta que se teclea un "Salieron"): input único "Piezas totales"; `piezas_editadas` del checklist sin distinguir formato. No hay backfill.
- Con `formats` marcados: un bloque por formato con "Salieron" manual (stepper) y "Editadas" de solo lectura (derivada del checklist, clampeada a `salieron`).
- Checklist de cada editor: una sección por formato de video activo (`FormatoChecklistBlock`), con ícono, "{listas}/{total} listas" y stepper propio; el formato de una pieza nueva lo decide la sección, nunca un `<select>`. V+F, R+F o uno solo → una sección; V+R → dos.
- `piezasPorBucket`/`piezasBalancePorFormato` calculan `{salieron, repartido, faltan}` por formato; `cupo(code)` en `PiezasSection` lo clampea contra `faltantes` → cada formato tiene su propio tope.
- Bloque "⚠️ Sin clasificar": piezas `formato: null` de pautas V+R antiguas; único lugar con selector de formato (`PiezaRow`); desaparece al reclasificar. (Pautas de un solo formato de video ya fueron backfilleadas.)
- Tabla de Realizadas muestra `formatoBreakdownLabel` junto a la barra de progreso.

### Fotos en lote
- Foto (`FOTO_FORMAT`) nunca pasa por el checklist pieza a pieza: un lote por editor (`es_lote:true, cantidad, listas`).
- UI `LoteRow` ("📷 Fotos"): steppers **Asignadas** (`cantidad`, mismo pool `faltantes`, nunca < `listas`) y **Listas**; "✓ completar todas"; ✕ para quitar el lote (bloqueada si tiene listas).
- Si Foto es el único formato activo, no se renderizan secciones de Video/Reel.
- `loteOf` usa `.find()` (lee el primer lote); el índice único garantiza que hay uno.

## Gotchas
- `editor_user_id` y `recurso_ids` son text sin FK para admitir `ext:<uuid>`.
- `created_by` es text y `users.user_id` uuid: el trigger de notificaciones castea `user_id::text = new.created_by`.
- `notify_av_pauta_events` está envuelta en `exception when others` (`raise warning`): un fallo de notificación nunca aborta el guardado.
- Lotes duplicados por clics rápidos (síntoma: la UI muestra menos de lo que "salió") los previenen el `Stepper` serializado + índice único.
- Errores de asignación se pintan en la fila, no en la cabecera: con la tabla larga la cabecera queda fuera de pantalla.

## Notificaciones
- Trigger `notify_av_pauta_events`:
  - "pauta solicitada" (`av_pauta_solicitada`): cuando el brief está completo (al pasar `submitted` o si se completa después); no auto-notifica al creador; cuerpo con tema/línea/solicitante.
  - "Pauta agendada" (`av_pauta_programada`): solo a `created_by`.
- `enqueue_av_agenda_reminder` (pg_cron, jueves y viernes) → `av_agenda_reminder`: recuerda el cierre de la agenda semanal.
- Destinatarios coordinadora: `av_coordinadora_recipients(company_id)` evalúa `audiovisual.notificaciones` en `module_permissions`. Seed: Lizdania (`967bedeb-54fa-4da1-b975-bfc4745989d9`); cambiarlo es un UPDATE, sin deploy.
- Campanita: `notifIcon`/`notifLabel`/`notifRoute` en `notificationFormat.js` → `/tareas/pautas?pautaId=<id>` (sin id para el recordatorio). Mismo patrón que `meeting_notifications` (§2.5).

## Conexiones con otros módulos
- **Reportes** (`OperacionesView.jsx`), con corte `AUDIOVISUAL_MODULE_START = {year:2026, month:9}` (`constants.js`); meses anteriores y reportes cerrados conservan el valor manual (mismo patrón que `reuniones.realizadas`/`productividad.tareas`):
  - «6. Nº Piezas vs Piezas editadas»: `report.piezas.{piezas,editadas}` desde `av_pautas` `status='realizada'` del mes vía `countPiezasForLine` → `sumPiezasVideoForLine`. Solo video (grupo `av` = V + R, sin F): con desglose suma V/R; sin desglose incluye la pauta solo si sus `formats` no tienen `F`.
  - `porGrupo` (`sumPiezasVideoBreakdownForLine`): `video4k`/`reel`/`sinDesglose` → `report.piezas.porGrupo`, texto informativo ("Video 4K: N piezas / M editadas · Reels: …"); `calcPiezas` usa solo el total.
  - «5. Nº Pautas»: `report.pautas.items[].realizadas` por cliente vía `countPautasRealizadasByClient` (solo lectura); `meta` por marca sigue 100% manual.
  - `aggregatePiezasByLine` (analítica de Pautas) muestra el total crudo video+foto, distinto a propósito.
- **Empresa**: Empleados → recursos externos; Accesos → capabilities; usuarios del depto Audiovisual (`department_id=2`).
- **Líneas/Clientes**: `metric_clients`, `metric_lines`, `metric_line_members`.
- **Reuniones**: `AvCalendar.jsx` adaptado de `reuniones/CalendarView.jsx`; patrón de notificaciones de `meeting_notifications`.
