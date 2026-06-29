/**
 * Agrega todos los reportes de un año para el Dashboard General.
 * Portado desde renderDashboard() y renderDashboardFinanzas() del HTML original.
 *
 * @param {Array} lines       - Array de { id, name, color } (las 4 líneas).
 * @param {Array} reports     - Array de { line_id, year, month, data } del año.
 * @param {number} year       - El año analizado.
 * @param {Function} calcTotalFn  - calcTotal(report, prevReport) — inyectada para evitar imports circulares.
 * @param {Function} sumScoreFn   - sumScore(scores).
 * @param {Function} calcFinanzasFn - calcFinanzas(report).
 * @returns {object} Objeto con toda la información para el Dashboard General.
 */
export function aggregateMetricsDashboard(lines, reports, year, calcTotalFn, sumScoreFn, calcFinanzasFn) {
  // Índice rápido: (lineId, month) → report
  const reportIndex = {};
  reports.forEach(r => {
    reportIndex[`${r.line_id}__${r.month}`] = r;
  });

  function getReport(lineId, month) {
    return reportIndex[`${lineId}__${month}`] ?? null;
  }

  function getPrevReport(lineId, month) {
    // Busca el reporte del mes anterior más cercano (hasta 12 meses atrás)
    let m = month - 1;
    let y = year;
    // Solo buscamos dentro del año cargado (los reportes son del año actual)
    if (m < 1) return null;
    return getReport(lineId, m);
  }

  const today = new Date();
  const currentMonth = today.getFullYear() === year ? today.getMonth() + 1 : 12;

  // Matriz línea × mes → score (null si no hay reporte)
  const matrix = {};
  lines.forEach(line => {
    matrix[line.id] = Array.from({ length: 12 }, (_, i) => {
      const r = getReport(line.id, i + 1);
      if (!r) return null;
      const prev = getPrevReport(line.id, i + 1);
      const scores = calcTotalFn(r.data, prev?.data ?? null);
      return sumScoreFn(scores);
    });
  });

  // Promedio anual general (todas las líneas y meses)
  const todosValores = [];
  lines.forEach(line => matrix[line.id].forEach(v => { if (v != null) todosValores.push(v); }));
  const promAnual = todosValores.length > 0
    ? todosValores.reduce((a, b) => a + b, 0) / todosValores.length
    : 0;

  // Promedio mes actual
  const valoresMesActual = lines.map(l => matrix[l.id][currentMonth - 1]).filter(v => v != null);
  const promMesActual = valoresMesActual.length > 0
    ? valoresMesActual.reduce((a, b) => a + b, 0) / valoresMesActual.length
    : null;

  // Líder del año: línea con mejor promedio anual
  const promPorLinea = lines.map(line => {
    const vals = matrix[line.id].filter(v => v != null);
    return { line, prom: vals.length > 0 ? vals.reduce((a, b) => a + b, 0) / vals.length : null };
  }).filter(x => x.prom != null);
  const lider = promPorLinea.length > 0 ? promPorLinea.reduce((a, b) => a.prom >= b.prom ? a : b) : null;

  // Cobertura: reportes cargados / reportes posibles (líneas × meses transcurridos)
  const posibles = lines.length * currentMonth;
  const cargados = todosValores.length;
  const cobertura = posibles > 0 ? (cargados / posibles) * 100 : 0;

  // Ranking del mes más reciente con datos
  let rankingMonth = currentMonth;
  while (rankingMonth > 0 && lines.every(l => matrix[l.id][rankingMonth - 1] == null)) rankingMonth--;
  const ranking = lines
    .map(line => ({ line, score: matrix[line.id][rankingMonth - 1] }))
    .filter(r => r.score != null)
    .sort((a, b) => b.score - a.score);

  // Finanzas agregadas por línea y por mes
  const finanzasPorLinea = {};
  lines.forEach(line => {
    const meses = Array.from({ length: 12 }, (_, i) => {
      const r = getReport(line.id, i + 1);
      if (!r) return null;
      return calcFinanzasFn(r.data);
    });
    finanzasPorLinea[line.id] = meses;
  });

  // Totales financieros por línea para el año
  const finTotalesPorLinea = {};
  lines.forEach(line => {
    const meses = finanzasPorLinea[line.id].filter(Boolean);
    finTotalesPorLinea[line.id] = {
      ingresos:  meses.reduce((a, m) => a + m.totIngresos, 0),
      egresos:   meses.reduce((a, m) => a + m.totEgresos, 0),
      diferencia: meses.reduce((a, m) => a + m.diferencia, 0),
      nomina:    meses.reduce((a, m) => a + m.totSueldos, 0),
    };
  });

  return {
    matrix,
    currentMonth,
    promAnual,
    promMesActual,
    lider,
    cobertura,
    ranking,
    rankingMonth,
    finanzasPorLinea,
    finTotalesPorLinea,
  };
}
