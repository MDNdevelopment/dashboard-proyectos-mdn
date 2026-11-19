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

/**
 * ¿Hay que tratar el reporte como congelado a efectos de DERIVACIÓN (recalcular indicadores desde
 * las fuentes y autoguardarlos)? Sí si está cerrado, y también si un admin lo desbloqueó
 * (`reopened_at`): un reporte desbloqueado se edita a mano, pero no se reescribe solo con datos de
 * hoy hasta que se vuelva a cerrar. La edición (`fieldset`/autoguardado manual) solo mira
 * `closed_at`.
 * @param {{closed_at?: string|null, reopened_at?: string|null}|null|undefined} row
 * @returns {boolean}
 */
export function isDerivationFrozen(row) {
  return !!(row?.closed_at || row?.reopened_at)
}
