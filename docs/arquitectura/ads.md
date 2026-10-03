# Ads / Campañas (§2.10)

## Resumen
- Campañas/tácticas orgánicas (tab **Tácticas**) y pauta pagada (tab **Ads**), con tracking de inversión vs. presupuesto mensual por cliente.
- Ruta única `/ads`; tabs "Tácticas"/"Ads" en **estado local** de `AdsPage` (no por ruta, sin sub-ítems en Sidebar).

## Rutas y archivos
- `/ads` (`?line=` preselecciona línea).
- `src/pages/AdsPage.jsx` (host).
- Tácticas: `src/components/ads/AdsList.jsx` · `AdsCard.jsx` · `AdsForm.jsx` · `AdsDetail.jsx` · `AdsStats.jsx` · `constants.js` · `CampaignChecklist.jsx`.
- Ads: `AdsSpendView.jsx` · `AdsSpendStats.jsx` · `AdsSpendForm.jsx` · `AdsSpendDetail.jsx` · `AdsResultsModal.jsx` · `campaignSpendApi.js`.
- Compartido: `ClientCell.jsx` (logo/inicial + nombre), `StatusPill` (§5), `src/hooks/useScopedClients.js`, `src/utils/lineMembers.js` (`clientsForUser()`, `userViewsAllLines()`, `visibleLinesForUser`).
- Export: `src/utils/exportAdsToExcel.js` (botón "Excel" en toolbar de tab Ads).
- `campaignSpendApi.js`: `updateAd()`, `loadAdsResponsables(companyId)`, `inPeriod()`, `spentByClientInPeriod()` (también lo usa Reportes), `fmtDate()`/`dateColor()` (compartidas con Tácticas).
- Edge fn `supabase/functions/notify-campaign-assignee/index.ts`: email Resend al asignar campaña (solo Tácticas).

## Datos
- `campaigns` (Tácticas): `id, name, client_id→metric_clients, assignee→users, priority, status, notes, checklist (jsonb `[]`), start_date, end_date, created_by→users, updated_at`. Sin `company_id`.
- `paid_campaigns` (Ads): `id, company_id, client_id→metric_clients, client, name, objective, piece_url, amount, start_date, end_date, status, responsable_id→users (texto, sin FK), reach, interactions, followers, impressions, views, profile_visits, results_pending, created_by, created_at, updated_at`. Resultados `integer` nullable. `duracion` no se almacena: se deriva en JS (`durationDays`).
- `campaigns.checklist`: array `{ id, title, done }`.
- `metric_clients.campaign_budget`: USD/mes, editable en `ClientModal.jsx`, visible a todos (no gated financiero).
- `users.ads_responsable_fixed` · `metric_line_members.is_lead`.
- Estados: `STATUSES` en `constants.js` = `Pendiente`, `En Curso`, `Finalizado` (seleccionables). `Descartado` es legacy: fuera de `STATUSES`, pero sigue en `STATUS` (meta) para que `StatusPill` pinte filas históricas. `campaigns.status`/`paid_campaigns.status` son `text` libre, sin CHECK.

## Permisos
- Ver: cualquier autenticado.
- Crear/editar/eliminar (`campaigns` y `paid_campaigns`): capability `ads.manage`, `access_level ≥ 3` o admin (`canManage` en UI).

## Reglas de negocio
### Comunes a ambas tabs
- Selector mes/año (patrón `ClientsView`, §2.6): filtra por `start_date` dentro del mes (`inPeriod()`).
- Pills de línea (patrón `TareasPage`): "Todos" solo nivel 4/admin + una por línea de `visibleLinesForUser`; jefas arrancan en la suya. Acotan ambas tabs y sus tarjetas vía `lineScope` (`client_id → clientsById.get(id).line_id`).
- Selector de cliente en `AdsForm`/`AdsSpendForm`: `useScopedClients()` → `clientsForUser()`. Con línea propia: clientes de esa línea + sin `line_id`. Sin línea real (Independientes/Alta gerencia) o `userViewsAllLines()` (nivel ≥4, admin, `tasks_view_all`): todos. Al editar, el cliente seleccionado se conserva aunque sea de otra línea.
- Clic en fila (fuera de controles) → modal solo lectura (`AdsDetail.jsx` / `AdsSpendDetail.jsx`) con Editar/Eliminar si `canManage`. El estado es editable ahí vía `StatusPill` (llama `supabase.update`/`updateAd`). Controles internos (`StatusPill`, edición inline del nombre, acciones, "Ver pieza") detienen la propagación.
- Estado editable en tabla con `StatusPill` (`editable={canManage}`).
- Cierre automático diario `pg_cron` (`enqueue_campaign_closures()`, §2.9): `end_date < hoy` (Caracas) y `Pendiente`/`En Curso` → `Finalizado`; notifica a responsable + Marketing Managers.

### Tácticas
- Responsable con `UserPickerSingle` (toda la plantilla).
- Checklist: se edita en `AdsForm` (parte de `fields`), se tilda en `AdsDetail` (`editable={false}`, persiste cada cambio), `AdsCard` muestra `X/N`. Reusa `checklistProgress` de `tareas/taskChecklist.js`.

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
- Ads → Notificaciones: `campaign_autoclosed`/`ad_autoclosed` (§2.9).
- Ads → Inicio (`ceo-analysis.js`) y score de empleados (`campaigns`/`paid_campaigns`).
