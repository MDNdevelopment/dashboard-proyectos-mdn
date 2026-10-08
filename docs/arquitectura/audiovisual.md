### 2.4ter Pautas Audiovisual (Tareas — sub-sección Audiovisual)

## Resumen
- Agenda de pautas (grabaciones/sesiones) audiovisuales por cliente, con **una pantalla de entrada por rol** (`AudiovisualView` elige la `view` inicial): coordinación, jefas de línea y solo lectura entran a **Semana**; el equipo audiovisual (`department_id = 2` sin `coordina`) entra a **Mi trabajo**.
- Flujo: `solicitada` → `programada` (agendada) → `realizada` | `declinada`; papelera por `deleted_at`. Quien tiene `audiovisual.manage` SOLICITA; la coordinadora AGENDA o DECLINA; al ejecutarse se marca `realizada` y se registra captura y edición.
- **Captura** = contadores recurso × formato (`grabacion_por_formato`). "Salieron" de cada formato se DERIVA de la captura y se persiste en `piezas_por_formato[c].salieron` (`syncSalieronFromGrabacion`).
- **Edición** = un lote (`av_pauta_piezas.es_lote`) por (editor, formato) con `cantidad` (asignadas) y `listas`. Cupo = salieron − asignadas; el editor mueve solo sus `listas`.
- Incluye: agenda WhatsApp (semanal y por día), analítica de rendimiento por recurso, papelera, recursos externos, control de disponibilidad de recursos, estudio MDN con reserva de 2 h, notificaciones, guía de onboarding y alimentación automática de Reportes.

## Rutas y archivos
- Ruta: `/tareas/pautas` (`PautasPage.jsx` → `AudiovisualView`), sub-link de Gestión de Tareas en el Sidebar. Deep-link `?pautaId=<uuid>` (abre `PautaDetail`, mueve el mes y la línea); lo usa la campanita (`notifRoute`).
- Todo vive en `src/components/pautas/`. `AudiovisualView.jsx` es el contenedor: carga, realtime de `av_pautas` y `av_pauta_piezas`, alcance por línea, `view`, `semanaModo`, `listFilter`, `detailId` y modales. `AvToolbar.jsx` recibe `views` `[{key,label,badge,badgeLabel,badgeTone}]`.
- Pestañas (con badges): **Semana · Mi trabajo · Datos · Todas**.
  - **Semana** (`AvSemanaView.jsx`): toggle **Semana | Mes** en su cabecera. `Mes` (`semanaModo`) reemplaza la grilla y la ocupación por el calendario mensual (prop `calendario`: `AvCalendarView.jsx` + `AvCalendar.jsx`, con `showSolicitadas`); al pasar a Mes abre en el mes de la semana visible. Lun–sáb navegable con `SemanaGrid.jsx` y `PautaCard.jsx` por día (hora, lugar ◉ estudio, recursos y estado `pautaEstadoResumen`). KPIs del mes (% editado, realizadas, por aprobar) con salto a Datos. `AlertasStrip.jsx` con alertas DERIVADAS de los datos (`alertas`: por aprobar, pasadas sin captura, grillas vencidas, piezas atrasadas) que abren `AvDrawer.jsx` con su cola; `ColaAprobacion.jsx` agenda/declina sin salir. `OcupacionBar.jsx`: bloques de 2 h del estudio por día y carga por recurso. Para quien pide, `MisSolicitudes.jsx` con timeline Solicitada → Agendada → Realizada/Declinada.
  - **Mi trabajo** (`MiTrabajoView.jsx`, solo si tiene pautas o lotes propios): Hoy y Pendiente de registrar con `CapturaRapida.jsx` (+/− por formato que escribe la captura propia; "Marcar realizada" si puede), Próximas, Por editar con `EdicionRapida.jsx` (listas +/−, "todo listo"), Entregadas (lotes propios completos, colapsada, 10 más recientes + "ver todas"; con `EdicionRapida` se puede bajar listas y el lote vuelve a Por editar) y Disponible para tomar (`upsertLote`). `CapturaRapida` exporta `BigStepper`, que usa `Stepper size="lg"`: el número se escribe (80 fotos sin 80 toques); en Por editar se recorta a `cantidad`.
  - **Datos** (`AvDatosView.jsx`): `KpiMes.jsx` con `resumenMes` del mes y del anterior (delta coloreado), selector de mes, `PendientesPanel.jsx` ("Pendiente por editar" línea × formato → Lista filtrada), `RankingTable.jsx` ("Videos 4K + Reels" y "Fotos") y piezas por línea → Lista acotada a la línea.
  - **Todas** (`AvListView.jsx` + `PautaRow.jsx`): filtros Solicitadas/Agendadas/Realizadas/Declinadas/Papelera, recurso, búsqueda, chips removibles de pendiente y de línea (`filter.lineId`); badge con solicitudes por aprobar.
- **Solicitar**: `SolicitarWizard.jsx` en 3 pasos — `WizardPasoQue` · `WizardPasoCuando` (con `HuecosSugeridos.jsx`: 10 días hábiles + horas cada 30 min, 08:00–17:00, marcadas ocupado/aviso/libre por `sugerirHuecos`, o "sin fecha fija") · `WizardPasoDetalles` (opcionales). `PautaFormModal.jsx` queda solo para editar el brief (con `PautaCuandoDondeFields.jsx` y `EstudioAvailability.jsx`).
- **Detalle**: `PautaDetail.jsx` + `PautaDatos.jsx` + `PautaAcciones.jsx` + `AgendarDialog.jsx` (modos `agendar`/`reagendar`, usa `ResourceWarningDialog`) + `CapturaSection.jsx` + `EdicionSection.jsx`; `StatusBadge.jsx`, `ExtraBadge.jsx`.
- Otros: `DayPautasModal.jsx`, `WhatsAppAgendaModal.jsx`/`WhatsAppTextPanel.jsx`, `avPautasApi.js` (`loadPautas`, `countPiezasForLine`, `countPautasRealizadasByClient`, `createPauta`, `updatePauta`, `deletePauta`, `restorePauta`, `permanentlyDeletePauta`, `loadPiezas`, `upsertLote`, `deleteLote`, `updatePieza`), `externalResourcesApi.js`.
- **Guía (ⓘ junto al título)**: `pautasTours.js` (recorridos por permiso: Lo básico, Pedir una pauta, Coordinar la agenda, Registrar captura y edición, Leer los datos; `toursFor(ctx)` filtra por `coordina`/`manage`/alcance/`tieneTrabajo`) + marcas `data-tour="…"` en los componentes + motor común `components/common/onboarding/` (`ModuleTourButton`, `useModuleTour` sobre driver.js, `useTourProgress` en `localStorage` por persona). `AudiovisualView` recibe `tourApiRef` (`goTo({view, semanaModo})`) y `onTourCtx`. Para dar onboarding a otro módulo: `<modulo>Tours.js` + `data-tour` + `ModuleTourButton` al lado del título.
- Componentes comunes: `Stepper.jsx` (`src/components/common/`, prop `size` `'sm'|'lg'`), `AttendeePicker`, `StatusPill`, `SummaryCard`, `DeleteButton`, `RestoreButton`, `ConfirmDeleteDialog.jsx`.
- Recursos externos (gestión): `ExternalResourcesView.jsx`/`ExternalResourceModal.jsx` en `src/components/empresa/` (Empresa → Empleados).
- Lógica pura en `src/utils/audiovisual.js`:
  - estudio: `STUDIO_WINDOW_HOURS`, `studioWindow`, `estudioConflicts`, `estudioSlotsForDay`, `lugarLabel`.
  - lotes: `lotesMatrix`, `loteFor`, `planLoteChange`, `editorRemovable`.
  - permisos: `pautaPermissions`, `canEditPiezasForPauta`, `canActOnEditorGroup`, `leadLineIdsFor`.
  - lista: `LIST_FILTERS`, `pautaMatchesList`, `pautaMatchesQuery`, `sortForList`.
  - reagendado: `reagendamientosOf`, `formatReagendamiento`.
  - rendimiento: `aggregateResourcePerformance` (con `grabaV/R`, `editaV/R`, `editaCnp`), `rankingFotos`, `rankingVideos`, `pendientesPorEditar`, `pautaMatchesPendiente`, `aggregatePiezasByLine`.
  - captura: `grabacionPorFormato`, `setGrabacionCount`, `syncRecursoIds`, `syncSalieronFromGrabacion`.
  - disponibilidad: `resourceConflicts`, `timeRangesOverlap`, `assumedEnd`, `RESOURCE_DAILY_LIMIT` (3), `ASSUMED_DURATION_HOURS` (3).
  - WhatsApp: `generateAgendaText`, `generateDayAgendaText`.
  - por rol: `weekRange`, `pautasInWeek`, `groupByDay`, `pautaEstadoResumen`, `alertas`, `ocupacionEstudio`, `ocupacionEstudioMes`, `cargaRecursos`, `diasHabiles`, `sugerirHuecos`, `misSolicitudes`, `hitosPauta`, `miTrabajo`, `disponiblesParaTomar`, `resumenMes`.
  - `src/utils/employeeScore.js → calcPiezasAv` suma unidades de lote (`piezaUnidades`/`piezaListas`).
- Otros utils: `src/utils/lineMembers.js` (`visibleLinesForUser`), `utils/lineFilters.js` (`effectiveLineId`, `pautasInScope`), `src/utils/notificationFormat.js`.

## Datos
### `av_pautas` (realtime)
- `id, company_id, client_id→metric_clients, client_name, line_id→metric_lines` (snapshot; `null` para cuentas sin línea), `tema, place, requirements, has_model, pauta_date, salida, llegada`.
- `lugar_tipo` `'estudio'|'locacion'` (default `locacion`).
- `formats text[]` ⊆ {V,R,F} (V = Video de marca/4K, R = Reel, F = Foto).
- `recurso_ids text[]` (sin FK): quienes graban (empleados del depto Audiovisual o externos `ext:<uuid>`).
- `attendee_ids text[]`, `link`, `grilla_delivered_at`, `piezas_desc`, `submitted`, `extra`, `created_by` (text), `created_at`, `updated_at`.
- `status`: `solicitada | programada | realizada | declinada`.
- `piezas_totales`, `piezas_editadas`: derivados del desglose por trigger.
- `piezas_por_formato jsonb` `{c:{salieron,editadas}}`; `grabacion_por_formato jsonb` `{c:{userId:n}}`.
- `reagendamientos jsonb []` (`{from_date, from_salida, to_date, to_salida, at, by}`): lo escribe `av_pautas_track_reagendamiento` (BEFORE UPDATE OF `pauta_date, salida`) cuando la pauta sigue programada.
- `deleted_at` — soft delete (Papelera). `extra` — pauta fuera del plan mensual (`ExtraBadge`).
- Constraint `av_pautas_estudio_sin_solape` (btree_gist): EXCLUDE (`company_id =`, `client_id <>`, `tsrange(pauta_date+salida, +2h, '[)') &&`) WHERE `lugar_tipo='estudio'` AND `status IN (programada, realizada)` AND `deleted_at IS NULL` AND `pauta_date >= 2026-10-02` (corte por solape histórico).
- Triggers: `av_pautas_sync_formato_counters` (editadas = least(salieron, Σ listas del formato); totales = Σ desglose), `prevent_av_pautas_recurso_escalation`, `notify_av_pauta_events`. Índice `av_pautas_company_date_idx`.
- Legacy sin UI: `graba_user_id`/`graba_other`, `edita_user_id`/`edita_other`.

### `av_pauta_piezas` (realtime)
- `id`, `pauta_id→av_pautas (on delete cascade)`, `company_id`, `editor_user_id text` (uuid o `ext:uuid`, sin FK), `nombre`, `status` (`pendiente | en_edicion | espera_aprobacion | listo | cancelado`; en lotes lo deriva `av_pauta_piezas_sync_lote`), `position`, `formato` ⊆ {V,R,F}, `es_lote`, `cantidad ≥ 1`, `0 ≤ listas ≤ cantidad`, `prev_editor_user_id` (sin uso), `created_at`, `updated_at`.
- Índice único parcial `av_pauta_piezas_lote_unico_por_editor_formato (pauta_id, editor_user_id, formato) WHERE es_lote`.
- Trigger `av_pauta_piezas_sync_counters` recalcula `av_pautas.piezas_editadas` (suma de `listas`).
- Todas las pautas usan lotes (`es_lote = true`); ya no hay modo solo lectura. `20261007120000_av_pauta_piezas_convertir_sueltas_a_lotes.sql` convirtió las filas sueltas del modelo anterior: un lote por (pauta, editor, formato) con las piezas que había (`listas` = las que estaban en `listo`), conservando el `created_at` de la fila más antigua; si ya existía un lote, ese gana y las sueltas se descartan sin sumar. Un grupo sin editor queda como lote huérfano (`editor_user_id` null), que Edición muestra como "Sin editor".

### `external_resources`
- `id, company_id, full_name, roles text[]` ⊆ {grabacion,edicion,ads}, `deleted_at`. Sin realtime (la vista recarga on-mount). Desacoplada de `users`.

## Permisos
Capabilities del módulo `tareas` (configurables en Empresa → Accesos):
- `audiovisual.manage` — solicitar/editar el brief propio; abierto a todos los autenticados.
- `audiovisual.coordina` — aprobar y agendar, declinar, marcar realizada, reagendar, borrar/restaurar/eliminar, captura y edición de cualquier pauta. Seed: Lizdania + admin.
- `audiovisual.pautas.gestion` — captura/edición de cualquier pauta y reagendar, sin aprobar.
- `audiovisual.ver_todo` / `audiovisual.piezas` — ver pautas de todas las líneas.
- `audiovisual.notificaciones` — destinatarios de notificaciones; sin auto-pase de admin.
- Por alcance (no capability):
  - **Jefa de línea** (`metric_line_members.is_lead` → `leadLineIdsFor`): edita brief, captura y edición de las pautas de su línea.
  - **Recurso asignado** (`recurso_ids`): carga captura y edición de esa pauta.
  - **Editor** (`editor_user_id` del lote): mueve solo sus `listas` (`canActOnEditorGroup`).
- Todo se resuelve en UI con `pautaPermissions` (`canEditBrief, canApprove, canReagendar, canMarkRealizada, canEditPiezas, canDelete, canRestore, canReopen`), espejo de las RLS:
  - `av_pautas`: lectura abierta; update = coordina ∨ manage ∨ recurso; DELETE físico vía policy `av_pautas_delete`; soft delete/restore usan la de UPDATE. Sin membresía de línea (`task_user_in_line` no aplica).
  - `av_pauta_piezas`: lectura abierta; escritura = coordina ∨ gestion ∨ `user_leads_av_pauta` ∨ recurso; update además editor.
  - `external_resources`: `for all to authenticated using(true)`.

## Alcance por línea
- `PautasPage.jsx` carga líneas con `visibleLinesForUser(data, userProfile, { extraViewAll: can('audiovisual.ver_todo') || can('audiovisual.piezas') })`. Sin `extraViewAll`, un usuario con ver_todo, nivel<4 y sin membresía en `metric_line_members` recibiría `lines=[]`.
- Pills: "Todos" + una por línea + **"Independientes"** (línea general `metric_lines.is_general`, cuentas sin `line_id`). Activa `bg-[#FFB800]`, inactiva `bg-white border`.
- La línea general se carga con `loadLines({ includeGeneral: true })` y se pasa APARTE (prop `generalLine`), nunca dentro de `lines`: quien no tiene `canViewAll` toma su alcance de `lines[0]`.
- El filtrado resuelve `p.line_id ?? generalLineId` en lectura (`pautasInScope`, `effectiveLineId`, `aggregatePiezasByLine`, `generateAgendaText`); `av_pautas.line_id` se guarda `null`.
- Clientes de la solicitud (vía `metric_line_members`): acotados a la línea del empleado solo si es miembro de alguna; si no (caso común), ve cualquier cliente de la empresa.

## Reglas de negocio
### Solicitar, agendar y reagendar
- `SolicitarWizard` inserta con `submitted:true` en un solo paso al terminar; con "sin fecha fija" la coordinación ubica la pauta después.
- `AgendarDialog` (modo `agendar`): fecha/hora/lugar, recursos y asistentes → `programada`.
- **Reagendar** (coordina/gestión) cambia fecha/hora/lugar y deja historial en `reagendamientos` (lo escribe el trigger, no la UI).
- Brief completo (`briefComplete()`): `client_id` + (`link` o `piezas_desc`).

### Estudio MDN
- `lugar_tipo = 'estudio'` reserva 2 h desde `salida`.
- Choque con `programada`/`realizada` de otro cliente **bloquea** (UI vía `estudioConflicts` + exclusion constraint); con `solicitada` solo avisa. El mismo cliente puede solaparse.

### Captura y edición
- Captura: `setGrabacionCount` + `syncSalieronFromGrabacion` + `syncRecursoIds` (el recurso que captura queda en `recurso_ids`). Las fotos dicen "capturadas"; video y reel "grabadas".
- Edición: `planLoteChange` (nunca `listas > cantidad`) + `updatePieza`/`upsertLote`. Cupo de un formato = `salieron − asignadas`.
- `Stepper` (`−`/valor escribible/`+`), guardado inmediato: Enter/blur confirma, Escape revierte, clamp a `min`/`max`; los clics se acumulan y se envían en una sola escritura serializada (nunca dos en vuelo). Con `size="lg"` (Mi trabajo) los botones son de 44 px.
- `piezas_editadas` nunca se edita a mano. Unidades: `piezaUnidades(pz)`/`piezaListas(pz)` son lo único que traduce fila→unidades.

### Papelera
- "Borrar" = `deleted_at = now()`; la pauta sale de su fase y aparece en el filtro Papelera de Todas con "Restaurar" (`deleted_at = null`).
- "Eliminar definitivamente" = DELETE físico (`permanentlyDeletePauta`) con `ConfirmDeleteDialog` (teclear nombre exacto del cliente); la cascada borra sus piezas.

### Recursos externos
- Personas contratadas afuera (grabar/editar/ads); no son empleados: no aparecen en Tareas, Líneas ni Evaluaciones, ni como asistentes.
- Se modelan como pseudo-usuario (`externalAsUser`, `user_id` = `ext:<uuid>`) junto a `audiovisualUsers`, y entran a `usersById`. Solo rol `ads` o sin roles: no aparece en ningún picker.

### Disponibilidad de recursos (solo frontend, sin constraint en BD)
- Al cambiar `recurso_ids`/`pauta_date`/`salida`/`llegada`, `avPautasApi.fetchPautasByDate` consulta las pautas de ese día (todas las líneas) y `resourceConflicts` evalúa:
  - Choque cierto (`timeRangesOverlap`, intervalos `[salida, llegada)`): **bloquea** el guardado e indica con qué pauta choca.
  - `probable_overlap` (solo choca rellenando `llegada` con `assumedEnd`): aviso en `ResourceWarningDialog` ("Asignar igual"/"Cancelar").
  - `daily_limit`: el recurso llegaría a `RESOURCE_DAILY_LIMIT` pautas ese día; avisa solo al agregarlo por primera vez.

## Gotchas
- `editor_user_id` y `recurso_ids` son text sin FK para admitir `ext:<uuid>`.
- `created_by` es text y `users.user_id` uuid: el trigger de notificaciones castea `user_id::text = new.created_by`.
- `notify_av_pauta_events` está envuelta en `exception when others` (`raise warning`): un fallo de notificación nunca aborta el guardado.
- Lotes duplicados por clics rápidos los previenen el `Stepper` serializado + índice único por (pauta, editor, formato).
- Los contadores de Mi trabajo no se deshabilitan mientras guardan: `Stepper` ya serializa, y deshabilitar el input a mitad de escritura le quitaría el foco.
- Las alertas de Semana no se guardan: se derivan en cada render de `av_pautas`/`av_pauta_piezas`.

## Notificaciones
- Trigger `notify_av_pauta_events`:
  - `av_pauta_solicitada`: a coordinación (`av_coordinadora_recipients`) cuando el brief está completo; no auto-notifica al creador.
  - `av_pauta_programada`: solo a `created_by`; también se dispara al cambiar `pauta_date` de una programada, así que un reagendado avisa a la solicitante con el evento existente (no hay evento nuevo de reagendado, por decisión de producto).
- `enqueue_av_agenda_reminder` (pg_cron, jueves y viernes) → `av_agenda_reminder`: recuerda el cierre de la agenda semanal.
- Destinatarios coordinadora: `av_coordinadora_recipients(company_id)` evalúa `audiovisual.notificaciones` en `module_permissions`; cambiarlo es un UPDATE, sin deploy.
- Campanita: `notifIcon`/`notifLabel`/`notifRoute` en `notificationFormat.js` → `/tareas/pautas?pautaId=<id>` (sin id para el recordatorio).

## Conexiones con otros módulos
- **Reportes** (`OperacionesView.jsx`, `reportSourcesApi.js`), con corte `AUDIOVISUAL_MODULE_START = {year:2026, month:9}`; meses anteriores y reportes cerrados conservan el valor manual:
  - «6. Nº Piezas vs Piezas editadas»: `countPiezasForLine` → `sumPiezasVideoForLine` / `sumPiezasVideoBreakdownForLine`, solo video (V + R, sin F), desde `piezas_por_formato`/`piezas_totales`/`piezas_editadas`. Los CNP de audiovisual (`cnp_requests.is_audiovisual`) suman solo en el ranking de videos de Datos (`editaCnp`), nunca en el indicador «6».
  - «5. Nº Pautas»: `countPautasRealizadasByClient` (solo lectura); `meta` por marca sigue 100% manual.
  - `aggregatePiezasByLine` (analítica de Pautas) muestra el total crudo video+foto, distinto a propósito.
- **Evaluaciones**: `employeeScore.calcPiezasAv` lee `av_pauta_piezas` por unidades de lote.
- **Empresa**: Empleados → recursos externos; Accesos → capabilities; usuarios del depto Audiovisual (`department_id=2`).
- **Líneas/Clientes**: `metric_clients`, `metric_lines`, `metric_line_members`.
- **Reuniones**: `AvCalendar.jsx` adaptado de `reuniones/CalendarView.jsx`; patrón de notificaciones de `meeting_notifications`.
