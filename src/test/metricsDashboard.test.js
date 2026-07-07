import { describe, it, expect } from "vitest";
import { aggregateMetricsDashboard } from "../utils/aggregateMetricsDashboard";
import { calcTotal, sumScore } from "../utils/metricsScore";
import { calcFinanzas } from "../utils/metricsFinance";

const LINES = [
  { id: "l1", name: "Georgina",  color: "#FAB51A" },
  { id: "l2", name: "Daniellys", color: "#3B82F6" },
];

function makeReportData(scoreHint = 100) {
  // Reporte donde todas las métricas numéricas simples están al máximo
  const factor = scoreHint / 100;
  return {
    reuniones:     { realizadas: Math.round(15 * factor), meta: 15 },
    productividad: { tareas: [{ nombre: "T", realizado: Math.round(10 * factor), meta: 10 }] },
    crecimiento:   { items: [] },
    solicitudes:   { solicitudes: 10, editadas: Math.round(10 * factor) },
    pautas:        { items: [] },
    piezas:        { piezas: 10, editadas: Math.round(10 * factor) },
    feedback:      { items: [] },
    finanzas:      { ingresos: [{ monto: 1000 }], gastosOperativos: [], sueldos: [{ monto: 400 }], otrosGastos: [] },
  };
}

function makeReports(year = 2026) {
  return [
    { line_id: "l1", year, month: 1,  data: makeReportData(100) },
    { line_id: "l1", year, month: 2,  data: makeReportData(60)  },
    { line_id: "l2", year, month: 1,  data: makeReportData(80)  },
  ];
}

describe("aggregateMetricsDashboard", () => {
  const year = 2026;

  it("construye la matriz con null para meses sin reporte", () => {
    const reports = makeReports(year);
    const agg = aggregateMetricsDashboard(LINES, reports, year, calcTotal, sumScore, calcFinanzas);
    // l1 mes 1 y 2 tienen datos, mes 3 no
    expect(agg.matrix["l1"][0]).not.toBeNull();
    expect(agg.matrix["l1"][1]).not.toBeNull();
    expect(agg.matrix["l1"][2]).toBeNull();
    // l2 solo mes 1
    expect(agg.matrix["l2"][0]).not.toBeNull();
    expect(agg.matrix["l2"][1]).toBeNull();
  });

  it("el score de un reporte al 100% está entre 50 y 100 (sin crecimiento/pautas/feedback)", () => {
    // Sin crecimiento, pautas ni feedback → esos 3 indicadores dan 0
    // pero reuniones(20) + productividad(15) + solicitudes(15) + piezas(15) = 65
    const reports = makeReports(year);
    const agg = aggregateMetricsDashboard(LINES, reports, year, calcTotal, sumScore, calcFinanzas);
    const scoreL1M1 = agg.matrix["l1"][0];
    expect(scoreL1M1).toBeGreaterThanOrEqual(60);
    expect(scoreL1M1).toBeLessThanOrEqual(100);
  });

  it("identifica el líder correctamente", () => {
    const reports = makeReports(year);
    const agg = aggregateMetricsDashboard(LINES, reports, year, calcTotal, sumScore, calcFinanzas);
    // l1 tiene 2 meses con scores más altos en promedio que l2 (1 mes con 80)
    expect(agg.lider).not.toBeNull();
    expect(agg.lider.line.id).toBe("l1"); // l1 promedia mejor
  });

  it("cobertura es proporcional a reportes cargados vs posibles", () => {
    const reports = makeReports(year);
    const agg = aggregateMetricsDashboard(LINES, reports, year, calcTotal, sumScore, calcFinanzas);
    // 3 reportes de (2 líneas × currentMonth), cobertura > 0
    expect(agg.cobertura).toBeGreaterThan(0);
    expect(agg.cobertura).toBeLessThanOrEqual(100);
  });

  it("sin reportes retorna promAnual 0 y lider null", () => {
    const agg = aggregateMetricsDashboard(LINES, [], year, calcTotal, sumScore, calcFinanzas);
    expect(agg.promAnual).toBe(0);
    expect(agg.lider).toBeNull();
    expect(agg.ranking).toHaveLength(0);
  });

  it("finanzas por línea muestra solo el mes seleccionado", () => {
    const reports = makeReports(year);
    // Mes 1: l1 tiene datos, ingresos = 1000, nómina = 400
    const agg1 = aggregateMetricsDashboard(LINES, reports, year, calcTotal, sumScore, calcFinanzas, 1);
    expect(agg1.finTotalesPorLinea["l1"].ingresos).toBe(1000);
    expect(agg1.finTotalesPorLinea["l1"].nomina).toBe(400);
    // Mes 2: l1 tiene datos, ingresos = 1000, nómina = 400
    const agg2 = aggregateMetricsDashboard(LINES, reports, year, calcTotal, sumScore, calcFinanzas, 2);
    expect(agg2.finTotalesPorLinea["l1"].ingresos).toBe(1000);
    expect(agg2.finTotalesPorLinea["l1"].nomina).toBe(400);
    // Mes 3: l1 sin datos → todo 0
    const agg3 = aggregateMetricsDashboard(LINES, reports, year, calcTotal, sumScore, calcFinanzas, 3);
    expect(agg3.finTotalesPorLinea["l1"].ingresos).toBe(0);
    expect(agg3.finTotalesPorLinea["l1"].egresos).toBe(0);
  });

  it("usa referenceMonth como currentMonth cuando se pasa como 7.° argumento", () => {
    const reports = makeReports(year); // datos en meses 1 y 2
    const agg = aggregateMetricsDashboard(LINES, reports, year, calcTotal, sumScore, calcFinanzas, 1);
    expect(agg.currentMonth).toBe(1);
    expect(agg.promMesActual).not.toBeNull();
  });

  it("sin referenceMonth usa el mes actual del sistema", () => {
    const reports = makeReports(year);
    const agg = aggregateMetricsDashboard(LINES, reports, year, calcTotal, sumScore, calcFinanzas);
    const sysMonth = new Date().getFullYear() === year ? new Date().getMonth() + 1 : 12;
    expect(agg.currentMonth).toBe(sysMonth);
  });

  it("meses marcados como incompletos quedan excluidos de matrix/promAnual/lider", () => {
    // l1 mes 1 completo + mes 2 marcado incompleto; l2 mes 1 completo
    const reports = [
      { line_id: "l1", year, month: 1, data: makeReportData(100) },
      { line_id: "l1", year, month: 2, data: { ...makeReportData(60), incompleto: true } },
      { line_id: "l2", year, month: 1, data: makeReportData(80) },
    ];
    const agg = aggregateMetricsDashboard(LINES, reports, year, calcTotal, sumScore, calcFinanzas);

    // l1 mes 1 cuenta, mes 2 incompleto → null en matrix
    expect(agg.matrix["l1"][0]).not.toBeNull();
    expect(agg.matrix["l1"][1]).toBeNull();

    // l1 promedio debe ser solo del mes 1 (igual a sin mes 2)
    const valsL1 = agg.matrix["l1"].filter(v => v != null);
    expect(valsL1).toHaveLength(1);

    // El lider no puede ser determinado por el mes incompleto de l1
    // (ambas líneas tienen 1 mes válido cada una, l1 mes1 ≥ l2 mes1 por factor)
    expect(agg.lider).not.toBeNull();
    expect(agg.lider.line.id).toBe("l1");

    // Finanzas del mes 1 (completo): ingresos = 1000
    const aggM1 = aggregateMetricsDashboard(LINES, reports, year, calcTotal, sumScore, calcFinanzas, 1);
    expect(aggM1.finTotalesPorLinea["l1"].ingresos).toBe(1000);
    // Finanzas del mes 2 (incompleto en score pero con datos financieros): ingresos = 1000
    const aggM2 = aggregateMetricsDashboard(LINES, reports, year, calcTotal, sumScore, calcFinanzas, 2);
    expect(aggM2.finTotalesPorLinea["l1"].ingresos).toBe(1000);
  });
});
