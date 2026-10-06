# Convenciones de código y componentes compartidos

## Convenciones de código

| Convención | Detalle |
|---|---|
| Status de proyecto | Title-case español: `"Pendiente"`, `"En proceso"`, `"Completado"` |
| Status de tarea (phases jsonb) | Lowercase underscore: `"pendiente"`, `"en_proceso"`, `"pausada"`, `"completada"` |
| Status de tarea (tabla `tasks`) | `"En proceso"`, `"Por revisar"`, `"Paralizado"`, `"Pendiente"`, `"Terminado"` |
| Modal convention (AppLayout) | `undefined` = cerrado · `null` = crear · objeto = editar |
| Filtros sidebar | `"all"`, `"En proceso"`, etc. para estado; `"dept:Diseño"` para departamento |
| Color de marca | `#FFB800` (amarillo/dorado) para estados activos y acentos |
| Fondo | `#f2f0e8` (crema cálido) con patrón de puntos (clase `.main-bg`) |
| Relaciones "texto sin FK" (`assignee`, `created_by`, `responsable_id`, `metric_line_members.user_id`) | No se puede usar el embed automático de PostgREST (`select=*, users(...)`) porque no hay FK declarada. Se resuelven con consultas encadenadas + un `Map` en JS (ver `loadAdsResponsables()` en `campaignSpendApi.js`, o `usersMap`/`clientsById` en `AdsPage.jsx`), nunca agregando una FK solo para habilitar el embed. |
| Escrituras nuevas | Toda escritura debe salir por el cliente de `src/supabase.js` (`from().insert/update/upsert/delete`, `rpc`), que es donde vive el candado del modo "Ver como". Si una escritura va por otra vía (Netlify function con service-role, `fetch` a `/api/*`), hay que guardarla a mano con `blockedByViewOnly()` de `src/lib/viewOnlyClient.js`. Un RPC nuevo que solo lea se agrega a `READONLY_RPCS` en `src/lib/viewAs.js`. |
| Loaders "trae todo" (sin filtro de mes/línea acotado) | Supabase corta las respuestas en **1000 filas por defecto** (Settings → API → Max rows), en silencio, sin `.order()` explícito ni error — dos llamadas concurrentes pueden recibir subconjuntos distintos e indistinguibles de "no hay más datos" (bug real: `publication_checks` superó las 1000 filas del mes y unos usuarios veían el Chequeo incompleto). Todo loader que traiga un conjunto sin cota debe usar `selectAllPages` (`src/lib/supabasePaginate.js`) con una columna de orden estable (`id` como desempate mínimo). Ver `loadChecks` en `chequeoApi.js`, `loadPautas` en `avPautasApi.js`, la carga de `tasks` en `TareasPage.jsx`/`HomePage.jsx`, y `fixed_task_marks` en `TareasFijasPage.jsx`. |

## Componente compartido de filtros — `FilterBar` (ESTÁNDAR para vistas nuevas)

`src/components/common/FilterBar.jsx` es el punto de partida obligatorio para cualquier
vista con filtros nueva. **Los filtros van en COLUMNAS (una grilla), nunca uno debajo
del otro**: cada control ocupa su celda con la etiqueta encima, y todos quedan alineados
a la misma altura y con el mismo ancho. El patrón viejo (`flex items-center gap-2
flex-wrap` con selects de ancho automático, como todavía usan `AdsList.jsx`,
`LeadsTable.jsx`, `BaseView.jsx` y `CnpBaseView.jsx`) los apilaba en cuanto la pantalla
se angostaba y daba anchos desparejos según el largo del texto de cada `<option>`.

Uso: `<FilterBar cols={5} onClear={hasFilters ? clearFilters : undefined}>` con un
`<FilterField label="…">` por control, y el control con `w-full`. `cols` (2-6) son las
columnas en desktop; la grilla baja a 3 en tablet y 2 en móvil. Las clases de columnas
están mapeadas a literales (`COLS_LG`) porque Tailwind no genera clases construidas por
interpolación. `FilterField` envuelve el control en un `<label>`, así que la etiqueta
visible ES el nombre accesible: no hace falta `aria-label`, y los tests seleccionan por
`getByLabelText('Tipo')`. Pasar `onClear` solo cuando haya filtros activos, para que
"Limpiar" no aparezca sin nada que limpiar. Primer consumidor: `MovimientosView.jsx`.
Las vistas viejas se pueden migrar cuando se las toque; no es un refactor pendiente.

## Componente compartido de selección con descripción — `DescribedSelect`

`src/components/common/DescribedSelect.jsx` para elegir una opción entre varias cuando
cada una necesita explicarse: muestra el nombre resaltado y debajo, más chico, qué entra
en esa opción. **No es un `<select>` nativo** porque un `<option>` no admite dos líneas
con estilos distintos, y sin la descripción la gente elige a ciegas. El menú va vía
`createPortal` con posición `fixed` y abre hacia arriba si no hay espacio abajo (mismo
patrón y mismas razones que `StatusPill`), con `max-height` y scroll interno para no
crecer sin límite. Props: `value` (key), `options` (`[{key, label, description}]`),
`onChange(key)`, `placeholder`, `ariaLabel`, `disabled`. Primer consumidor: el "¿En qué?"
de `PagoPartidaModal.jsx` (ver **Rubros de gasto** en el módulo Finanzas).

## Componente compartido de estado — `StatusPill`

`src/components/common/StatusPill.jsx` es el único punto de partida recomendado para
mostrar/editar el "estado" de una entidad (no un filtro ni un `<select>` de formulario
de captura inicial). Props: `value`, `meta` (`{ [key]: { label, bg, text, dot } }` —
clases Tailwind **literales**, no construidas dinámicamente), `options` (orden de las
keys seleccionables), `editable`, `onChange(nextValue)`. No editable → badge de solo
lectura; editable → botón píldora con punto de color + chevron que abre un menú con
todas las opciones. El menú se renderiza vía `createPortal` en `document.body` con
posición `fixed` calculada desde el botón (recalculada en `scroll`/`resize` mientras
está abierto) — no queda recortado por contenedores con `overflow` (p. ej. tablas con
scroll horizontal). **No hace llamadas a datos**: cada pantalla conserva su propia
función de persistencia y se la pasa como `onChange`.

Adoptado hoy solo en el módulo **Ads** (`AdsCard.jsx`, `AdsDetail.jsx`,
`AdsSpendDetail.jsx`, `AdsSpendView.jsx` — reemplazó el botón click-to-cycle y los
`<select>` nativos coloreados que tenía cada uno). Antes de este componente, un
relevamiento encontró **6 mapas de color distintos** (Ads, Tareas, Proyectos, Tickets,
Evaluaciones — Tailwind bg/text, Tailwind string única, y hex inline en `style`) y
**5 formas de interacción** (badge RO, click-to-cycle, `<select>` coloreado, dropdown
con `createPortal` + chevron + punto en Tareas `BaseView.jsx`, y botones de transición
fija en Tickets). Candidatos a migrar después, **no migrados aún**:

- `src/components/tickets/TicketStatusBadge.jsx` (badge RO — migración directa).
- `src/components/ProjectCard.jsx` / `ProjectDetailModal.jsx` (badges/selects con hex
  inline vía `style` — requiere convertir sus mapas `STATUS`/`TASK_S` de
  `src/constants/projectStatus.js` a clases Tailwind literales, conservando aparte el
  valor hex crudo que usan para el anillo de progreso `conic-gradient`).
- `src/components/tareas/BaseView.jsx` (dropdown con `createPortal` propio — migrable
  directamente ahora que `StatusPill` ya soporta portal).

## Componente compartido de ícono de red social — `NetworkIcon`

`src/components/common/NetworkIcon.jsx` es el punto de partida recomendado para mostrar
una red social (Instagram, Facebook, TikTok, X, YouTube, YouTube Shorts, LinkedIn,
Mailchimp) en la UI: un badge circular con el glifo de la marca (SVG inline, sin
dependencias externas), en vez de una abreviatura de texto. Props: `network` (string),
`size` (px, default 20). Red no catalogada → ícono genérico (globo). "YouTube" y "YouTube
Shorts" son redes **separadas** en `SOCIAL_NETWORKS` (íconos distintos — horizontal usa
un triángulo de play, Shorts un rectángulo vertical) porque tienen reglas de color
distintas en Chequeo (ver §2.4quater). Usado en Chequeo (`ChequeoGrid.jsx`) para
identificar cada fila de red social por marca. `Mailchimp` está en `SOCIAL_NETWORKS`
(`src/components/metricas/constants.js`), disponible al agregar redes de un cliente en
`ClientModal.jsx` (Empresa → Clientes).

## Archivos de referencia

- `CLAUDE.md` — instrucciones para Claude Code (este repo)
- `docs/MIGRATION_EVALUACION.md` — bitácora de migración de Evaluaciones + esquema de tablas externas
- `supabase/migrations/` — DDL de las tablas propias del repo
- `src/test/` — suite Vitest (un archivo por componente/util)
- `netlify/functions/` — `create-employee.js`, `evaluation-analysis.js`, `ceo-analysis.js`
- `supabase/functions/` — `notify-campaign-assignee/index.ts`
- `src/utils/buildEffectiveReport.js` — reporte guardado + fuentes → reporte efectivo (puro); usado
  por `OperacionesView` y por `loadYearReportsEffective` — ver "Reporte efectivo" en §2.5
- `src/components/metricas/reportSourcesApi.js` — cargador por lote de las fuentes de derivación
  (`meetings`, `fixed_task_marks`, `publication_checks`, `av_pautas`, `cnp_requests`, `tasks`) para
  varios pares línea×mes a la vez
