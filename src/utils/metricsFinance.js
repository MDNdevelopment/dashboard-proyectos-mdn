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
 * Calcula el consolidado de ingresos vs gastos operativos por cliente.
 * Devuelve una fila por cada cliente de la línea (aunque esté en 0),
 * más una fila "Sin cliente" si hay gastos operativos sin clienteId asignado.
 *
 * @param {object} report       - Reporte con campo `finanzas`.
 * @param {Array}  lineClients  - Array de { id, name } de la cartera de la línea.
 * @returns {Array<{ id, nombre, ingresos, gastos, diferencia }>}
 */
export function calcConsolidado(report, lineClients = []) {
  const ing = report.finanzas?.ingresos ?? [];
  const gas = report.finanzas?.gastosOperativos ?? [];

  const sum = (arr, id) =>
    arr.filter(x => x.clienteId === id)
      .reduce((a, it) => a + Number(it.monto ?? 0), 0);

  const filas = lineClients.map(c => {
    const ingresos = sum(ing, c.id);
    const gastos   = sum(gas, c.id);
    return { id: c.id, nombre: c.name, ingresos, gastos, diferencia: ingresos - gastos };
  });

  const sinCliente = gas
    .filter(x => x.clienteId == null)
    .reduce((a, it) => a + Number(it.monto ?? 0), 0);

  if (sinCliente > 0) {
    filas.push({
      id: "_none",
      nombre: "Sin cliente",
      ingresos: 0,
      gastos: sinCliente,
      diferencia: -sinCliente,
    });
  }

  return filas;
}

/**
 * Versión filtrada de calcConsolidado: devuelve solo las filas con gasto operativo > 0
 * más los totales agregados de ingresos, gastos y diferencia.
 *
 * @param {object} report
 * @param {Array}  lineClients
 * @returns {{ rows: Array, totals: { ingresos, gastos, diferencia } }}
 */
export function calcConsolidadoConGasto(report, lineClients = []) {
  const rows = calcConsolidado(report, lineClients).filter(f => f.gastos > 0);
  const totals = rows.reduce(
    (a, f) => ({
      ingresos:   a.ingresos   + f.ingresos,
      gastos:     a.gastos     + f.gastos,
      diferencia: a.diferencia + f.diferencia,
    }),
    { ingresos: 0, gastos: 0, diferencia: 0 },
  );
  return { rows, totals };
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
