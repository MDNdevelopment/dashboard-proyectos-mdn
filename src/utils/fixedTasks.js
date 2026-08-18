/**
 * Lógica pura del módulo «Tareas Fijas» (Gestión de Tareas → Tareas Fijas,
 * sub-sección Redes-Diseño). Todas las funciones son puras y testeables:
 * no tocan Supabase ni el DOM.
 *
 * Semanas del mes = ancladas al miércoles (mockup tareas-fijas-mockup.html).
 * Cada semana define hasta 5 tareas recurrentes (`TASK_KEYS`), con fecha tope propia.
 */

/** Las 5 tareas fijas recurrentes, en el orden en que aparecen en la grilla y el reporte. */
export const TASK_KEYS = ['metricas', 'grilla', 'artes', 'plataformas', 'calendario']

export const TASK_LABELS = {
  metricas: 'Métricas',
  grilla: 'Grillas Redes → Diseño',
  artes: 'Grillas Diseño → Redes',
  plataformas: 'Actualización de Plataformas',
  calendario: 'Calendario',
}

/** Abreviatura por red social para los botones compactos de 'plataformas'. */
export const NETWORK_SHORT = {
  Instagram: 'IG',
  Facebook: 'FB',
  TikTok: 'TT',
  X: 'X',
  YouTube: 'YT',
  LinkedIn: 'LI',
  Otro: 'Otro',
}

/**
 * Nombres de red social de un cliente (metric_clients.social_links: [{red, link}]),
 * tolerante a datos faltantes o mal formados.
 * @param {object} client
 * @returns {Array<string>}
 */
export function clientNetworks(client) {
  if (!Array.isArray(client?.social_links)) return []
  return client.social_links
    .map((s) => s?.red)
    .filter((red) => typeof red === 'string' && red.length > 0)
}

// ─── Semanas del mes ────────────────────────────────────────────────────────

/** Nº de días del mes (year, month 1-indexed). */
function lastDayOfMonth(year, month) {
  return new Date(year, month, 0).getDate()
}

/**
 * Construye las semanas del mes ancladas al miércoles. Cada semana trae sus
 * fechas de referencia (miércoles, viernes, lunes siguiente, rango lun-dom) y
 * un flag isFirst/isLast para saber qué tareas extra aplican (ver `tasksForWeek`).
 * @param {number} year
 * @param {number} month  1-indexado (enero = 1)
 * @returns {Array<{n:number, wed:Date, fri:Date, mon:Date, monIni:Date, dom:Date, isFirst:boolean, isLast:boolean}>}
 */
export function buildFixedWeeks(year, month) {
  const last = lastDayOfMonth(year, month)
  const weds = []
  for (let day = 1; day <= last; day++) {
    const dt = new Date(year, month - 1, day)
    if (dt.getDay() === 3) weds.push(dt)
  }
  return weds.map((wed, i) => {
    const fri = new Date(wed)
    fri.setDate(wed.getDate() + 2) // viernes de la semana → plataformas
    const mon = new Date(wed)
    mon.setDate(wed.getDate() + 5) // lunes siguiente → artes
    const monIni = new Date(wed)
    monIni.setDate(wed.getDate() - 2) // lunes de la semana (para el rango)
    const dom = new Date(wed)
    dom.setDate(wed.getDate() + 4) // domingo de la semana
    return { n: i + 1, wed, fri, mon, monIni, dom, isFirst: i === 0, isLast: i === weds.length - 1 }
  })
}

/**
 * Qué tareas (`task_key`) aplican en una semana dada.
 * Base todas las semanas: grilla, artes, plataformas.
 * Semana 1: + métricas. Última semana del mes: + calendario.
 * @param {number} weekN
 * @param {Array} weeks  resultado de buildFixedWeeks
 */
export function tasksForWeek(weekN, weeks) {
  const base = ['grilla', 'artes', 'plataformas']
  if (weekN === 1) return ['metricas', ...base]
  const week = weeks.find((w) => w.n === weekN)
  if (week?.isLast) return [...base, 'calendario']
  return base
}

/** N-ésimo día hábil (lun-vie) del mes. */
function nthBusinessDay(year, month, n) {
  let count = 0
  const last = lastDayOfMonth(year, month)
  for (let day = 1; day <= last; day++) {
    const dow = new Date(year, month - 1, day).getDay()
    if (dow !== 0 && dow !== 6) {
      count++
      if (count === n) return new Date(year, month - 1, day)
    }
  }
  return new Date(year, month - 1, last)
}

/** Último día hábil (lun-vie) del mes. */
function lastBusinessDay(year, month) {
  const last = lastDayOfMonth(year, month)
  for (let day = last; day >= 1; day--) {
    const dow = new Date(year, month - 1, day).getDay()
    if (dow !== 0 && dow !== 6) return new Date(year, month - 1, day)
  }
  return new Date(year, month - 1, last)
}

/**
 * Fecha tope (hasta las 5pm) de una tarea en una semana concreta.
 * @param {string} taskKey
 * @param {object} week   una entrada de buildFixedWeeks
 * @param {number} year
 * @param {number} month  1-indexado
 * @returns {{date: Date, rule: string}}
 */
export function taskDeadline(taskKey, week, year, month) {
  if (taskKey === 'metricas')
    return { date: nthBusinessDay(year, month, 5), rule: '5.º día hábil del mes' }
  if (taskKey === 'grilla') return { date: week.wed, rule: 'cada miércoles' }
  if (taskKey === 'artes') return { date: week.mon, rule: 'cada lunes' }
  if (taskKey === 'plataformas') return { date: week.fri, rule: 'cada viernes' }
  if (taskKey === 'calendario')
    return { date: lastBusinessDay(year, month), rule: 'último día hábil del mes' }
  return { date: null, rule: '' }
}

// ─── Agregación → indicador «2. Productividad» del reporte ────────────────────

/**
 * Determina si una tarea aplica a una cuenta según su configuración
 * (`metric_clients.fixed_tasks`). Sin configuración (null/undefined) → todas aplican.
 * @param {object|null} fixedTasksConfig  client.fixed_tasks
 * @param {string} taskKey
 */
export function taskAppliesToClient(fixedTasksConfig, taskKey) {
  if (fixedTasksConfig == null) return true
  return fixedTasksConfig[taskKey] !== false
}

/**
 * Calcula las filas del indicador «2. Productividad – Tareas Fijas» del reporte
 * mensual de la línea, a partir de las marcas tildadas en la grilla.
 *
 * Meta de cada tarea = nº de celdas aplicables en el mes (excluye 'na' y cuentas
 * donde la tarea no aplica). Real = nº de celdas marcadas 'si'. Para 'plataformas'
 * la celda se desagrega por red social (metric_clients.social_links): cada red suma
 * a la meta cada semana, en vez de una sola marca por cuenta — ver `clientNetworks`.
 * Además, 'plataformas' fija su base a **4 semanas siempre** (no las 4-5 reales del
 * mes según cuántos miércoles tenga): un mes con 5 semanas no cuenta la 5.ª contra
 * este indicador. 'na' sigue descontando de la meta igual que las demás tareas.
 * Devuelve el shape EXACTO de `report.productividad.tareas`, para que
 * `calcProductividad` (metricsScore.js) siga funcionando sin cambios.
 *
 * @param {Array} marks     filas de fixed_task_marks del mes (line_id ya filtrado)
 * @param {Array} clients   cuentas de la línea (con fixed_tasks, social_links)
 * @param {Array} weeks     buildFixedWeeks(year, month)
 * @returns {Array<{nombre:string, realizado:number, meta:number}>}
 */
export function computeProductividad(marks, clients, weeks) {
  return TASK_KEYS.map((taskKey) => {
    let meta = 0
    let realizado = 0
    clients.forEach((client) => {
      if (!taskAppliesToClient(client.fixed_tasks, taskKey)) return
      weeks.forEach((week) => {
        if (!tasksForWeek(week.n, weeks).includes(taskKey)) return

        if (taskKey === 'plataformas') {
          // Base fija de 4 semanas: la 5.ª semana de un mes largo no cuenta para
          // este indicador (evita que el mes varíe entre ×4 y ×5 según el calendario).
          if (week.n > 4) return
          // Una unidad de meta por cada red social del cliente, en cada una de esas 4 semanas.
          clientNetworks(client).forEach((network) => {
            const mark = marks.find(
              (m) =>
                m.client_id === client.id &&
                m.task_key === 'plataformas' &&
                m.period_week === week.n &&
                m.network === network,
            )
            if (mark?.status === 'na') return
            meta++
            if (mark?.status === 'si') realizado++
          })
          return
        }

        const mark = marks.find(
          (m) => m.client_id === client.id && m.task_key === taskKey && m.period_week === week.n,
        )
        if (mark?.status === 'na') return
        meta++
        if (mark?.status === 'si') realizado++
      })
    })
    return { nombre: TASK_LABELS[taskKey], realizado, meta }
  })
}

// ─── Agregación → sección «Tareas Fijas» del perfil del empleado ──────────────

/**
 * Cumplimiento de tareas fijas de un empleado, según las cuentas donde es
 * social/diseñador (clientIds ya resuelto por el caller). 'na' se excluye del
 * cálculo (no cuenta como incumplimiento).
 * @param {Array} marks      fixed_task_marks del período, ya acotadas a clientIds
 * @param {Array<string>} clientIds  cuentas donde el empleado participa
 * @returns {{total:number, entregadas:number, cumplimientoPct:number|null, byTaskKey: Record<string,{total:number, entregadas:number}>}}
 */
export function aggregateEmployeeFixedTasks(marks, clientIds) {
  const idSet = new Set(clientIds)
  const relevant = marks.filter((m) => idSet.has(m.client_id) && m.status !== 'na')

  const byTaskKey = {}
  TASK_KEYS.forEach((k) => {
    byTaskKey[k] = { total: 0, entregadas: 0 }
  })

  relevant.forEach((m) => {
    if (!byTaskKey[m.task_key]) byTaskKey[m.task_key] = { total: 0, entregadas: 0 }
    byTaskKey[m.task_key].total++
    if (m.status === 'si') byTaskKey[m.task_key].entregadas++
  })

  const total = relevant.length
  const entregadas = relevant.filter((m) => m.status === 'si').length
  const cumplimientoPct = total > 0 ? Math.round((entregadas / total) * 100) : null

  return { total, entregadas, cumplimientoPct, byTaskKey }
}
