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
/**
 * ISO week number for a given Date object.
 */
export function isoWeek(d) {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()))
  const dayNum = (date.getUTCDay() + 6) % 7
  date.setUTCDate(date.getUTCDate() - dayNum + 3)
  const ft = new Date(Date.UTC(date.getUTCFullYear(), 0, 4))
  const fdn = (ft.getUTCDay() + 6) % 7
  ft.setUTCDate(ft.getUTCDate() - fdn + 3)
  return 1 + Math.round((date - ft) / (7 * 24 * 3600 * 1000))
}

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

/** ISO week number of a task's request_date. */
export function taskWeek(task) {
  const d = parseD(task.request_date)
  return d ? isoWeek(d) : null
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

export function isDragged(task) {
  if (isClosed(task)) return false
  const fs = parseD(task.request_date)
  return fs !== null && daysBetween(fs, today()) > 7
}

export function isBlocked(task) {
  return task.status === 'Bloqueado'
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
 * Compute week metrics for a given team's tasks.
 * @param {string} teamId
 * @param {Array}  allTasks   full tasks array
 * @param {number} weekNum    ISO week number to scope to
 */
export function teamWeekStats(teamId, allTasks, weekNum) {
  const all = allTasks.filter(t => t.team_id === teamId)
  const tasks = all.filter(t => taskWeek(t) === weekNum)
  const total = tasks.length
  const closed = tasks.filter(isClosed).length
  const pct = total ? Math.round((closed / total) * 100) : 0
  const blocked = all.filter(isBlocked).length
  const late = all.filter(isLate).length
  const support = all.filter(t => t.support_id && !isClosed(t)).length
  return { teamId, total, cerradas: closed, pct, bloqueados: blocked, retrasados: late, apoyo: support }
}
