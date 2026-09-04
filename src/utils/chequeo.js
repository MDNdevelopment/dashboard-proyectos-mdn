/**
 * Lógica pura del módulo «Chequeo» (Gestión de Tareas → Chequeo): estado de una celda
 * cliente × red social × tipo de contenido, periodizado por mes y semana fija (mismo
 * concepto de semana que Tareas Fijas, ver utils/fixedTasks.js → buildFixedWeeks). Todas
 * las funciones son puras y testeables: no tocan Supabase ni el DOM.
 *
 * Cada celda guarda una fecha libre (puede ser de otra semana o de otro mes — es un
 * registro histórico de "cuándo se publicó", no una validación de "esta semana"). El
 * semáforo (`recentCheckStatus`) es días transcurridos desde esa fecha hasta la fecha de
 * referencia del período activo, el mismo criterio en la grilla semanal y en la vista
 * "Más reciente". La fecha de referencia es "hoy" mientras el período (semana o mes)
 * sigue en curso, pero queda fija en su fecha de cierre una vez que pasó — así el color
 * de un período histórico no se recalcula cada vez que alguien lo revisa después (ver
 * `periodEndDate`/`checkReferenceDate`).
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
 * posts — ninguna de las dos tiene sentido evaluada semana a semana. En Productividad su
 * meta es 1/mes en vez de 4/mes (ver `computePlataformasProductividad`). YouTube Shorts
 * NO entra en esta excepción: se evalúa como el resto.
 */
export const WEEKLY_EXEMPT_NETWORKS = ['YouTube', 'Mailchimp']

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

/** Umbral de "un mes sin publicar" para Mailchimp y YouTube (horizontal) — ver `recentCheckStatus`. */
const MONTHLY_STALE_DAYS = 30

/**
 * Semáforo único del módulo (grilla semanal y vista "Más reciente" — ver ChequeoGrid.jsx):
 * días transcurridos desde la fecha registrada hasta `today` — 0-6 días 'normal', 7-12
 * 'naranja', 13+ 'rojo'. Sin fecha → 'vacio'. Como la fecha de cada celda es libre (puede
 * ser de otra semana o de otro mes), "cumplimiento de esta semana concreta" dejó de tener
 * sentido como criterio de color — lo único verificable es cuán reciente es el registro.
 *
 * IMPORTANTE: `today` no es necesariamente "ahora" — para un período (semana/mes) que ya
 * cerró, el caller debe pasar `checkReferenceDate(...)` en vez del default, para que el
 * color quede fijo en cómo se veía al cerrar ese período y no se recalcule cada vez que
 * alguien revisa el histórico más adelante (ver `checkReferenceDate` más abajo).
 *
 * Reglas por red que se apartan del default, igual que la alerta original:
 * - Mailchimp y YouTube (horizontal): cadencia mensual, no semanal — se quedan en
 *   'normal' hasta el mes sin publicar (~30 días) y ahí pasan directo a 'rojo', sin pasar
 *   por 'naranja'. YouTube Shorts usa el default.
 * @param {string|null} dateISO  last_published_at más reciente de la celda (o null)
 * @param {string} network
 * @param {Date} [today]
 * @returns {'vacio'|'normal'|'naranja'|'rojo'}
 */
export function recentCheckStatus(dateISO, network, today = new Date()) {
  if (!dateISO) return 'vacio'
  const days = daysSince(dateISO, today)
  if (days == null) return 'vacio'
  if (network === 'Mailchimp' || network === 'YouTube') {
    return days >= MONTHLY_STALE_DAYS ? 'rojo' : 'normal'
  }
  if (days >= 13) return 'rojo'
  if (days >= 7) return 'naranja'
  return 'normal'
}

/**
 * Último día del período activo del semáforo: el domingo de la semana fija activa
 * (`weekN`), o el último día del mes cuando `weekN` es `null` (vista "Más reciente",
 * mismo período que usa `mostRecentCheck`).
 * @param {Array} weeks  buildFixedWeeks(year, month)
 * @param {number|null} weekN
 * @param {number} year
 * @param {number} month  1-indexado
 * @returns {Date}
 */
export function periodEndDate(weeks, weekN, year, month) {
  if (weekN != null) {
    const week = weeks.find((w) => w.n === weekN)
    if (week) return week.dom
  }
  return new Date(year, month, 0) // día 0 del mes siguiente = último día de `month`
}

/**
 * Fecha de referencia para el semáforo de un período: si el período todavía no cerró
 * (su último día es hoy o está por venir), es `today` — el color sigue en vivo mientras
 * la semana/mes está en curso. Si el período ya cerró, es la fecha de cierre del período
 * — así el semáforo de un período pasado queda fijo para siempre en cómo se veía el día
 * que cerró, en vez de recalcularse contra la fecha real cada vez que se revisa después
 * (ej.: todo marcado a tiempo en agosto se ve verde en agosto y sigue verde en diciembre).
 * @param {Date} periodEnd  resultado de `periodEndDate`
 * @param {Date} [today]
 * @returns {Date}
 */
export function checkReferenceDate(periodEnd, today = new Date()) {
  const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate())
  return startOfDay(periodEnd) < startOfDay(today) ? periodEnd : today
}

/** Formatea una fecha 'YYYY-MM-DD' como "18 jul" (es-VE). */
export function formatCheckDate(dateISO) {
  if (!dateISO) return null
  const date = new Date(`${dateISO}T00:00:00`)
  if (Number.isNaN(date.getTime())) return null
  return date.toLocaleDateString('es-VE', { day: 'numeric', month: 'short' }).replace('.', '')
}

// ─── Cuentas sin línea → línea general "Independientes" (metric_lines.is_general) ──────

/**
 * Id de línea "efectivo" de una cuenta para el módulo Chequeo: las cuentas sin línea
 * asignada (`line_id = null`, p. ej. tras borrar su línea — la FK es `ON DELETE SET
 * NULL`) cuentan como pertenecientes a la línea general "Independientes", igual que ya
 * pasa en Tareas (ver `crossLineUserIds`/`withDerivedGeneralMembers` en
 * utils/lineMembers.js, mismo concepto aplicado a empleados en vez de a cuentas).
 * Se calcula en lectura y también al guardar un chequeo, para que la fila de
 * `publication_checks` no quede con `line_id = null` (rompería las policies de
 * escritura, que exigen pertenencia a una línea concreta).
 * @param {object|null} client        cuenta (metric_clients), con line_id
 * @param {string|null} generalLineId id de la línea is_general de la empresa (o null si no existe)
 * @returns {string|null}
 */
export function effectiveLineId(client, generalLineId) {
  return client?.line_id ?? generalLineId ?? null
}

/**
 * Cuentas que pertenecen a una línea, incluyendo en la línea general las que no tienen
 * línea asignada. Usado por ChequeoPage (alcance de la selección) y ChequeoGrid
 * (agrupado por línea en la vista "Todas").
 * @param {Array} clients        cuentas (metric_clients)
 * @param {object|null} line     línea objetivo (metric_lines), o null
 * @param {string|null} generalLineId id de la línea is_general de la empresa (o null si no existe)
 * @returns {Array}
 */
export function clientsForLine(clients, line, generalLineId) {
  if (!line) return []
  return clients.filter((c) => effectiveLineId(c, generalLineId) === line.id)
}

// ─── Agregación → indicador «2. Productividad» del reporte (fila "Actualización de
// Plataformas", derivada de Chequeo) ────────────────────────────────────────────────

/**
 * Meta mensual de una celda aplicable de red "normal" (no exenta): 4 registros al mes,
 * fija, sin importar si el mes tiene 4 o 5 semanas (5 miércoles) — con meta variable un
 * mes de 5 semanas exigía un 25% más de trabajo real sin que la carga del equipo hubiera
 * cambiado. `Math.min` en `computePlataformasProductividad` topa el real en este número
 * aunque se registren las 5 semanas.
 */
export const MONTHLY_TARGET_PER_NETWORK = 4

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
 * - Redes normales: `MONTHLY_TARGET_PER_NETWORK` (4) por mes — cadencia semanal, pero fija
 *   para no penalizar los meses de 5 semanas.
 * - Redes de `WEEKLY_EXEMPT_NETWORKS`: 1 por mes — cadencia mensual, no semanal.
 * Real = nº de semanas (casillas) con fecha registrada, topado en la meta (redes exentas:
 * 1 si hubo al menos una). La fecha de cada casilla es libre — puede no caer dentro de esa
 * semana calendario — así que lo que se cuenta es "cuántas casillas del mes tienen algo
 * anotado", no si la fecha en sí cayó en esa semana.
 * Respeta el opt-out por cliente (`client.fixed_tasks.plataformas === false`), mismo
 * criterio que usaba la columna vieja.
 *
 * @param {Array} checks   publication_checks del mes (line_id ya filtrado)
 * @param {Array} clients  cuentas de la línea (con social_links, fixed_tasks)
 * @returns {{nombre:string, realizado:number, meta:number}}
 */
export function computePlataformasProductividad(checks, clients) {
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
        meta += MONTHLY_TARGET_PER_NETWORK
        const weeksWithDate = new Set(
          cellChecks.filter((c) => c.last_published_at).map((c) => c.period_week),
        )
        realizado += Math.min(MONTHLY_TARGET_PER_NETWORK, weeksWithDate.size)
      })
    })
  })
  return { nombre: 'Actualización de Plataformas', realizado, meta }
}

// ─── Agregación → resumen de estado por cuenta (fila de KPIs y encabezado por línea de
// ChequeoPage/ChequeoGrid) ──────────────────────────────────────────────────────────────

/**
 * Resumen de cuántas cuentas están al día en el período activo (semana `weekN`, o mes
 * completo — "fecha más reciente" — cuando `weekN` es `null`). Mismo recorrido cliente →
 * social_links → CONTENT_TYPES → contentTypeApplies que `computePlataformasProductividad`,
 * pero a diferencia de esa función:
 * - Mide "cuenta al día" en vez de "productividad del mes": una cuenta es 'actualizada'
 *   solo si TODAS sus casillas aplicables tienen fecha en el período activo, 'parcial' si
 *   algunas, 'sinRegistrar' si ninguna — así una cuenta de Instagram con Reels e Highlights
 *   vacíos no puede leerse como "al día" solo porque tiene Publicaciones.
 * - NO respeta el opt-out `client.fixed_tasks.plataformas === false`: el resumen debe
 *   cuadrar con lo que la grilla dibuja (ChequeoGrid no oculta esas cuentas), no con lo que
 *   cuenta para el indicador de Productividad del reporte mensual.
 * - Usa el mismo semáforo (`recentCheckStatus`) para derivar `enAlerta`/`porVencer`, no un
 *   conteo de semanas.
 *
 * @param {Array} clients  cuentas en alcance (ya acotadas a la línea o a "todas" por el caller)
 * @param {Array} checks   publication_checks del mes activo
 * @param {{weekN?: number|null, today?: Date}} [opts]
 *   weekN: semana fija activa (ver buildFixedWeeks); `null`/omitido = vista "más reciente"
 *   (usa `mostRecentCheck`, ignora `period_week`, igual que ChequeoGrid en viewMode='recent').
 * @returns {{
 *   totalCuentas:number, sinRedes:number,
 *   actualizadas:number, parciales:number, sinRegistrar:number,
 *   enAlerta:number, porVencer:number,
 *   celdasTotal:number, celdasConFecha:number,
 * }}
 */
export function computeChequeoSummary(clients, checks, { weekN = null, today = new Date() } = {}) {
  let sinRedes = 0
  let actualizadas = 0
  let parciales = 0
  let sinRegistrar = 0
  let enAlerta = 0
  let porVencer = 0
  let celdasTotal = 0
  let celdasConFecha = 0

  clients.forEach((client) => {
    const networks = Array.isArray(client?.social_links)
      ? client.social_links.map((s) => s?.red).filter((red) => typeof red === 'string' && red)
      : []
    if (networks.length === 0) {
      sinRedes += 1
      return
    }

    let cuentaCeldas = 0
    let cuentaConFecha = 0
    let cuentaTieneRojo = false
    let cuentaTieneNaranja = false

    networks.forEach((network) => {
      CONTENT_TYPES.forEach((contentType) => {
        if (!contentTypeApplies(network, contentType)) return
        cuentaCeldas += 1
        const check =
          weekN == null
            ? mostRecentCheck(checks, client.id, network, contentType)
            : checks.find(
                (c) =>
                  c.client_id === client.id &&
                  c.network === network &&
                  c.content_type === contentType &&
                  c.period_week === weekN,
              )
        if (check?.last_published_at) cuentaConFecha += 1
        const status = recentCheckStatus(check?.last_published_at, network, today)
        if (status === 'rojo') cuentaTieneRojo = true
        else if (status === 'naranja') cuentaTieneNaranja = true
      })
    })

    if (cuentaCeldas === 0) {
      sinRedes += 1
      return
    }
    celdasTotal += cuentaCeldas
    celdasConFecha += cuentaConFecha

    if (cuentaConFecha === 0) sinRegistrar += 1
    else if (cuentaConFecha === cuentaCeldas) actualizadas += 1
    else parciales += 1

    if (cuentaTieneRojo) enAlerta += 1
    else if (cuentaTieneNaranja) porVencer += 1
  })

  return {
    totalCuentas: actualizadas + parciales + sinRegistrar,
    sinRedes,
    actualizadas,
    parciales,
    sinRegistrar,
    enAlerta,
    porVencer,
    celdasTotal,
    celdasConFecha,
  }
}
