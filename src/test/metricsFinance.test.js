import { describe, it, expect } from "vitest";
import { calcFinanzas, calcConsolidado, calcConsolidadoConGasto, fmtUSD, ensureFinanzas, lastNMonths, buildFinanceTrend } from "../utils/metricsFinance";

function makeReport(overrides = {}) {
  return {
    finanzas: {
      ingresos: [],
      gastosOperativos: [],
      sueldos: [],
      otrosGastos: [],
      ...overrides,
    },
  };
}

describe("calcFinanzas", () => {
  it("reporte vacío retorna todo en 0", () => {
    const r = makeReport();
    const f = calcFinanzas(r);
    expect(f.totIngresos).toBe(0);
    expect(f.totEgresos).toBe(0);
    expect(f.diferencia).toBe(0);
  });

  it("calcula ingresos correctamente", () => {
    const r = makeReport({
      ingresos: [{ monto: 1000 }, { monto: 500 }],
    });
    expect(calcFinanzas(r).totIngresos).toBe(1500);
  });

  it("suma todos los tipos de egresos", () => {
    const r = makeReport({
      gastosOperativos: [{ monto: 200 }],
      sueldos:          [{ monto: 800 }],
      otrosGastos:      [{ monto: 100 }],
    });
    const f = calcFinanzas(r);
    expect(f.totGastosOperativos).toBe(200);
    expect(f.totSueldos).toBe(800);
    expect(f.totOtrosGastos).toBe(100);
    expect(f.totEgresos).toBe(1100);
  });

  it("diferencia = ingresos − egresos", () => {
    const r = makeReport({
      ingresos: [{ monto: 2000 }],
      sueldos:  [{ monto: 500 }],
    });
    const f = calcFinanzas(r);
    expect(f.diferencia).toBe(1500);
  });

  it("diferencia negativa cuando egresos > ingresos", () => {
    const r = makeReport({
      ingresos: [{ monto: 300 }],
      sueldos:  [{ monto: 1000 }],
    });
    expect(calcFinanzas(r).diferencia).toBe(-700);
  });

  it("tolera montos ausentes o string vacío", () => {
    const r = makeReport({
      ingresos: [{ monto: "" }, { monto: null }, { monto: 500 }],
    });
    expect(calcFinanzas(r).totIngresos).toBe(500);
  });
});

describe("fmtUSD", () => {
  it("formatea con signo dólar y 2 decimales", () => {
    expect(fmtUSD(1234.5)).toBe("$1,234.50");
  });

  it("formatea 0 como $0.00", () => {
    expect(fmtUSD(0)).toBe("$0.00");
  });

  it("tolera undefined/null → $0.00", () => {
    expect(fmtUSD(null)).toBe("$0.00");
    expect(fmtUSD(undefined)).toBe("$0.00");
  });
});

describe("calcConsolidado", () => {
  const CLIENTS = [
    { id: "c1", name: "Cliente A" },
    { id: "c2", name: "Cliente B" },
  ];

  it("calcula ingresos y gastos por cliente con diferencia correcta", () => {
    const report = {
      finanzas: {
        ingresos:         [{ clienteId: "c1", monto: 1000 }, { clienteId: "c2", monto: 500 }],
        gastosOperativos: [{ clienteId: "c1", monto: 300 }],
        sueldos: [], otrosGastos: [],
      },
    };
    const filas = calcConsolidado(report, CLIENTS);
    expect(filas).toHaveLength(2);
    const a = filas.find(f => f.id === "c1");
    expect(a.ingresos).toBe(1000);
    expect(a.gastos).toBe(300);
    expect(a.diferencia).toBe(700);
    const b = filas.find(f => f.id === "c2");
    expect(b.ingresos).toBe(500);
    expect(b.gastos).toBe(0);
    expect(b.diferencia).toBe(500);
  });

  it("cliente sin datos aparece con todo en 0", () => {
    const report = {
      finanzas: { ingresos: [], gastosOperativos: [], sueldos: [], otrosGastos: [] },
    };
    const filas = calcConsolidado(report, CLIENTS);
    expect(filas).toHaveLength(2);
    filas.forEach(f => {
      expect(f.ingresos).toBe(0);
      expect(f.gastos).toBe(0);
      expect(f.diferencia).toBe(0);
    });
  });

  it("agrega fila 'Sin cliente' cuando hay gastos operativos sin clienteId", () => {
    const report = {
      finanzas: {
        ingresos: [{ clienteId: "c1", monto: 800 }],
        gastosOperativos: [{ clienteId: null, monto: 200 }, { clienteId: "c1", monto: 100 }],
        sueldos: [], otrosGastos: [],
      },
    };
    const filas = calcConsolidado(report, CLIENTS);
    const sinCliente = filas.find(f => f.id === "_none");
    expect(sinCliente).toBeDefined();
    expect(sinCliente.nombre).toBe("Sin cliente");
    expect(sinCliente.gastos).toBe(200);
    expect(sinCliente.diferencia).toBe(-200);
  });

  it("no agrega fila 'Sin cliente' cuando no hay gastos sin asignar", () => {
    const report = {
      finanzas: {
        ingresos: [{ clienteId: "c1", monto: 800 }],
        gastosOperativos: [{ clienteId: "c1", monto: 100 }],
        sueldos: [], otrosGastos: [],
      },
    };
    const filas = calcConsolidado(report, CLIENTS);
    expect(filas.find(f => f.id === "_none")).toBeUndefined();
  });

  it("tolera montos null/vacío en los totales", () => {
    const report = {
      finanzas: {
        ingresos:         [{ clienteId: "c1", monto: null }, { clienteId: "c1", monto: 500 }],
        gastosOperativos: [{ clienteId: "c1", monto: "" }],
        sueldos: [], otrosGastos: [],
      },
    };
    const filas = calcConsolidado(report, CLIENTS);
    const a = filas.find(f => f.id === "c1");
    expect(a.ingresos).toBe(500);
    expect(a.gastos).toBe(0);
  });
});

describe("calcConsolidadoConGasto", () => {
  const CLIENTS = [
    { id: "c1", name: "Cliente A" },
    { id: "c2", name: "Cliente B" },
  ];

  it("filtra marcas cuyo gasto operativo es 0", () => {
    const report = {
      finanzas: {
        ingresos:         [{ clienteId: "c1", monto: 500 }, { clienteId: "c2", monto: 300 }],
        gastosOperativos: [{ clienteId: "c1", monto: 200 }],
        sueldos: [], otrosGastos: [],
      },
    };
    const { rows } = calcConsolidadoConGasto(report, CLIENTS);
    // c2 no tiene gasto → solo c1 debe aparecer
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe("c1");
  });

  it("conserva la fila 'Sin cliente' cuando tiene gasto > 0", () => {
    const report = {
      finanzas: {
        ingresos:         [],
        gastosOperativos: [{ clienteId: null, monto: 150 }],
        sueldos: [], otrosGastos: [],
      },
    };
    const { rows } = calcConsolidadoConGasto(report, CLIENTS);
    const sinCliente = rows.find(f => f.id === "_none");
    expect(sinCliente).toBeDefined();
    expect(sinCliente.gastos).toBe(150);
  });

  it("totals suma correctamente ingresos, gastos y diferencia de filas visibles", () => {
    const report = {
      finanzas: {
        ingresos:         [{ clienteId: "c1", monto: 1000 }, { clienteId: "c2", monto: 400 }],
        gastosOperativos: [{ clienteId: "c1", monto: 300 }, { clienteId: "c2", monto: 100 }],
        sueldos: [], otrosGastos: [],
      },
    };
    const { rows, totals } = calcConsolidadoConGasto(report, CLIENTS);
    expect(rows).toHaveLength(2);
    expect(totals.ingresos).toBe(1400);
    expect(totals.gastos).toBe(400);
    expect(totals.diferencia).toBe(1000);
  });

  it("devuelve rows vacío y totals en 0 cuando no hay gastos operativos", () => {
    const report = {
      finanzas: {
        ingresos:         [{ clienteId: "c1", monto: 500 }],
        gastosOperativos: [],
        sueldos: [], otrosGastos: [],
      },
    };
    const { rows, totals } = calcConsolidadoConGasto(report, CLIENTS);
    expect(rows).toHaveLength(0);
    expect(totals.ingresos).toBe(0);
    expect(totals.gastos).toBe(0);
    expect(totals.diferencia).toBe(0);
  });
});

describe("lastNMonths", () => {
  it("devuelve los 5 meses terminando en el mes dado, sin cruzar año", () => {
    expect(lastNMonths(2026, 7)).toEqual([
      { year: 2026, month: 3 },
      { year: 2026, month: 4 },
      { year: 2026, month: 5 },
      { year: 2026, month: 6 },
      { year: 2026, month: 7 },
    ]);
  });

  it("cruza el límite de año hacia atrás correctamente", () => {
    expect(lastNMonths(2026, 2)).toEqual([
      { year: 2025, month: 10 },
      { year: 2025, month: 11 },
      { year: 2025, month: 12 },
      { year: 2026, month: 1 },
      { year: 2026, month: 2 },
    ]);
  });

  it("respeta un n distinto de 5", () => {
    expect(lastNMonths(2026, 3, 2)).toEqual([
      { year: 2026, month: 2 },
      { year: 2026, month: 3 },
    ]);
  });
});

describe("buildFinanceTrend", () => {
  it("calcula ingresos/egresos por mes y deja en 0 los meses sin reporte", () => {
    const reports = [
      { year: 2026, month: 5, data: { finanzas: { ingresos: [{ monto: 1000 }], gastosOperativos: [{ monto: 200 }], sueldos: [], otrosGastos: [] } } },
      { year: 2026, month: 7, data: { finanzas: { ingresos: [{ monto: 800 }], gastosOperativos: [], sueldos: [{ monto: 300 }], otrosGastos: [] } } },
    ];
    const trend = buildFinanceTrend(reports, 2026, 7);
    expect(trend).toHaveLength(5);
    expect(trend.map(t => t.label)).toEqual(["Mar", "Abr", "May", "Jun", "Jul"]);

    const marzo = trend.find(t => t.month === 3);
    expect(marzo.ingresos).toBe(0);
    expect(marzo.egresos).toBe(0);
    expect(marzo.diferencia).toBe(0);

    const mayo = trend.find(t => t.month === 5);
    expect(mayo.ingresos).toBe(1000);
    expect(mayo.egresos).toBe(200);
    expect(mayo.diferencia).toBe(800);

    const julio = trend.find(t => t.month === 7);
    expect(julio.ingresos).toBe(800);
    expect(julio.egresos).toBe(300);
    expect(julio.diferencia).toBe(500);
  });

  it("mantiene el orden del más antiguo al más reciente", () => {
    const trend = buildFinanceTrend([], 2026, 1);
    expect(trend.map(t => `${t.year}-${t.month}`)).toEqual([
      "2025-9", "2025-10", "2025-11", "2025-12", "2026-1",
    ]);
  });
});

describe("ensureFinanzas", () => {
  it("inicializa finanzas si no existe", () => {
    const r = {};
    ensureFinanzas(r);
    expect(r.finanzas).toBeDefined();
    expect(Array.isArray(r.finanzas.ingresos)).toBe(true);
    expect(Array.isArray(r.finanzas.gastosOperativos)).toBe(true);
    expect(Array.isArray(r.finanzas.sueldos)).toBe(true);
    expect(Array.isArray(r.finanzas.otrosGastos)).toBe(true);
  });

  it("no destruye arrays existentes", () => {
    const r = { finanzas: { ingresos: [{ monto: 100 }], gastosOperativos: [], sueldos: [], otrosGastos: [] } };
    ensureFinanzas(r);
    expect(r.finanzas.ingresos).toHaveLength(1);
  });
});
