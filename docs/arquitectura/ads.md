# Ads / Campañas (§2.10)

## Resumen
- **Tácticas**: historial de tácticas orgánicas por marca (qué plan se hizo, qué se cumplió, cuándo vence el siguiente). El detalle de cada táctica vive en una carpeta de Drive; MAPPI guarda solo los datos básicos y el link. **Ads**: pauta pagada, con tracking de inversión vs. presupuesto mensual por cliente.
- Ruta única `/ads`; tabs "Tácticas"/"Ads" en **estado local** de `AdsPage` (no por ruta, sin sub-ítems en Sidebar). Dentro de Tácticas, las subvistas van por query param.

## Rutas y archivos
- `/ads` (`?line=` preselecciona línea; `?view=vigentes|marca|historial` y `?client=<id>` eligen la subvista de Tácticas y la marca de la ficha).
- `src/pages/AdsPage.jsx` (host).
- Tácticas: `src/components/ads/tacticas/` (`TacticasView` host de subvistas · `TacticasAlertCards` · `TacticasPorHacer` · `TacticasVigentesTable` · `TacticasPorMarca` · `DaysPill` · `SinTacticaAviso` · `tacticasApi.js`) + `AdsList.jsx` (vista Historial) · `AdsCard.jsx` · `AdsForm.jsx` · `AdsDetail.jsx` · `constants.js` · `CampaignChecklist.jsx`.
- Lógica pura de Tácticas: `src/utils/tacticas.js` (`isVigente`, `daysLeft`, `latestByBrand`, `brandsWithoutVigente`, `completionPct`, `parseDriveId`, `closeDateOf`, `handoffContent`, `carryOverItem`, …).
- Ads: `AdsSpendView.jsx` · `AdsSpendStats.jsx` · `AdsSpendForm.jsx` · `AdsSpendDetail.jsx` · `AdsResultsModal.jsx` · `campaignSpendApi.js`.
- Compartido: `ClientCell.jsx` (logo/inicial + nombre), `StatusPill` (§5), `src/hooks/useScopedClients.js`.
- Export: `src/utils/exportAdsToExcel.js` (botón "Excel" en toolbar de tab Ads).
- `campaignSpendApi.js`: `updateAd()`, `loadAdsResponsables(companyId)`, `inPeriod()`, `spentByClientInPeriod()` (también lo usa Reportes), `fmtDate()`/`dateColor()` (compartidas con Tácticas).
- Edge fn `supabase/functions/notify-campaign-assignee/index.ts`: email Resend al asignar campaña (solo Tácticas).

## Datos
- `campaigns` (Tácticas): `id, name, client` (nombre snapshot), `client_id→metric_clients, assignee→users, priority` (sin uso en la UI; queda el default `'Media'`), `status, notes, objective, drive_url, checklist (jsonb `[]`), start_date, end_date, closed_at, created_by→users, created_at, updated_at`. Sin `company_id`.
- `campaign_handoffs` (insumo para la siguiente táctica): `id, client_id→metric_clients, source_campaign_id→campaigns` (unique)`, status` (`pendiente`/`usado`/`descartado`)`, consumed_by_campaign_id→campaigns, created_at, updated_at`. Solo guarda el ESTADO; su contenido se deriva en vivo del checklist de la táctica de origen.
- `campaigns.objective`: objetivo general (texto). `drive_url`: link a la carpeta de Drive con el PDF y el editable (opcional; vacío = `null`). `closed_at`: cuándo pasó a Finalizado (lo fija un trigger; `null` si se reabre).
- `paid_campaigns` (Ads): `id, company_id, client_id→metric_clients, client, name, objective, piece_url, amount, start_date, end_date, status, responsable_id→users (texto, sin FK), reach, interactions, followers, impressions, views, profile_visits, results_pending, created_by, created_at, updated_at`. Resultados `integer` nullable. `duracion` no se almacena: se deriva en JS (`durationDays`).
- `campaigns.checklist`: array `{ id, title, done, month?, carried_from? }`. `month` (`'YYYY-MM'`) agrupa las acciones por mes; `carried_from` solo pinta un badge.
- `metric_clients.campaign_budget`: USD/mes, editable en `ClientModal.jsx`, visible a todos (no gated financiero).
- `users.ads_responsable_fixed` · `metric_line_members.is_lead`.
- Estados: `STATUSES` en `constants.js` = `Pendiente`, `En Curso`, `Finalizado` (seleccionables). `Descartado` es legacy: fuera de `STATUSES`, pero sigue en `STATUS` (meta) para que `StatusPill` pinte filas históricas. `campaigns.status`/`paid_campaigns.status` son `text` libre, sin CHECK.

## Permisos
- Todo el acceso se gestiona desde Empresa → Accesos; no hay reglas fijas por nivel en el código.
- `ads` (módulo): abierto. Lectura de `campaigns`/`paid_campaigns`: RLS `using(true)`.
- `ads.manage`: crear/editar/eliminar en ambas tablas (UI `canManage` y RLS `user_can('ads.manage')`).
- `ads.ver_todo`: botón "Todos" (campañas de todas las líneas) y todos los clientes en los selectores. Sin ella: solo las líneas de las que el usuario es miembro; sin línea y sin la capability no ve campañas (en selectores solo clientes sin línea). Prod: nivel ≥ 4, o usuarios Juan Pedro Sierra, Andrea Garcia y Luis Fernando González (`20261117140000_ads_ver_todo_y_rls_campaigns.sql`).

## Reglas de negocio
### Comunes a ambas tabs
- Selector mes/año (patrón `ClientsView`, §2.6): solo en la pestaña Ads; filtra por `start_date` dentro del mes (`inPeriod()`).
- Pills de línea (patrón `TareasPage`): "Todos" solo con `ads.ver_todo` + una por línea de la que el usuario es miembro (todas si tiene `ads.ver_todo`); quien no la tiene arranca en su primera línea. Acotan ambas tabs vía `lineScope` (`client_id → clientsById.get(id).line_id`).
- Selector de cliente en `AdsForm`/`AdsSpendForm`: `useScopedClients()`. Con `ads.ver_todo`: todos. Sin ella: clientes de sus líneas + sin `line_id`. Al editar, el cliente seleccionado se conserva aunque sea de otra línea.
- Clic en fila (fuera de controles) → modal solo lectura (`AdsDetail.jsx` / `AdsSpendDetail.jsx`) con Editar/Eliminar si `canManage`. El estado es editable ahí vía `StatusPill` (llama `supabase.update`/`updateAd`). Controles internos (`StatusPill`, edición inline del nombre, acciones, "Ver pieza") detienen la propagación.
- Estado editable en tabla con `StatusPill` (`editable={canManage}`) en Historial y Ads.
- Cierre automático diario `pg_cron` (`enqueue_campaign_closures()`, §2.9): `end_date < hoy` (Caracas) y `Pendiente`/`En Curso` → `Finalizado`; notifica a responsable + Marketing Managers.

### Tácticas
- **Selector de período y pills de línea:** el mes/año es solo de la pestaña Ads. Tácticas no se filtra por mes (es un historial); sí por línea (`lineScope`), derivada del cliente (`client_id → metric_clients.line_id`).
- **Vigente** = `status` en `Pendiente`/`En Curso` **y** `end_date >= hoy` (Caracas, `todayCaracas()`). Si `start_date > hoy` se rotula "programada" y cubre igual a la marca. `Finalizado` y `Descartado` nunca son vigentes, aunque `end_date` sea futura.
- Una marca puede tener **varias vigentes** a la vez. "La última táctica de la marca" = `max(start_date)`, desempate por `created_at` (`latestByBrand`); se calcula, no hay flag. Las tácticas sin `client_id` no pertenecen a ninguna marca: salen en Historial pero no cuentan en "por hacer" ni en la ficha.
- **Subvistas** (`TacticasView`, `?view=`):
  - *Vigentes* (default): tarjetas (vigentes, vencen en 3 días, vencen este mes, marcas sin táctica; las tres primeras filtran), lista **Por hacer** (marcas sin vigente ni programada, con "Cargar táctica" que abre `AdsForm` con la marca precargada vía `prefill`), filtros (`FilterBar`: buscar, jefa, mes de vencimiento, estado) y tabla ordenada por la que vence primero.
  - *Por marca* (`?client=`): `DescribedSelect` de marca, encabezado (línea + jefa), aviso "Sin táctica vigente", una tarjeta por táctica vigente (barra del período, checklist tildable) e historial con % de cumplimiento y Drive.
  - *Historial*: todas las tácticas en `AdsList` (búsqueda, estado, cliente, orden por columna, edición inline del nombre).
- **Jefa** = miembro con `is_lead` de la línea de la marca (`leadNameOf`); no se guarda en la táctica.
- **Pill de días** (`DaysPill`): rojo si quedan ≤ 3 días o ya venció, amarillo ≤ 10, verde el resto (`DAYS_RED`/`DAYS_YELLOW` en `tacticas.js`).
- **Resultado de una táctica = % de cumplimiento** del checklist (`completionPct`). Sin checklist es `null` ("sin acciones registradas"), no 0 %. No se capturan métricas de redes en las tácticas.
- **Relevo entre tácticas ("sale una, entra una"):**
  - Al pasar a `Finalizado` (por el cron, el `StatusPill` o el formulario) un trigger crea el insumo de la marca (`campaign_handoffs`, `pendiente`). No se crea para las tácticas que ya estaban cerradas antes de existir el trigger. Si la táctica se reabre, el insumo pendiente se borra.
  - Solo hay insumo visible si la táctica tenía checklist. Se ve en la ficha por marca ("Insumo para la siguiente táctica": cumplimiento, acciones pendientes) y la marca lleva el badge "Con insumo" en *Por hacer*.
  - Al crear una táctica para esa marca, `AdsForm` ofrece las acciones pendientes (`carryOverItem`: sin tildar, sin el mes viejo, con `carried_from`). Si se arrastra al menos una, el insumo pasa a `usado` (`consumed_by_campaign_id`); si no se arrastra nada queda `pendiente`. "Descartar insumo" lo pasa a `descartado`.
- **Avisos de vencimiento:** 3 días antes y el día del vencimiento (`enqueue_tactic_expiry_reminders()`, ver `notificaciones.md`). Si la marca ya tiene otra táctica en marcha que termina después, no avisa. El aviso abre el detalle: `/ads?campaignId=<id>` (`AdsPage` lo lee y limpia el parámetro).
- **Ficha del cliente** (`ClientFichaContent`, Reportes y Empresa): `SinTacticaAviso` muestra "Sin táctica vigente" con enlace a la ficha por marca. Si la consulta falla no muestra nada.
- **Score de empleados:** la táctica cuenta en el mes en que se cierra, con su % final (`calcCampanas` + `closeDateOf`, espejo de la RPC `employee_score_inputs`). Solo `Finalizado` y con checklist; una táctica sin acciones no cuenta como 0 %.
- **Link de Drive:** `AdsForm` lo valida con `parseDriveId` (carpeta, archivo o Google Doc) y guarda `null` si queda vacío. Se avisa "Falta el link / Completa el link de Drive" solo en la última táctica de cada marca y solo con `ads.manage`.
- Responsable con `UserPickerSingle` (toda la plantilla).
- Checklist: se edita en `AdsForm` (parte de `fields`; cada acción puede llevar mes), se tilda en `AdsDetail` y en la ficha por marca (`editable={false}`, persiste cada cambio con `updateCampaign`), `AdsCard` muestra el %. Reusa `checklistProgress` de `tareas/taskChecklist.js`.

### Ads (pauta pagada)
- Tabla (`AdsSpendView`), mismo look que Tácticas: sin índice, `fmtDate()`/`dateColor()`, `ClientCell.jsx`, acciones al hover (`opacity-0 group-hover:opacity-100`). Columnas: `Cliente, Nombre de campaña, Responsable, Inicio, Fecha fin, Duración, Objetivo, Pieza, Monto, Estado, Acciones`. Sin orden por encabezado. Cambio de estado: `handleAdStatusChange` → `updateAd()` → `handleSaved()`.
- Responsable acotado (`loadAdsResponsables`, dos consultas encadenadas sin JOIN de Supabase, §5): `users.ads_responsable_fixed = true` (Katherine Mora, Paola Urdaneta, Nairim Fernández) + jefas de línea (`metric_line_members.is_lead = true`, dato guardado, no recalculado).
- Cards `AdsSpendStats.jsx`: Total Ads, Invertido, Pendientes, Completados, Avance Global (layout de `AdsStats`). Toolbar: búsqueda, estado, cliente. Tracking invertido-vs-presupuesto del cliente seleccionado (`spentByClientInPeriod()`).
- Aviso de sobrepaso (no bloquea): si Σ montos del cliente en el mes de inicio + nuevo monto > `campaign_budget` → "Te estás pasando del presupuesto aprobado…". `AdsSpendDetail.jsx` recibe `ads` y `client` para mostrar el mismo aviso.
- **Resultados al finalizar**: pasar a `Finalizado` nunca persiste directo; `AdsSpendView.requestStatusChange` abre `AdsResultsModal.jsx` con los 6 indicadores de `RESULT_FIELDS` (Alcance, Interacciones, Seguidores, Impresiones, Visualizaciones, Visitas al perfil → `reach/interactions/followers/impressions/views/profile_visits`) con checkbox; exige ≥1 con valor; guarda `updateAd(id, { status: 'Finalizado', ...RESULT_FIELDS con valor o null })` y `results_pending = false`. Otros estados se persisten directo. Cubre las 3 vías: pill de fila, pill del header de `AdsSpendDetail` (prop `onStatusChange`) y `<select>` de `AdsSpendForm.jsx` (selector inline).
- Resultados nunca son columnas en pantalla; se ven en `AdsSpendDetail.jsx` (sección "Resultados" si `status === 'Finalizado'` y ≥1 capturado) y al final del Excel.
- `paid_campaigns.results_pending = true` (puesto por el cron): badge "⚠ Faltan resultados" en `AdsSpendView` (abre `AdsResultsModal` si `canManage`) y aviso con botón "Cargar resultados" en `AdsSpendDetail`.
- Excel (`exportAdsToExcel.js`, ExcelJS, `.xlsx`): ads visibles según período/búsqueda/estado/cliente; banner de marca, cabecera amarilla, 6 columnas de resultado al final (en blanco si no capturados o no `Finalizado`); sin Responsable.

## Gotchas
- **Naming:** nada nuevo del módulo puede llamarse `ads` (archivo tipo `adsApi`, tabla `ads`): uBlock y similares bloquean archivos "ads"+"api" y URLs REST con segmento `/ads?...` (`net::ERR_BLOCKED_BY_CLIENT`). Por eso `campaignSpendApi.js` (no `adsApi.js`) y tabla `paid_campaigns` (no `ads`). La carpeta `components/ads/` y la ruta `/ads` no se ven afectadas.
- `is_lead` se sembró por coincidencia de nombre (`users.first_name ilike metric_lines.name`; las líneas llevan el nombre de la jefa, `SEED_LINES`); queda guardado como dato, no se recalcula.
- `company_id` de una táctica se deriva de `assignee`/`created_by` (no existe en `campaigns`).

## Conexiones
- Ads → Empresa: `client_id` → `metric_clients`; `campaign_budget`.
- Ads → Reportes: `OperacionesView` usa `spentByClientInPeriod` ("Inversión Ads").
- Ads → Notificaciones: `campaign_autoclosed`/`ad_autoclosed` y aviso de vencimiento `campaign_due_soon` (§2.9).
- Ads → Empresa/Reportes: aviso "Sin táctica vigente" en la ficha del cliente.
- Ads → Inicio (`ceo-analysis.js`) y score de empleados (`campaigns`/`paid_campaigns`).
