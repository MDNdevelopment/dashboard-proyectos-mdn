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

/** ISO week number of a tarea's fecha_solicitud. */
export function taskWeek(t) {
  const d = parseD(t.fecha_solicitud)
  return d ? isoWeek(d) : null
}

/** Format a "YYYY-MM-DD" string to a short locale string (e.g. "10 jun"). */
export function fmtShort(s) {
  const d = parseD(s)
  return d ? d.toLocaleDateString('es-VE', { day: '2-digit', month: 'short' }) : '—'
}

// ─── Task state helpers ──────────────────────────────────────────────────────
export function isClosed(t) {
  return t.estatus === 'Terminado'
}

export function isLate(t) {
  if (isClosed(t)) return false
  const fe = parseD(t.fecha_entrega)
  return fe !== null && fe < today()
}

export function isDragged(t) {
  if (isClosed(t)) return false
  const fs = parseD(t.fecha_solicitud)
  return fs !== null && daysBetween(fs, today()) > 7
}

export function isBlocked(t) {
  return t.estatus === 'Bloqueado'
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
 * @param {Array}  allTareas  full tareas array
 * @param {number} weekNum    ISO week number to scope to
 */
export function teamWeekStats(teamId, allTareas, weekNum) {
  const all = allTareas.filter(t => t.team_id === teamId)
  const tasks = all.filter(t => taskWeek(t) === weekNum)
  const total = tasks.length
  const cerradas = tasks.filter(isClosed).length
  const pct = total ? Math.round((cerradas / total) * 100) : 0
  const bloqueados = all.filter(isBlocked).length
  const retrasados = all.filter(isLate).length
  const apoyo = all.filter(t => t.apoyo_id && !isClosed(t)).length
  return { teamId, total, cerradas, pct, bloqueados, retrasados, apoyo }
}
