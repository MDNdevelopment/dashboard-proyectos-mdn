import { describe, it, expect } from "vitest";
import { calcFinanzas, fmtUSD, ensureFinanzas } from "../utils/metricsFinance";

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
