/**
 * Devuelve true si el empleado estaba activo (no dado de baja todavía) durante
 * el mes M del año Y. Análogo a clientInMonth.js, pero sin fecha de alta: la
 * pertenencia al team no tiene fecha propia (metric_line_members no la guarda),
 * así que solo se evalúa la baja (deleted_at). El histórico de composición del
 * team para meses pasados se resuelve congelando el reporte guardado (ver
 * OperacionesView/FinanzasView), no filtrando el roster hacia atrás en el tiempo.
 *
 * Baja = deleted_at (null = aún activo).
 * Todas las comparaciones son en UTC para evitar problemas de timezone.
 */
export function employeeActiveInMonth(user, year, month) {
  if (!user?.deleted_at) return true
  const startOfMonth = Date.UTC(year, month - 1, 1)
  const bajaMs = new Date(user.deleted_at).getTime()
  return bajaMs >= startOfMonth
}
