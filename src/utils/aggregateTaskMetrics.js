import {
  isClosed,
  isLate,
  isDragged,
  isBlocked,
  parseD,
  daysBetween,
  monthIndex,
  currentMonthIndex,
  taskInMonth,
  taskStartMonth,
  taskEndMonth,
  fmtMonth,
} from '../components/tareas/constants'

/**
 * Determina si una tarea pertenece a un usuario según el rol.
 * Compat: assignee migró de escalar (assignee_id) a array (assignee_ids).
 * Support sigue siendo escalar (support_id).
 */
function taskMatchesUser(t, userId, role) {
  if (role === 'support') return t.support_id === userId
  const ids = t.assignee_ids ?? (t.assignee_id ? [t.assignee_id] : [])
  return ids.includes(userId)
}

/**
 * Agrega métricas de tareas para un empleado, opcionalmente filtradas a un mes.
 *
 * @param {Array}   tasks    - Todas las tareas de la empresa
 * @param {string}  userId   - ID del empleado objetivo
 * @param {object}  [opts]
 * @param {number|null} [opts.monthIdx=null]  monthIndex del mes deseado, null = histórico
 * @param {'assignee'|'support'} [opts.role='assignee']  qué campo de asignación usar
 *
 * @returns {{
 *   total: number, terminadas: number, completionPct: number,
 *   byStatus: Record<string,number>,
 *   retrasadas: number, arrastradas: number, bloqueadas: number,
 *   aTiempo: number, tarde: number, onTimePct: number|null,
 *   avgDelayDays: number|null, avgResolutionDays: number|null,
 * }}
 */
export function aggregateTaskMetrics(tasks, userId, { monthIdx = null, role = 'assignee' } = {}) {
  // 1. Filtrar por empleado
  let scoped = tasks.filter((t) => taskMatchesUser(t, userId, role))

  // 2. Filtrar por mes si corresponde
  if (monthIdx !== null) {
    scoped = scoped.filter((t) => taskInMonth(t, monthIdx))
  }

  const total = scoped.length
  const terminadas = scoped.filter(isClosed).length
  const completionPct = total ? Math.round((terminadas / total) * 100) : 0

  // Distribución por estado
  const byStatus = {}
  for (const t of scoped) {
    byStatus[t.status] = (byStatus[t.status] ?? 0) + 1
  }

  // Estado operativo actual (sobre el conjunto acotado)
  const retrasadas = scoped.filter(isLate).length
  const arrastradas = scoped.filter(isDragged).length
  const bloqueadas = scoped.filter(isBlocked).length

  // A tiempo vs tarde: solo tareas terminadas que tengan due_date y closed_date
  const closedWithDates = scoped.filter((t) => isClosed(t) && t.due_date && t.closed_date)
  let aTiempo = 0
  let tarde = 0
  let totalDelayDays = 0
  for (const t of closedWithDates) {
    const due = parseD(t.due_date)
    const closed = parseD(t.closed_date)
    const delay = daysBetween(due, closed) // positivo = entregó tarde
    if (delay <= 0) {
      aTiempo++
    } else {
      tarde++
      totalDelayDays += delay
    }
  }
  const onTimePct = closedWithDates.length
    ? Math.round((aTiempo / closedWithDates.length) * 100)
    : null
  const avgDelayDays = tarde > 0 ? Math.round(totalDelayDays / tarde) : null

  // Tiempo promedio de resolución (request_date → closed_date), sobre terminadas con ambas fechas
  const closedWithResolution = scoped.filter((t) => isClosed(t) && t.request_date && t.closed_date)
  let totalResolution = 0
  for (const t of closedWithResolution) {
    totalResolution += daysBetween(parseD(t.request_date), parseD(t.closed_date))
  }
  const avgResolutionDays = closedWithResolution.length
    ? Math.round(totalResolution / closedWithResolution.length)
    : null

  return {
    total,
    terminadas,
    completionPct,
    byStatus,
    retrasadas,
    arrastradas,
    bloqueadas,
    aTiempo,
    tarde,
    onTimePct,
    avgDelayDays,
    avgResolutionDays,
  }
}

/**
 * Construye una serie mensual de completación para un gráfico de evolución.
 * Solo para uso en vista histórica (sin filtro de mes).
 *
 * @param {Array}   tasks
 * @param {string}  userId
 * @param {object}  [opts]
 * @param {'assignee'|'support'} [opts.role='assignee']
 *
 * @returns {Array<{ monthIdx: number, label: string, total: number, terminadas: number, completionPct: number }>}
 */
export function buildMonthlySeries(tasks, userId, { role = 'assignee' } = {}) {
  const userTasks = tasks.filter((t) => taskMatchesUser(t, userId, role))

  // Recopilar todos los monthIndex en los que hay actividad del empleado
  const monthSet = new Set()
  const curIdx = currentMonthIndex()
  for (const t of userTasks) {
    const start = taskStartMonth(t)
    if (start === null) continue
    const end = taskEndMonth(t) ?? curIdx
    const cap = Math.min(end, curIdx)
    for (let m = start; m <= cap; m++) {
      monthSet.add(m)
    }
  }

  return Array.from(monthSet)
    .sort((a, b) => a - b)
    .map((mIdx) => {
      const monthTasks = userTasks.filter((t) => taskInMonth(t, mIdx))
      const total = monthTasks.length
      const terminadas = monthTasks.filter(isClosed).length
      const completionPct = total ? Math.round((terminadas / total) * 100) : 0
      return { monthIdx: mIdx, label: fmtMonth(mIdx), total, terminadas, completionPct }
    })
}

/**
 * Determina si un proyecto pertenece a un mes según su fecha de creación (created_at).
 * Histórico (monthIdx === null) o sin created_at → siempre pertenece (no se oculta).
 *
 * @param {{ created_at?: string }} project
 * @param {number|null} monthIdx
 * @returns {boolean}
 */
export function projectInMonth(project, monthIdx) {
  if (monthIdx === null || !project.created_at) return true
  return monthIndex(parseD(project.created_at.slice(0, 10))) === monthIdx
}

/**
 * Agrega la participación de un empleado en proyectos.
 * Los proyectos no tienen fechas por miembro, solo estado general y created_at.
 *
 * @param {Array}   projects  - Proyectos con { id, name, status, members: string[], created_at }
 * @param {string}  userId
 * @param {object}  [opts]
 * @param {number|null} [opts.monthIdx=null]  monthIndex del mes deseado, null = histórico
 *
 * @returns {{ total: number, byStatus: Record<string,number>, completedPct: number }}
 */
export function aggregateProjectParticipation(projects, userId, { monthIdx = null } = {}) {
  const mine = projects.filter(
    (p) => Array.isArray(p.members) && p.members.includes(userId) && projectInMonth(p, monthIdx),
  )
  const total = mine.length
  const byStatus = { Pendiente: 0, 'En proceso': 0, Completado: 0 }
  for (const p of mine) {
    if (byStatus[p.status] !== undefined) byStatus[p.status]++
    // status desconocido → ignorar
  }
  const completedPct = total ? Math.round((byStatus['Completado'] / total) * 100) : 0
  return { total, byStatus, completedPct }
}
