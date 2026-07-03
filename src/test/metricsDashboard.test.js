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

  it("finanzas por línea acumula ingresos y egresos del año", () => {
    const reports = makeReports(year);
    const agg = aggregateMetricsDashboard(LINES, reports, year, calcTotal, sumScore, calcFinanzas);
    // l1 tiene 2 meses de datos financieros: ingresos 1000 cada uno = 2000
    expect(agg.finTotalesPorLinea["l1"].ingresos).toBe(2000);
    expect(agg.finTotalesPorLinea["l1"].nomina).toBe(800);
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

    // Las finanzas del mes incompleto SÍ se acumulan (el flag solo afecta la nota)
    expect(agg.finTotalesPorLinea["l1"].ingresos).toBe(2000); // 2 meses de finanzas
  });
});
