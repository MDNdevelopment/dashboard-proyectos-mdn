/**
 * Lógica pura de fechas para el cierre automático de reportes mensuales
 * (ver ARQUITECTURA.md §2.5). El reporte del mes anterior se cierra solo el
 * día `CLOSURE_DAY` del mes en curso (cron `enqueue-metric-report-closures`);
 * entre el día 1 y ese día las jefas de línea reciben un aviso diario.
 *
 * Todo acá es puro y recibe `now` inyectable — mismo estilo que
 * `isReportFrozen` en `reportPeriod.js` — para poder testear cruces de año y
 * casos borde sin mockear el reloj.
 */

export const CLOSURE_DAY = 5

/** Periodo que se está por cerrar: el mes calendario anterior a `now`. */
export function closurePeriod(now = new Date()) {
  const y = now.getUTCFullYear()
  const m = now.getUTCMonth() + 1 // 1-12
  if (m === 1) return { year: y - 1, month: 12 }
  return { year: y, month: m - 1 }
}

/** true si hoy es día 1..CLOSURE_DAY (ventana de avisos/cierre). */
export function isClosureWindow(now = new Date()) {
  const day = now.getUTCDate()
  return day >= 1 && day <= CLOSURE_DAY
}

/** Días que faltan para el cierre automático. 0 el mismo día del cierre. */
export function daysLeftToClose(now = new Date()) {
  const day = now.getUTCDate()
  return Math.max(0, CLOSURE_DAY - day)
}

/**
 * Líneas lideradas por `userId` cuyo reporte del periodo no está cerrado.
 * Una línea sin fila de reporte todavía también cuenta como pendiente.
 *
 * @param {Array<{id:string, name:string, color:string, lead_user_id:string|null}>} lines
 *   líneas ya normalizadas por loadLines() (traen lead_user_id)
 * @param {Array<{line_id:string, closed_at:string|null}>} reports
 *   filas de metric_reports del periodo en cuestión
 * @param {string|null|undefined} userId
 * @returns {Array<object>} subconjunto de `lines` pendiente de cierre
 */
export function pendingLeadReports(lines, reports, userId) {
  if (!userId) return []
  const closedLineIds = new Set((reports ?? []).filter((r) => r.closed_at).map((r) => r.line_id))
  return (lines ?? []).filter((line) => line.lead_user_id === userId && !closedLineIds.has(line.id))
}

/**
 * Decide si corresponde mostrar el modal de recordatorio: hay líneas
 * pendientes, estamos dentro de la ventana de avisos y todavía no se vio hoy.
 *
 * @param {{ pending: Array<object>, seenDate: string|null, now?: Date }} args
 *   `seenDate` es la fecha 'YYYY-MM-DD' persistida en localStorage, o null.
 */
export function shouldShowClosureReminder({ pending, seenDate, now = new Date() }) {
  if (!pending || pending.length === 0) return false
  if (!isClosureWindow(now)) return false
  const today = now.toISOString().slice(0, 10)
  return seenDate !== today
}
