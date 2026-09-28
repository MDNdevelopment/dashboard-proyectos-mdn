/**
 * Devuelve true si el empleado estaba activo (no dado de baja todavía) durante
 * el mes M del año Y. Análogo a clientInMonth.js, pero sin fecha de alta: la
 * pertenencia al team no tiene fecha propia (metric_line_members no la guarda),
 * así que solo se evalúa la baja (deleted_at). El histórico de composición del
 * team para meses pasados se resuelve congelando el reporte guardado (ver
 * OperacionesView/FinanzasView), no filtrando el roster hacia atrás en el tiempo.
 *
 * Baja = deleted_at (null = aún activo).
 *
 * La bandera `baja_incluye_mes` (default true) decide qué pasa con el mes de baja:
 *   - true  → el empleado cuenta hasta e INCLUYENDO el mes de baja (trabajó parte
 *             del mes y se le pagó). Comportamiento histórico.
 *   - false → se excluye del mes de baja y siguientes (se fue en los primeros días
 *             o fue un alta por error), pero SIGUE apareciendo en los meses anteriores.
 * Se elige al archivar, en el diálogo de Empresa › Empleados.
 *
 * Todas las comparaciones son en UTC para evitar problemas de timezone.
 */
export function employeeActiveInMonth(user, year, month) {
  if (!user?.deleted_at) return true
  const startOfMonth = Date.UTC(year, month - 1, 1)
  const endOfMonth = Date.UTC(year, month, 0, 23, 59, 59, 999) // día 0 del mes siguiente = último día del actual
  const bajaMs = new Date(user.deleted_at).getTime()
  const incluyeMes = user.baja_incluye_mes !== false
  return incluyeMes ? bajaMs >= startOfMonth : bajaMs > endOfMonth
}
