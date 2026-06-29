/**
 * Cálculo de métricas financieras.
 * Portado verbatim desde calcFinanzas() del prototipo HTML original.
 */

/**
 * Calcula los totales financieros de un reporte.
 * @param {object} report - Reporte con campo `finanzas`.
 * @returns {{ totIngresos, totGastosOperativos, totSueldos, totOtrosGastos, totEgresos, diferencia }}
 */
export function calcFinanzas(report) {
  const f = report.finanzas ?? { ingresos: [], gastosOperativos: [], sueldos: [], otrosGastos: [] };
  const totIng = (f.ingresos ?? []).reduce((a, it) => a + Number(it.monto ?? 0), 0);
  const totGO  = (f.gastosOperativos ?? []).reduce((a, it) => a + Number(it.monto ?? 0), 0);
  const totSu  = (f.sueldos ?? []).reduce((a, it) => a + Number(it.monto ?? 0), 0);
  const totOG  = (f.otrosGastos ?? []).reduce((a, it) => a + Number(it.monto ?? 0), 0);
  const totEgr = totGO + totSu + totOG;
  return {
    totIngresos:        totIng,
    totGastosOperativos: totGO,
    totSueldos:         totSu,
    totOtrosGastos:     totOG,
    totEgresos:         totEgr,
    diferencia:         totIng - totEgr,
  };
}

/**
 * Formatea un número como USD con 2 decimales.
 * @param {number} n
 * @returns {string} e.g. "$1,234.56"
 */
export function fmtUSD(n) {
  const v = Number(n) || 0;
  return "$" + v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/**
 * Garantiza que un reporte tenga la estructura de finanzas inicializada.
 * Muta el objeto in-place (igual que en el HTML original).
 * @param {object} report
 */
export function ensureFinanzas(report) {
  if (!report.finanzas) {
    report.finanzas = { ingresos: [], gastosOperativos: [], sueldos: [], otrosGastos: [] };
  } else {
    if (!Array.isArray(report.finanzas.ingresos))         report.finanzas.ingresos = [];
    if (!Array.isArray(report.finanzas.gastosOperativos)) report.finanzas.gastosOperativos = [];
    if (!Array.isArray(report.finanzas.sueldos))          report.finanzas.sueldos = [];
    if (!Array.isArray(report.finanzas.otrosGastos))      report.finanzas.otrosGastos = [];
  }
}
