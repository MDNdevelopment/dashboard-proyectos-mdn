// ─── Statuses ───────────────────────────────────────────────────────────────
export const ESTADOS = ['En proceso', 'Por revisar', 'Bloqueado', 'Pendiente', 'Terminado']

export const COL_META = {
  'En proceso':  { color: '#FFB800', textColor: '#111' },
  'Por revisar': { color: '#3B6FE0', textColor: '#fff' },
  'Bloqueado':   { color: '#E14848', textColor: '#fff' },
  'Pendiente':   { color: '#F0871F', textColor: '#fff' },
  'Terminado':   { color: '#16A34A', textColor: '#fff' },
}

// ─── Date helpers ────────────────────────────────────────────────────────────
/** Parse "YYYY-MM-DD" string to local Date (midnight). Returns null for falsy input. */
export function parseD(s) {
  if (!s) return null
  const p = s.split('-')
  return new Date(+p[0], +p[1] - 1, +p[2])
}

/** Today at midnight local time. */
export function today() {
  const t = new Date()
  t.setHours(0, 0, 0, 0)
  return t
}

/** Days between two Date objects (can be negative). */
export function daysBetween(a, b) {
  return Math.round((b - a) / (24 * 3600 * 1000))
}

/** Numeric month index: year*12 + month (0-based). Allows simple range comparisons. */
export function monthIndex(d) {
  return d.getFullYear() * 12 + d.getMonth()
}

/** Month index for the current month. */
export function currentMonthIndex() {
  return monthIndex(new Date())
}

/**
 * Human-readable month label in Spanish, e.g. "Junio 2026".
 * @param {number} idx  monthIndex value
 */
export function fmtMonth(idx) {
  const year = Math.floor(idx / 12)
  const month = idx % 12
  const label = new Date(year, month, 1).toLocaleDateString('es-VE', { month: 'long', year: 'numeric' })
  return label.charAt(0).toUpperCase() + label.slice(1)
}

/** Month index of a task's request_date (start). Returns null if missing. */
export function taskStartMonth(task) {
  const d = parseD(task.request_date)
  return d ? monthIndex(d) : null
}

/**
 * Month index of a task's end. For closed tasks uses closed_date (falls back to
 * start month if closed_date is missing). For open tasks returns null ("ongoing").
 */
export function taskEndMonth(task) {
  if (!isClosed(task)) return null
  const d = parseD(task.closed_date)
  if (d) return monthIndex(d)
  // fallback: treat the start month as both start and end
  return taskStartMonth(task)
}

/**
 * Returns true if the task was active during the given month index.
 *
 * Overlap rule:
 *   - Task has not started yet (start > monthIdx) → false.
 *   - Task is open ("ongoing"): visible from start month up to the current month.
 *   - Task is closed: visible from start month up to (and including) closed month.
 *   - Intermediate months between start and end are always included.
 */
export function taskInMonth(task, monthIdx) {
  const start = taskStartMonth(task)
  if (start === null || start > monthIdx) return false
  const end = taskEndMonth(task)
  if (end === null) {
    // open/ongoing: visible up to current month
    return monthIdx <= currentMonthIndex()
  }
  return monthIdx <= end
}

/** Format a "YYYY-MM-DD" string to a short locale string (e.g. "10 jun"). */
export function fmtShort(s) {
  const d = parseD(s)
  return d ? d.toLocaleDateString('es-VE', { day: '2-digit', month: 'short' }) : '—'
}

// ─── Task state helpers ──────────────────────────────────────────────────────
export function isClosed(task) {
  return task.status === 'Terminado'
}

export function isLate(task) {
  if (isClosed(task)) return false
  const fe = parseD(task.due_date)
  return fe !== null && fe < today()
}

/**
 * A task is "dragged" (arrastrada) when it is open and was started in a previous
 * month — i.e. it has been carrying over without being closed.
 */
export function isDragged(task) {
  if (isClosed(task)) return false
  const start = taskStartMonth(task)
  return start !== null && start < currentMonthIndex()
}

export function isBlocked(task) {
  return task.status === 'Bloqueado'
}

// ─── Semáforo por tarea ──────────────────────────────────────────────────────
/**
 * Returns a per-task traffic-light color: 'red' | 'yellow' | 'green'.
 *   red    = Bloqueado OR fecha de entrega vencida (isLate)
 *   yellow = Por revisar | Pendiente (and not red)
 *   green  = En proceso | Terminado ("no se discute")
 */
export function taskLight(task) {
  if (isBlocked(task) || isLate(task)) return 'red'
  if (task.status === 'Por revisar' || task.status === 'Pendiente') return 'yellow'
  return 'green'
}

// ─── Semáforo ────────────────────────────────────────────────────────────────
/**
 * Returns a traffic-light descriptor based on % completion.
 * @param {number} pct   0-100
 * @param {number} total number of tasks (0 → no movement)
 */
export function lightOf(pct, total) {
  if (!total) return { label: 'Sin mov.', color: '#bbb', cls: 'none' }
  if (pct >= 90) return { label: 'Verde',    color: '#16A34A', cls: 'green' }
  if (pct >= 70) return { label: 'Amarillo', color: '#FFB800', cls: 'yellow' }
  return           { label: 'Rojo',      color: '#E14848', cls: 'red' }
}

// ─── Stats per team ──────────────────────────────────────────────────────────
/**
 * Compute monthly metrics for a given team's tasks.
 * total/cerradas/pct are scoped to monthIdx; bloqueados/retrasados/apoyo are
 * computed over all the team's tasks (live operational state, not month-scoped).
 * @param {string} teamId
 * @param {Array}  allTasks   full tasks array
 * @param {number} monthIdx   monthIndex value to scope to
 */
export function teamMonthStats(teamId, allTasks, monthIdx) {
  const all = allTasks.filter(t => t.team_id === teamId)
  const tasks = all.filter(t => taskInMonth(t, monthIdx))
  const total = tasks.length
  const closed = tasks.filter(isClosed).length
  const pct = total ? Math.round((closed / total) * 100) : 0
  const blocked = all.filter(isBlocked).length
  const late = all.filter(isLate).length
  const support = all.filter(t => t.support_id && !isClosed(t)).length
  return { teamId, total, cerradas: closed, pct, bloqueados: blocked, retrasados: late, apoyo: support }
}
