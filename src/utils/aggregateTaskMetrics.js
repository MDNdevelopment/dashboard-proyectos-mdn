import {
  isClosed, isLate, isDragged, isBlocked,
  parseD, daysBetween, monthIndex, currentMonthIndex,
  taskInMonth, taskStartMonth, taskEndMonth, fmtMonth,
} from '../components/tareas/constants'

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
  const field = role === 'support' ? 'support_id' : 'assignee_id'

  // 1. Filtrar por empleado
  let scoped = tasks.filter(t => t[field] === userId)

  // 2. Filtrar por mes si corresponde
  if (monthIdx !== null) {
    scoped = scoped.filter(t => taskInMonth(t, monthIdx))
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
  const closedWithDates = scoped.filter(
    t => isClosed(t) && t.due_date && t.closed_date,
  )
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
  const closedWithResolution = scoped.filter(
    t => isClosed(t) && t.request_date && t.closed_date,
  )
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
  const field = role === 'support' ? 'support_id' : 'assignee_id'
  const userTasks = tasks.filter(t => t[field] === userId)

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
    .map(mIdx => {
      const monthTasks = userTasks.filter(t => taskInMonth(t, mIdx))
      const total = monthTasks.length
      const terminadas = monthTasks.filter(isClosed).length
      const completionPct = total ? Math.round((terminadas / total) * 100) : 0
      return { monthIdx: mIdx, label: fmtMonth(mIdx), total, terminadas, completionPct }
    })
}

/**
 * Agrega la participación de un empleado en proyectos.
 * Los proyectos no tienen fechas por miembro, solo estado general.
 *
 * @param {Array}   projects  - Proyectos con { id, name, status, members: string[] }
 * @param {string}  userId
 *
 * @returns {{ total: number, byStatus: Record<string,number>, completedPct: number }}
 */
export function aggregateProjectParticipation(projects, userId) {
  const mine = projects.filter(
    p => Array.isArray(p.members) && p.members.includes(userId),
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
