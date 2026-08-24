/**
 * Lógica pura del módulo «Chequeo» (Gestión de Tareas → Chequeo): estado de una celda
 * cliente × red social × tipo de contenido, periodizado por mes y semana fija (mismo
 * concepto de semana que Tareas Fijas, ver utils/fixedTasks.js → buildFixedWeeks). Todas
 * las funciones son puras y testeables: no tocan Supabase ni el DOM.
 *
 * Cada celda guarda una fecha por semana ("¿publicó algo en esta semana?"), sobrescribible
 * mientras la semana esté en curso. El semáforo es el cumplimiento de esa semana concreta
 * (ver `weekCheckStatus`), no un conteo de días desde hoy — así una semana pasada queda
 * "congelada" con su resultado y no cambia con el paso del tiempo al navegar el histórico.
 */

/** Los 3 tipos de contenido que se registran por cada red social del cliente. */
export const CONTENT_TYPES = ['publicaciones', 'reels', 'highlights']

export const CONTENT_LABELS = {
  publicaciones: 'Publicaciones',
  reels: 'Reels',
  highlights: 'Highlights',
}

/**
 * Solo Instagram registra Reels e Highlights (el resto de las redes solo publica
 * "Publicaciones" en el flujo real de las community managers) — las demás columnas
 * quedan como "no aplica" (celda estática, sin selector de fecha).
 */
export function contentTypeApplies(network, contentType) {
  return contentType === 'publicaciones' || network === 'Instagram'
}

/**
 * Redes con cadencia mensual (no semanal): YouTube (horizontal) publica con una
 * frecuencia mucho más baja que el resto, y Mailchimp registra envíos de correo, no
 * posts — ninguna de las dos tiene sentido evaluada semana a semana. Nunca se marcan en
 * rojo por semana vacía (ver `weekCheckStatus`); en Productividad su meta es 1/mes en vez
 * de 1/semana (ver `computePlataformasProductividad`). YouTube Shorts NO entra en esta
 * excepción: se evalúa como el resto.
 */
export const WEEKLY_EXEMPT_NETWORKS = ['YouTube', 'Mailchimp']

/**
 * Estado de cumplimiento de una celda EN UNA SEMANA concreta:
 * - 'cumplido'   → hay fecha registrada esa semana.
 * - 'pendiente'  → sin fecha, pero la semana todavía no cerró (hoy <= domingo de la
 *                  semana), o la red es de cadencia mensual (`WEEKLY_EXEMPT_NETWORKS`).
 * - 'incumplido' → sin fecha, la semana ya cerró y la red no está exenta.
 * @param {string|null} dateISO  last_published_at de la celda en esa semana (o null)
 * @param {{dom: Date}} week     entrada de buildFixedWeeks (usa week.dom, domingo de cierre)
 * @param {string} network
 * @param {Date} [today]
 * @returns {'cumplido'|'pendiente'|'incumplido'}
 */
export function weekCheckStatus(dateISO, week, network, today = new Date()) {
  if (dateISO) return 'cumplido'
  if (WEEKLY_EXEMPT_NETWORKS.includes(network)) return 'pendiente'
  const endOfDom = new Date(
    week.dom.getFullYear(),
    week.dom.getMonth(),
    week.dom.getDate(),
    23,
    59,
    59,
    999,
  )
  return today > endOfDom ? 'incumplido' : 'pendiente'
}

/**
 * Nº de la semana (de `weeks`, ver buildFixedWeeks) que contiene `today`, comparando por
 * día de calendario contra el rango [monIni, dom] de cada semana. `null` si `today` cae
 * fuera de todas las semanas del mes (p. ej. se está viendo un mes distinto al actual).
 * @param {Array} weeks  buildFixedWeeks(year, month)
 * @param {Date} [today]
 */
export function currentFixedWeekN(weeks, today = new Date()) {
  const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate())
  const t = startOfDay(today).getTime()
  const week = weeks.find((w) => {
    const start = startOfDay(w.monIni).getTime()
    const end = startOfDay(w.dom).getTime()
    return t >= start && t <= end
  })
  return week?.n ?? null
}

/**
 * La celda (cliente × red × tipo de contenido) con la fecha más reciente entre las
 * semanas del mes dado (`checks`, ya acotados a un mes por el caller — ver ChequeoPage).
 * Vista informativa aparte de la grilla semanal: no hay "cumplimiento de semana" que
 * evaluar, solo "¿cuál es el último registro visible este mes?", así que ignora
 * `period_week` y compara `last_published_at` directo. `null` si ninguna semana tiene
 * fecha registrada.
 * @param {Array} checks  publication_checks del mes activo
 * @returns {object|null}
 */
export function mostRecentCheck(checks, clientId, network, contentType) {
  return checks
    .filter(
      (c) =>
        c.client_id === clientId &&
        c.network === network &&
        c.content_type === contentType &&
        c.last_published_at,
    )
    .reduce((best, c) => (!best || c.last_published_at > best.last_published_at ? c : best), null)
}

/** Días desde `dateISO` (string 'YYYY-MM-DD' o Date) hasta `today` (Date), en días de calendario. */
export function daysSince(dateISO, today = new Date()) {
  if (!dateISO) return null
  const date = typeof dateISO === 'string' ? new Date(`${dateISO}T00:00:00`) : dateISO
  if (Number.isNaN(date.getTime())) return null
  const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate())
  const msPerDay = 24 * 60 * 60 * 1000
  return Math.round((startOfDay(today) - startOfDay(date)) / msPerDay)
}

/** Umbral de "un mes sin publicar" para YouTube (horizontal) — ver `recentCheckStatus`. */
const YOUTUBE_STALE_DAYS = 30

/**
 * Estado de alerta de la vista "Más reciente" (`ChequeoGrid viewMode='recent'`): a
 * diferencia de `weekCheckStatus` (cumplimiento de una semana concreta, sin relación con
 * hoy), esta es la alerta ORIGINAL del módulo — días transcurridos desde la fecha más
 * reciente hasta hoy: 0-5 días 'normal', 6-11 'naranja', 12+ 'rojo'. Sin fecha → 'vacio'.
 * Solo tiene sentido en esta vista puntual (resumen "cuán al día está la cuenta ahora
 * mismo"); la grilla semanal no la usa porque romper el histórico por semana congelada
 * era justamente el problema que resolvió `weekCheckStatus` (ver cabecera del archivo).
 *
 * Reglas por red que se apartan del default, igual que la alerta original:
 * - Mailchimp: la fecha es decorativa (no hay forma de saber "cuándo caduca" un envío de
 *   correo como sí con un post) — con fecha registrada siempre es 'normal'.
 * - YouTube (horizontal): cadencia mucho más baja, solo se marca 'rojo' al mes sin
 *   publicar (~30 días) y nunca pasa por 'naranja'. YouTube Shorts usa el default.
 * @param {string|null} dateISO  last_published_at más reciente de la celda (o null)
 * @param {string} network
 * @param {Date} [today]
 * @returns {'vacio'|'normal'|'naranja'|'rojo'}
 */
export function recentCheckStatus(dateISO, network, today = new Date()) {
  if (!dateISO) return 'vacio'
  if (network === 'Mailchimp') return 'normal'
  const days = daysSince(dateISO, today)
  if (days == null) return 'vacio'
  if (network === 'YouTube') return days >= YOUTUBE_STALE_DAYS ? 'rojo' : 'normal'
  if (days >= 12) return 'rojo'
  if (days >= 6) return 'naranja'
  return 'normal'
}

/** Formatea una fecha 'YYYY-MM-DD' como "18 jul" (es-VE). */
export function formatCheckDate(dateISO) {
  if (!dateISO) return null
  const date = new Date(`${dateISO}T00:00:00`)
  if (Number.isNaN(date.getTime())) return null
  return date.toLocaleDateString('es-VE', { day: 'numeric', month: 'short' }).replace('.', '')
}

// ─── Agregación → indicador «2. Productividad» del reporte (fila "Actualización de
// Plataformas", derivada de Chequeo) ────────────────────────────────────────────────

/**
 * Calcula la fila «Actualización de Plataformas» del indicador «2. Productividad –
 * Tareas Fijas» del reporte mensual, a partir de las celdas de Chequeo del mes
 * (`publication_checks`, ya acotadas al período y a la línea por el caller). Reemplaza a
 * la columna que antes vivía en Tareas Fijas (utils/fixedTasks.js → computeProductividad)
 * y, desde la periodización por semana, a la agregación que antes salía de
 * `publication_check_events` (tabla en desuso: una celda por semana ya es el conteo, sin
 * eventos huérfanos que una corrección deje inflando el número).
 *
 * Meta de cada celda aplicable (cuenta × red × tipo, según `contentTypeApplies`):
 * - Redes normales: 1 por semana del mes (`weeks.length`) — cadencia semanal.
 * - Redes de `WEEKLY_EXEMPT_NETWORKS`: 1 por mes — cadencia mensual, no semanal.
 * Real = nº de semanas con fecha registrada (redes exentas: 1 si hubo al menos una).
 * Respeta el opt-out por cliente (`client.fixed_tasks.plataformas === false`), mismo
 * criterio que usaba la columna vieja.
 *
 * @param {Array} checks   publication_checks del mes (line_id ya filtrado)
 * @param {Array} clients  cuentas de la línea (con social_links, fixed_tasks)
 * @param {Array} weeks    buildFixedWeeks(year, month)
 * @returns {{nombre:string, realizado:number, meta:number}}
 */
export function computePlataformasProductividad(checks, clients, weeks) {
  let meta = 0
  let realizado = 0
  clients.forEach((client) => {
    if (client?.fixed_tasks?.plataformas === false) return
    const networks = Array.isArray(client?.social_links)
      ? client.social_links.map((s) => s?.red).filter((red) => typeof red === 'string' && red)
      : []
    networks.forEach((network) => {
      CONTENT_TYPES.forEach((contentType) => {
        if (!contentTypeApplies(network, contentType)) return
        const cellChecks = checks.filter(
          (c) =>
            c.client_id === client.id && c.network === network && c.content_type === contentType,
        )
        if (WEEKLY_EXEMPT_NETWORKS.includes(network)) {
          meta += 1
          realizado += cellChecks.some((c) => c.last_published_at) ? 1 : 0
          return
        }
        meta += weeks.length
        const weeksWithDate = new Set(
          cellChecks.filter((c) => c.last_published_at).map((c) => c.period_week),
        )
        realizado += Math.min(weeks.length, weeksWithDate.size)
      })
    })
  })
  return { nombre: 'Actualización de Plataformas', realizado, meta }
}
