# Métricas (Reportes)

## Resumen
Reportes mensuales ponderados (100 pts) por línea operativa: reuniones, productividad, crecimiento, solicitudes, pautas y piezas, más finanzas. Dashboard anual comparativo. El Monitor de uso NO vive aquí (módulo propio, §2.5bis).

## Rutas y archivos
- `/reportes` → Dashboard anual · `/reportes/linea/:lineId` → reporte de línea (pestañas Resumen/Operaciones/Finanzas; deep-link `?tab=operaciones&year=&month=`).
- Página: `src/pages/MetricasPage.jsx`.
- `src/components/metricas/`: `src/components/metricas/DashboardView.jsx`, `LineView.jsx`, `LineHubView.jsx` (Resumen), `OperacionesView.jsx`, `FinanzasView.jsx`, `ScoreDial.jsx`, `metricsApi.js`, `constants.js`, `EmployeeInfoModal.jsx`, `ClientFichaModal.jsx`, `EmployeeFichaContent.jsx`, `ClientFichaContent.jsx`, `ReunionesClientesModal.jsx` (cobertura de reuniones por marca, Section 1).
- Utils: `src/utils/metricsScore.js`, `metricsFinance.js`, `initMetricReport.js`, `aggregateMetricsDashboard.js`, `buildEffectiveReport.js`, `syncReportClients.js`, `reportPeriod.js`, `pruneCarryForward.js`, `reunionesMeta.js`, `lineMembers.js`, `moveClientLine.js`, `prorateMonthlyFee.js`, `stripClientFromReport.js`, `src/utils/reportClosure.js`, `src/utils/notificationFormat.js`.
- Otros: `reportSourcesApi.js`, `chequeoApi.js`, `src/hooks/useReportCloseReminder.js`, `src/components/ReportCloseReminderModal.jsx`, `src/lib/reportReminder.js`, `src/lib/permissions.js`, `src/components/common/EntityGridList.jsx`.
- Fuera del módulo que lo tocan: `LineMetasModal.jsx` / `LinesView.jsx` (Empresa › Líneas), `ClientModal`, `MoverClienteModal.jsx`, `ClientsView`, `LineFichaModal`, `HomePage`, `Sidebar.jsx`, `AppLayout.jsx`.
- Test: `src/test/effectiveReportEquivalence.test.js`.

## Datos

### `metric_lines`
`id, company_id, name, color, sort_order, metas jsonb, is_general boolean`
- `is_general=true` = fila oculta "Independientes" (solo Tareas la usa para empleados sin línea, §2.4). `loadLines(companyId, opts)` la excluye por defecto (`.eq('is_general', false)`); incluirla con `{ includeGeneral: true }`.
- `metas`: `{ "tareas": [{ "nombre": "Calendario", "meta": 10 }, ...] }` — metas de tareas fijas para periodos NO guardados; pisan `productividad.tareas` y tienen prioridad sobre el carry-forward. Reportes guardados quedan congelados. `{}` = defaults del código. Se edita en `LineMetasModal.jsx` (botón "Configurar metas" en `LinesView.jsx`). No incluye `reuniones` (siempre derivada).
- `lead_user_id` / `is_lead`: identifican la jefa de línea.

### `metric_line_members`
`line_id→metric_lines CASCADE, user_id text`, PK compuesta, N:M. `loadLines` deriva `member_user_ids`. Sin historial de altas/bajas; se borra al archivar.

### `metric_clients`
`id, company_id, line_id→metric_lines, name, website, rif text, payment_day, monthly_fee, social_links jsonb, logo_url, contacts jsonb, anniversary_date, mdn_since, social_manager_id text, designer_id text, audiovisual_ids jsonb, apoyo_ids jsonb, deleted_at timestamptz, baja_incluye_mes boolean, contract_end date, contract_end_reason text` + `pending_line_id`, `line_change_at`, `pending_task_assignee` (cambio de línea diferido).
- Soft delete: `deleted_at` `NULL` = activo; nunca se borra (referencias en reportes/tareas/campañas).
- `metric_clients.baja_incluye_mes` (default `true`): `true` conserva la marca en el mes de baja; `false` la excluye desde ese mes (meses anteriores intactos). Se elige en el diálogo de archivado de `ClientsView` → `deleteClient(clientId, { incluyeMes })`.
- `contract_end` prioriza sobre `deleted_at` en `clientInMonth`. `contract_end_reason` = motivo, mismo diálogo de archivado.
- `rif`: texto libre (id fiscal), visible en formulario y ficha.

### `metric_reports`
`id, company_id, line_id→metric_lines, year, month, data jsonb, closed_at timestamptz, closed_by text, closed_auto boolean default false`. UNIQUE `line_id+year+month`.

`data`:
```
{ reuniones:{realizadas,meta,comentario,justificativos:{[clienteId]:'no_aplica'|'reprogramado_cliente'|'no_cumplio'}},
  productividad:{tareas:[{nombre,realizado,meta}]},
  crecimiento:{items:[{clienteId,seguidoresGanados,seguidoresGanadosPrev,seguidoresActuales,seguidoresBase,meta}]},
  solicitudes:{solicitudes,editadas}, pautas:{items:[{clienteId,realizadas,meta}]}, piezas:{piezas,editadas},
  finanzas:{ingresos:[],gastosOperativos:[],sueldos:[],otrosGastos:[]}, incompleto?:boolean }
```
- `crecimiento.items`: `seguidoresGanados` (mes actual, editable, se compara contra `meta`); `seguidoresGanadosPrev` (ganados del periodo anterior, línea base, solo informativo, no puntúa); `seguidoresActuales` (totales al cierre, editable); `seguidoresBase` (totales del periodo anterior; tras bootstrap = `seguidoresActuales` del mes previo vía `loadPrevReport`).
- UI crecimiento: columnas del mes anterior (cada campo disabled si el reporte previo lo tiene; editable si vacío o sin reporte previo — el override se guarda en `seguidoresGanadosPrev`/`seguidoresBase` del reporte ACTUAL sin tocar el previo), columnas del mes del reporte (siempre editables), `meta` e indicador ✓ Cumple / Pendiente con `ganados/meta×100`.
- `incompleto=true`: el mes se excluye del promedio anual, ranking, cobertura y gráfico histórico (`aggregateMetricsDashboard.js` + `LineHubView.jsx`); sus finanzas sí se acumulan. Ausente/false = cuenta.
- `feedback` puede existir en reportes viejos: no se captura ni puntúa.

### Otras tablas
- `metric_client_line_moves`: auditoría de movimientos de línea.
- Fuentes del reporte efectivo: `meetings`, `fixed_task_marks`, `publication_checks`, `av_pautas`, `cnp_requests`, `tasks`.
- `users.monthly_salary` (sueldos), `positions.position_description`, `positions.position_functions jsonb[]`, `notif_cron_runs`.

## Permisos
- Acceso: `can('reportes')` (`src/lib/permissions.js`). Sin reglas → libre para autenticados; admins siempre pasan. Compuerta en `Sidebar.jsx` y `MetricasPage.jsx` (redirige a `/`).
- RLS (`20260704000000_metric_reports_team_rls.sql`): helpers `metrics_user_can_view()` (nivel ≥3 o admin) y `metrics_user_view_all()` (≥4 o admin), hardcodeados por nivel. Predicados SELECT y UPDATE/INSERT idénticos.
- Nivel 3: ve/edita solo su línea (frontend + RLS). Nivel 4 y admin: todas. Filtro: `visibleLinesForUser(lines, userProfile)` en `src/utils/lineMembers.js`.
- Cerrar reporte: capability `reportes.close` (§1, nivel 4/admin) o la jefa de la línea (`metric_line_members.is_lead`, `line.lead_user_id === userProfile.user_id`).
- `isFinancePrivileged` (nivel 4/admin): mensualidad y día de pago en `ClientFichaModal`, sección Sueldos en `FinanzasView`, flujo "Mover de línea".

## Reglas de negocio / cálculos

### Score (100 pts, 6 indicadores)
`reuniones` 20 · `productividad` 20 · `crecimiento` 20 · `pautas` 20 · `solicitudes` 10 · `piezas` 10. Pesos en `constants.js` (`INDICATORS`); lógica en `src/utils/metricsScore.js` (`calcTotal`, `calcReuniones`, `monthLineScore`). No existe indicador `feedback`.
- `calcReuniones`: si la meta derivada es 0 (línea sin marcas o todas "No aplica") puntúa 20/20.
- Crecimiento: cumplimiento por cliente `seguidoresGanados/meta×100`.

### Selector de periodo (`LineView.jsx`)
- En la URL (`?year=&month=`), sobrevive a F5. Default: mes y año en curso.
- Año en curso: enero hasta `NEXT_MONTH = min(CURRENT_MONTH+1, 12)` (permite adelantar captura). `?month=` fuera de rango se sanea al más cercano. Años pasados hasta `CURRENT_YEAR-3` con 12 meses; sin años futuros.
- Un mes futuro nunca está congelado; reconcilia como el mes en curso.
- `DashboardView.jsx`: mismo default; muestra los 12 meses sin tope.

### Captura e inicialización
- Captura mayormente manual en `OperacionesView`/`FinanzasView`.
- Periodo no guardado: `initMetricReport.js` copia el mes anterior tal cual (carry-forward, incl. `finanzas.sueldos`/`finanzas.ingresos`) y luego aplica `metric_lines.metas` (prioridad de la línea). Recibe flag `metaAuto` (de `REUNIONES_META_AUTO_START`) para sembrar `reuniones.meta` derivada o `null`.
- `pruneCarryForward` (`src/utils/pruneCarryForward.js`): se aplica al resultado de `initMetricReport` en ambas vistas; descarta filas heredadas cuyo empleado no cumple `employeeActiveInMonth` o cliente no cumple `clientInMonth` para ese mes. Solo mira fechas de baja (nunca `metric_line_members`), seguro en meses pasados. Nunca sobre reportes guardados. Las filas de sueldo ligadas a empleado se pueden borrar a mano en `FinanzasView`.
- Solo `OperacionesView` materializa un mes sin fila (`initMetricReport`+`pruneCarryForward`), y solo con "Guardar reporte".

### Reconciliación y congelamiento
- `syncReportClients.js` reconcilia cartera actual en crecimiento/pautas, ingresos y sueldos:
  - Ingresos ← `metric_clients.monthly_fee` (sembrar-y-editar: valores conservados por `clienteId`; clientes fuera de línea descartados; filas manuales `clienteId==null` conservadas).
  - Sueldos ← `users.monthly_salary` filtrado por `metric_lines.member_user_ids` (conservados por `empleadoId`; quien sale del team se descarta; manuales `empleadoId==null` conservadas). Nómina no se toca al mover cuentas.
- `isReportFrozen(year, month, closed)` (`src/utils/reportPeriod.js`): true si el mes es estrictamente anterior al en curso o está cerrado → se muestra el `data` guardado sin reconciliar. El snapshot es la única fuente de verdad histórica.
- Mes en curso / sin guardar reconcilia contra roster del mes: `clientInMonth` (usa `contract_end ?? deleted_at`, respeta `baja_incluye_mes`) / `employeeActiveInMonth` (baja posterior al inicio del mes = activo ese mes).

### Reuniones
- `reuniones.realizadas`: solo lectura, siempre recalculada con `countMeetingsHeldForLine` (Reuniones, §2.11) al cargar, sin override (evita inflar reuniéndose repetidamente con el mismo cliente). Solo se sobreescribe si el mes ≥ `REUNIONES_MODULE_START = {year:2026, month:7}` y no cerrado; antes conserva lo guardado.
- `reuniones.meta`: manual (editable) antes de `REUNIONES_META_AUTO_START = {year:2026, month:9}`; desde ahí derivada con `computeReunionesMeta(clients, justificativos)` (`utils/reunionesMeta.js`): 1 por marca de la línea menos las `no_aplica`. Se recalcula solo en mes en curso y no cerrado (`metaAutoSync` en `OperacionesView.jsx`, comparado con la fecha real de hoy); pasados/cerrados conservan la guardada (input deshabilitado).
- `reuniones.comentario`: editable, se congela como el resto.
- `reuniones.justificativos` `{clienteId: motivo}`: `no_aplica` descuenta de la meta; `reprogramado_cliente`/`no_cumplio` informativos. Se captura en "Ver marcas" de Section 1 (`ReunionesClientesModal.jsx`): marcas activas con check si tienen reunión (`loadHeldClientIdsForLine`) o `<select>` (No aplica / Reprogramado por el cliente / No cumplió, `JUSTIFICATIVOS_REUNION` en `constants.js`). Al cargar se podan del mapa las marcas ya cubiertas.
- Reuniones no lee de `tasks` ni de `projects`.

### Reporte efectivo (pipeline único)
- `metric_reports.data` = lo capturado; lo mostrado y puntuado = `buildEffectiveReport(storedData, sources, ctx)` (`src/utils/buildEffectiveReport.js`, puro).
- Todas las vistas de lectura usan `loadYearReportsEffective(companyId, year, opts)` (`metricsApi.js`): `DashboardView` (Resumen, `autoSave:true`), `HomePage`, `LineHubView`, `LinesView` (Empresa→Líneas), `LineFichaModal`. `loadYearReports` es `@deprecated` (solo mocks de tests).
- Fuentes por lote: `loadReportSources` (`reportSourcesApi.js`), una query por tabla para todos los pares línea×mes; solo para reportes "calientes" (`needsSourcesFor`: mes abierto y dentro de alguna era). Mes cerrado → `data` intacto, sin red.
- Tabla → indicador → era:
  - `meetings` → Reuniones → `REUNIONES_MODULE_START`
  - `fixed_task_marks` → Productividad/Tareas Fijas → `TAREAS_FIJAS_MODULE_START`
  - `publication_checks` → Productividad/Plataformas → `CHEQUEO_PRODUCTIVIDAD_START`
  - `av_pautas` → Piezas y Pautas → `AUDIOVISUAL_MODULE_START`
  - `cnp_requests`+`tasks` → Solicitudes → `SOLICITUDES_MODULE_START`
- Sin fila, sin score: la lectura nunca inventa un mes.
- `fixed_task_marks` y `publication_checks` se cargan company-wide y paginadas (`loadFixedTaskMarks(companyId, …)` en `metricsApi.js`, `loadChecks` en `chequeoApi.js`), se reparten sin filtrar a todas las líneas; `computeProductividad` y `computePlataformasProductividad` filtran por `client_id` contra las cuentas de la línea. Igual en `TareasFijasPage` y `FixedTasksReportPreview.rowsForLine`.
- Test de equivalencia: mismo fixture → mismo score por `calcTotal`, `monthLineScore` y `aggregateMetricsDashboard`.

### Auto-persistencia del efectivo
- Si lo derivado difiere de lo guardado y el reporte no está cerrado → upsert silencioso (para que SQL/MCP sobre `metric_reports` coincida con la app).
- Corre solo en `loadYearReportsEffective(..., { autoSave: true })` (`DashboardView`) y `maybeAutoPersistEffectiveReport(companyId, {...})` (`metricsApi.js`, desde `OperacionesView.load()` si la fila ya existe; nunca crea fila).
- NO corre en Inicio, Hub de línea, Empresa→Líneas ni ficha de línea.
- Merge de solo las 7 claves operativas (`reuniones, productividad, crecimiento, solicitudes, pautas, piezas, feedback`); `finanzas` y claves desconocidas intactas. `hasOperationalDiff` compara solo esas 7 claves.
- Dedupe en memoria `_autoSaveDone` (`Map<lineId__year__month, hash>`). Fallos → `console.warn`, nunca rompen UI. En "Ver como" (`src/lib/viewAs.js`/`viewOnlyClient.js`) el candado de escritura del cliente bloquea el upsert. No amplía permisos (RLS idéntica lectura/escritura).

### Cierre de reporte
- Nivel 4/admin (`reportes.close`) o jefa de línea cierran desde `LineView.jsx` (botón junto al selector y en Resumen, modal de confirmación). Texto: "Marcar reporte como listo" (jefa) / "Cerrar reporte" (capability).
- Irreversible: no hay reapertura en la app.
- Cerrado → `OperacionesView`/`FinanzasView` reciben `closed` y envuelven el form en `<fieldset disabled>` (comparten fila, ambos botones Guardar bloqueados). Badge "Reporte cerrado" o "Cerrado automáticamente" (si `closed_auto`, con fecha).
- Garantía real: trigger `metric_reports_prevent_closed_edit` (`prevent_closed_report_edit()`) rechaza todo `UPDATE` si `closed_at` no es null.
- Cierre automático: cron `enqueue-metric-report-closures` (pg_cron, 07:30 Caracas, `enqueue_metric_report_closures()`), líneas no-generales. Días 1-4: recordatorio in-app `report_close_reminder` a la jefa con días restantes. Día 5: cierra incondicionalmente el mes anterior tal cual (crea fila vacía si no existe), `closed_auto = true`, notifica `report_autoclosed` a jefa + nivel ≥4. Sin heurística de completitud (solo fechas). Por-línea `BEGIN/EXCEPTION`, observable en `notif_cron_runs`. Cerrar antes del día 5 saca la línea de los avisos.
- Frontend: `reportClosure.js` (lógica pura, `now` inyectable); `useReportCloseReminder.js` + `ReportCloseReminderModal.jsx` (modal al iniciar sesión días 1-5, persistencia por fecha en `localStorage` vía `reportReminder.js`, montado en `AppLayout.jsx` tras `WhatsNewModal`); `notificationFormat.js` (`entity_type: 'metric_report'`, deep-link `/reportes/linea/:id?tab=operaciones&year=&month=`).

### Mover cuenta de línea
- Cuenta que ya tiene línea: flujo "Mover de línea" (`MoverClienteModal.jsx` desde `ClientModal`, `isFinancePrivileged`). Orquestador `metricsApi.moveClientToLine()` + util puro `src/utils/moveClientLine.js`. Auditoría en `metric_client_line_moves`.
- Inmediato ("este mes cuenta para la nueva"): ingreso `monthly_fee` prorrateado por días (`src/utils/prorateMonthlyFee.js`, editable) → fila manual en la vieja (sobrevive a `syncReportClients`) + fila ligada en la nueva; operativo (crecimiento/pautas/feedback/justificativo) migra con valores a la nueva.
- Diferido ("se queda con la vieja"): `scheduleClientLineMove` no toca `line_id` ni reportes; setea `pending_line_id` + `line_change_at` = 1° del próximo mes. pg_cron diario `apply_due_client_line_moves` hace el flip (y limpia staff). Cancelable desde `ClientModal`.
- Tareas: al aplicarse, las abiertas (`status <> 'Terminado'`) pasan a `tasks.team_id` nueva con `assignee_ids = [lead]` vía SECURITY DEFINER `reassign_client_open_tasks(client_id, to_line_id, assignee?)`; las 'Terminado' quedan intactas.
- Destino puede ser "Independientes" (`is_general`; el modal recarga con `includeGeneral`). Si el destino no tiene jefe, se elige responsable a mano (diferido: `metric_clients.pending_task_assignee`).
- Meses pasados: `OperacionesView` resuelve nombre/logo company-wide (`loadClients(companyId, null, {includeArchived:true})`) con etiqueta "· otra línea" en vez de `"[Cliente eliminado]"`.

### Fin de contrato
- Editable en `ClientModal` (también archivados). Mes de fin cuenta completo; desde el siguiente la marca no aparece.
- Al guardar uno nuevo, `cleanupClientAfterContractEnd` (`metricsApi.js` + `src/utils/stripClientFromReport.js`) quita la marca de reportes guardados posteriores (todas las líneas), respetando los cerrados.

## UX
- `EmployeeInfoModal` (clic en empleado en Resumen o fila de Sueldos): foto `w-24 h-24`, nombre, cargo, dpto, email, teléfono, fechas, línea, `positions.position_description` y funciones (`positions.position_functions jsonb[]`) en bullets.
- `ClientFichaModal` (clic en marca en Resumen/Operaciones/Finanzas): mensualidad, día de pago (solo `isFinancePrivileged`), web, contactos, redes, botón deep-link a Tareas. Cuerpos en `EmployeeFichaContent.jsx`/`ClientFichaContent.jsx`; los modales son wrappers (overlay + X + Escape). `LineFichaModal` los embebe.
- Resumen (`LineHubView`): siempre renderiza (banner si no hay reportes del año). "Equipo de la línea": Empleados | Marcas, cada una con toggle Lista/Tarjetas (`ViewToggle` + `EntityGridList`, compartidos con `LineFichaModal`). Empleados vía `loadCompanyEmployees(companyId)` (joins position+department). Sin "Promedio anual" ni "Radar de indicadores".
- Finanzas (`FinanzasView`): Ingresos con toggle Lista/Tarjetas, default Tarjetas, monto editable inline, nombre abre `ClientFichaModal`. Sueldos: fila por empleado del team, solo `isFinancePrivileged`. KPIs "Ingresos brutos" y "Total egresos" hacen scroll a su sección.

## Gotchas
- Acceso concedido por Permisos a nivel <3: el frontend deja entrar pero RLS devuelve vacío (fase 2 pendiente).
- `fixed_task_marks`/`publication_checks` guardan un `line_id` snapshot: NUNCA filtrar por `line_id` (cuentas movidas a mitad de mes quedarían huérfanas); filtrar por `client_id`.
- Meses pasados no reconcilian porque `metric_line_members` no tiene historial: reconciliar borraría bajas posteriores y agregaría altas retroactivas.
- `pruneCarryForward` existe porque un mes pasado sin fila nace congelado y heredaría nómina/cartera de otro mes.
- `realizadas` no se recalcula antes de `REUNIONES_MODULE_START`: no hay `meetings` y pisaría con 0.
- No auto-persistir desde `LinesView`: está suscrita a `postgres_changes` sobre `metric_reports` (canal `empresa-lineas`) → bucle.
- `hasOperationalDiff` sobre el objeto completo dispararía upsert en cada carga por deltas de `finanzas`.

## Conexiones con otros módulos
- Reuniones (§2.11): `meetings`, `countMeetingsHeldForLine`, `loadHeldClientIdsForLine`.
- Tareas (§2.4): fila "Independientes", `tasks` (Solicitudes, reasignación al mover cuentas), `TareasFijasPage`/`fixed_task_marks`.
- Chequeo de publicaciones: `publication_checks` (`chequeoApi.js`).
- Audiovisual: `av_pautas`. CNP: `cnp_requests`.
- Empresa: `LinesView`, `LineMetasModal`, `LineFichaModal`, `ClientsView`/`ClientModal`.
- Inicio (`HomePage`), Notificaciones (`notificationFormat.js`, `notif_cron_runs`), Permisos (§1), "Ver como".
