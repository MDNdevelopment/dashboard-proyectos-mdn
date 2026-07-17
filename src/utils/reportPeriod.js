/**
 * Un reporte es de solo lectura ("congelado") si ya fue cerrado o si pertenece
 * a un mes estrictamente anterior al mes en curso.
 *
 * Se usa para decidir si OperacionesView/FinanzasView deben reconciliar el
 * reporte guardado contra el roster ACTUAL de clientes/empleados de la línea
 * (syncReportClients) o mostrarlo tal cual quedó guardado. Reconciliar un mes
 * pasado contra el roster de hoy corrompe el histórico: descarta a quienes
 * fueron dados de baja después de ese mes y agrega a quienes se sumaron
 * después (ver bug: bajas/altas de team apareciendo/desapareciendo en meses
 * en los que no correspondía).
 *
 * @param {number} year
 * @param {number} month  - 1-12
 * @param {boolean} closed
 * @param {Date} [now] - inyectable para tests
 * @returns {boolean}
 */
export function isReportFrozen(year, month, closed, now = new Date()) {
  if (closed) return true
  const y = now.getUTCFullYear()
  const m = now.getUTCMonth() + 1
  return year < y || (year === y && month < m)
}
