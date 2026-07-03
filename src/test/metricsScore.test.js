import { describe, it, expect } from "vitest";
import {
  calcReuniones, calcProductividad, calcCrecimiento,
  calcSolicitudes, calcPautas, calcPiezas,
  calcTotal, sumScore, crecimientoCliente, lastLineScore,
} from "../utils/metricsScore";
import { INDICATORS } from "../components/metricas/constants";

// ─── helpers ──────────────────────────────────────────────────────────────────
function makeReport(overrides = {}) {
  return {
    reuniones:     { realizadas: 0, meta: 15 },
    productividad: { tareas: [] },
    crecimiento:   { items: [] },
    solicitudes:   { solicitudes: 0, editadas: 0 },
    pautas:        { items: [] },
    piezas:        { piezas: 0, editadas: 0 },
    finanzas:      { ingresos: [], gastosOperativos: [], sueldos: [], otrosGastos: [] },
    ...overrides,
  };
}

// ─── pesos ────────────────────────────────────────────────────────────────────
describe("INDICATORS weights", () => {
  it("Los pesos de los 6 indicadores suman 100", () => {
    const total = INDICATORS.reduce((acc, ind) => acc + ind.peso, 0);
    expect(total).toBe(100);
  });

  it("hay exactamente 6 indicadores", () => {
    expect(INDICATORS).toHaveLength(6);
  });

  it("no existe el indicador feedback", () => {
    expect(INDICATORS.find(i => i.key === "feedback")).toBeUndefined();
  });
});

// ─── calcReuniones ────────────────────────────────────────────────────────────
describe("calcReuniones", () => {
  it("retorna 20 cuando realizadas === meta", () => {
    const r = makeReport({ reuniones: { realizadas: 15, meta: 15 } });
    expect(calcReuniones(r)).toBe(20);
  });

  it("retorna 0 cuando meta === 0", () => {
    const r = makeReport({ reuniones: { realizadas: 5, meta: 0 } });
    expect(calcReuniones(r)).toBe(0);
  });

  it("proporciona correctamente realizadas < meta", () => {
    const r = makeReport({ reuniones: { realizadas: 10, meta: 20 } });
    expect(calcReuniones(r)).toBe(10); // (10/20)*20
  });
});

// ─── calcProductividad (peso 20) ──────────────────────────────────────────────
describe("calcProductividad", () => {
  it("retorna 20 cuando se cumplen todas las tareas (peso nuevo)", () => {
    const r = makeReport({
      productividad: {
        tareas: [
          { nombre: "A", realizado: 15, meta: 15 },
          { nombre: "B", realizado: 41, meta: 41 },
        ],
      },
    });
    expect(calcProductividad(r)).toBe(20);
  });

  it("retorna 0 cuando no hay tareas", () => {
    const r = makeReport({ productividad: { tareas: [] } });
    expect(calcProductividad(r)).toBe(0);
  });

  it("pondera suma de realizado / suma de meta", () => {
    const r = makeReport({
      productividad: {
        tareas: [
          { nombre: "A", realizado: 10, meta: 20 },
          { nombre: "B", realizado: 5,  meta: 10 },
        ],
      },
    });
    // (15/30)*20 = 10
    expect(calcProductividad(r)).toBe(10);
  });
});

// ─── crecimientoCliente ───────────────────────────────────────────────────────
describe("crecimientoCliente", () => {
  // ── Modelo nuevo: seguidoresGanados explícito ─────────────────────────────
  it("cumple cuando seguidoresGanados >= meta (modelo nuevo)", () => {
    const item = { clienteId: "c1", seguidoresGanados: 120, seguidoresActuales: 1120, meta: 100 };
    const res = crecimientoCliente(item, null);
    expect(res.ganados).toBe(120);
    expect(res.cumple).toBe(true);
  });

  it("no cumple cuando seguidoresGanados < meta", () => {
    const item = { clienteId: "c1", seguidoresGanados: 50, seguidoresActuales: 1050, meta: 100 };
    const res = crecimientoCliente(item, null);
    expect(res.ganados).toBe(50);
    expect(res.cumple).toBe(false);
  });

  it("cumple exacto en el límite (ganados === meta)", () => {
    const item = { clienteId: "c1", seguidoresGanados: 100, seguidoresActuales: 1100, meta: 100 };
    const res = crecimientoCliente(item, null);
    expect(res.cumple).toBe(true);
  });

  it("retorna ganados: null cuando no hay seguidoresGanados ni datos de fallback", () => {
    const item = { clienteId: "c1", seguidoresGanados: null, seguidoresActuales: null, seguidoresBase: null, meta: 100 };
    const res = crecimientoCliente(item, null);
    expect(res.ganados).toBeNull();
    expect(res.cumple).toBeNull();
    expect(res.pct).toBeNull();
  });

  // ── pct (porcentaje de cumplimiento: ganados / meta × 100) ──────────────
  it("pct refleja el cumplimiento cuando se superó la meta", () => {
    const item = { clienteId: "c1", seguidoresGanados: 120, meta: 100 };
    const res = crecimientoCliente(item, null);
    expect(res.pct).toBeCloseTo(120); // 120/100*100 = 120%
  });

  it("pct refleja el cumplimiento parcial cuando no se alcanzó la meta", () => {
    const item = { clienteId: "c1", seguidoresGanados: 80, meta: 100 };
    const res = crecimientoCliente(item, null);
    expect(res.pct).toBeCloseTo(80); // 80/100*100 = 80%
  });

  it("pct es null cuando meta es 0 (evita división por cero)", () => {
    const item = { clienteId: "c1", seguidoresGanados: 50, meta: 0 };
    const res = crecimientoCliente(item, null);
    expect(res.pct).toBeNull();
  });

  // ── Fallback para reportes históricos (sin seguidoresGanados) ────────────
  it("fallback: cumple cuando (actuales − seguidoresBase) >= meta", () => {
    const item = { clienteId: "c1", seguidoresGanados: null, seguidoresActuales: 1100, seguidoresBase: 1000, meta: 100 };
    const res = crecimientoCliente(item, null);
    expect(res.ganados).toBe(100);
    expect(res.cumple).toBe(true);
  });

  it("fallback: no cumple cuando (actuales − seguidoresBase) < meta", () => {
    const item = { clienteId: "c1", seguidoresGanados: null, seguidoresActuales: 1050, seguidoresBase: 1000, meta: 100 };
    const res = crecimientoCliente(item, null);
    expect(res.ganados).toBe(50);
    expect(res.cumple).toBe(false);
  });

  it("fallback: retorna null cuando falta seguidoresActuales", () => {
    const item = { clienteId: "c1", seguidoresGanados: null, seguidoresActuales: null, seguidoresBase: 1000, meta: 100 };
    const res = crecimientoCliente(item, null);
    expect(res.ganados).toBeNull();
    expect(res.cumple).toBeNull();
  });

  it("fallback: retorna null cuando falta base (sin seguidoresBase ni prevReport)", () => {
    const item = { clienteId: "c1", seguidoresGanados: null, seguidoresActuales: 1100, seguidoresBase: null, meta: 100 };
    const res = crecimientoCliente(item, null);
    expect(res.ganados).toBeNull();
    expect(res.cumple).toBeNull();
  });

  it("fallback: toma la base del mes anterior (seguidoresActuales de prevReport)", () => {
    const prevReport = {
      crecimiento: { items: [{ clienteId: "c1", seguidoresActuales: 900 }] },
    };
    const item = { clienteId: "c1", seguidoresGanados: null, seguidoresActuales: 1050, seguidoresBase: 1000, meta: 100 };
    const res = crecimientoCliente(item, prevReport);
    // base = 900 (mes anterior), no 1000 (manual); ganados = 150 >= 100 → cumple
    expect(res.ganados).toBe(150);
    expect(res.cumple).toBe(true);
  });

  it("fallback: cae a seguidoresBase si el prevReport no tiene el cliente", () => {
    const prevReport = {
      crecimiento: { items: [{ clienteId: "c2", seguidoresActuales: 900 }] },
    };
    const item = { clienteId: "c1", seguidoresGanados: null, seguidoresActuales: 1050, seguidoresBase: 1000, meta: 100 };
    const res = crecimientoCliente(item, prevReport);
    // prevReport no tiene c1 → base = 1000; ganados = 50 < 100 → no cumple
    expect(res.ganados).toBe(50);
    expect(res.cumple).toBe(false);
  });
});

// ─── calcCrecimiento (peso 20) ────────────────────────────────────────────────
describe("calcCrecimiento", () => {
  const clienteId = "c1";

  it("retorna 20 cuando el cliente cumple con seguidoresGanados explícito", () => {
    const curr = makeReport({
      crecimiento: { items: [{ clienteId, seguidoresGanados: 150, seguidoresActuales: 1150, meta: 100 }] },
    });
    expect(calcCrecimiento(curr, null)).toBe(20);
  });

  it("retorna 20 cuando todos los clientes cumplen (fallback via prevReport)", () => {
    const prev = makeReport({
      crecimiento: { items: [{ clienteId, seguidoresActuales: 1000, meta: 0 }] },
    });
    const curr = makeReport({
      crecimiento: { items: [{ clienteId, seguidoresGanados: null, seguidoresActuales: 1100, meta: 100 }] },
    });
    expect(calcCrecimiento(curr, prev)).toBe(20);
  });

  it("fallback: usa seguidoresBase manual si no hay mes anterior", () => {
    const curr = makeReport({
      crecimiento: { items: [{ clienteId, seguidoresGanados: null, seguidoresActuales: 1100, seguidoresBase: 1000, meta: 100 }] },
    });
    expect(calcCrecimiento(curr, null)).toBe(20);
  });

  it("retorna 0 si no hay datos de ganados ni base", () => {
    const curr = makeReport({
      crecimiento: { items: [{ clienteId, seguidoresGanados: null, seguidoresActuales: 1100, seguidoresBase: null, meta: 100 }] },
    });
    expect(calcCrecimiento(curr, null)).toBe(0);
  });

  it("retorna 0 cuando no hay items", () => {
    expect(calcCrecimiento(makeReport())).toBe(0);
  });

  it("cuenta solo clientes que alcanzan la meta", () => {
    const curr = makeReport({
      crecimiento: {
        items: [
          { clienteId: "c1", seguidoresGanados: 100, seguidoresActuales: 1100, meta: 100 }, // 100 >= 100 ✓
          { clienteId: "c2", seguidoresGanados: 50,  seguidoresActuales: 2050, meta: 100 }, // 50 < 100 ✗
        ],
      },
    });
    // 1/2 clientes cumplen → (1/2)*20 = 10
    expect(calcCrecimiento(curr, null)).toBe(10);
  });
});

// ─── calcSolicitudes (peso 10) ────────────────────────────────────────────────
describe("calcSolicitudes", () => {
  it("retorna 10 cuando editadas === solicitudes (peso nuevo)", () => {
    const r = makeReport({ solicitudes: { solicitudes: 10, editadas: 10 } });
    expect(calcSolicitudes(r)).toBe(10);
  });

  it("retorna 0 cuando solicitudes === 0", () => {
    const r = makeReport({ solicitudes: { solicitudes: 0, editadas: 5 } });
    expect(calcSolicitudes(r)).toBe(0);
  });

  it("proporciona correctamente editadas < solicitudes", () => {
    const r = makeReport({ solicitudes: { solicitudes: 10, editadas: 5 } });
    expect(calcSolicitudes(r)).toBe(5); // (5/10)*10
  });
});

// ─── calcPautas (peso 20) ─────────────────────────────────────────────────────
describe("calcPautas", () => {
  it("retorna 20 cuando todos los clientes cumplen (peso nuevo)", () => {
    const r = makeReport({
      pautas: { items: [
        { clienteId: "c1", realizadas: 5, meta: 5 },
        { clienteId: "c2", realizadas: 3, meta: 3 },
      ]},
    });
    expect(calcPautas(r)).toBe(20);
  });

  it("retorna 0 cuando no hay items", () => {
    expect(calcPautas(makeReport())).toBe(0);
  });

  it("es proporcional a clientes que cumplen", () => {
    const r = makeReport({
      pautas: { items: [
        { clienteId: "c1", realizadas: 5, meta: 5 }, // cumple
        { clienteId: "c2", realizadas: 2, meta: 5 }, // no cumple
      ]},
    });
    expect(calcPautas(r)).toBe(10); // (1/2)*20
  });
});

// ─── calcPiezas (peso 10) ─────────────────────────────────────────────────────
describe("calcPiezas", () => {
  it("retorna 10 cuando editadas === piezas (peso nuevo)", () => {
    const r = makeReport({ piezas: { piezas: 20, editadas: 20 } });
    expect(calcPiezas(r)).toBe(10);
  });

  it("retorna 0 cuando piezas === 0", () => {
    expect(calcPiezas(makeReport())).toBe(0);
  });

  it("proporciona correctamente editadas < piezas", () => {
    const r = makeReport({ piezas: { piezas: 20, editadas: 10 } });
    expect(calcPiezas(r)).toBe(5); // (10/20)*10
  });
});

// ─── calcTotal + sumScore ─────────────────────────────────────────────────────
describe("calcTotal + sumScore", () => {
  it("calcTotal no incluye la clave feedback", () => {
    const scores = calcTotal(makeReport(), null);
    expect(scores).not.toHaveProperty("feedback");
  });

  it("sumScore con todos los indicadores al máximo es 100", () => {
    const r = makeReport({
      reuniones:     { realizadas: 15, meta: 15 },
      productividad: { tareas: [{ nombre: "T", realizado: 10, meta: 10 }] },
      solicitudes:   { solicitudes: 10, editadas: 10 },
      piezas:        { piezas: 10, editadas: 10 },
      pautas:        { items: [{ clienteId: "c1", realizadas: 5, meta: 5 }] },
      crecimiento:   { items: [{ clienteId: "c1", seguidoresGanados: 100, seguidoresActuales: 1100, meta: 100 }] },
    });
    const scores = calcTotal(r, null);
    expect(sumScore(scores)).toBe(100);
  });

  it("clampea a 100 cuando los ratios se exceden", () => {
    // Todos al doble de la meta → cada indicador da 2× su peso → suma > 100
    const r = makeReport({
      reuniones:     { realizadas: 30, meta: 15 },   // 40 pts
      productividad: { tareas: [{ nombre: "T", realizado: 20, meta: 10 }] }, // 40 pts
      solicitudes:   { solicitudes: 10, editadas: 10 },  // 10 pts
      piezas:        { piezas: 10, editadas: 10 },        // 10 pts
      pautas:        { items: [{ clienteId: "c1", realizadas: 5, meta: 5 }] }, // 20 pts
      crecimiento:   { items: [{ clienteId: "c1", seguidoresGanados: 100, seguidoresActuales: 1100, meta: 100 }] }, // 20 pts
    });
    const scores = calcTotal(r, null);
    // sin clamp: 40+40+20+10+20+10 = 140
    expect(sumScore(scores)).toBe(100);
  });

  it("reporte vacío retorna 0 en todos los indicadores", () => {
    const scores = calcTotal(makeReport(), null);
    expect(sumScore(scores)).toBe(0);
    expect(scores.reuniones).toBe(0);
    expect(scores.productividad).toBe(0);
    expect(scores.crecimiento).toBe(0);
    expect(scores.solicitudes).toBe(0);
    expect(scores.pautas).toBe(0);
    expect(scores.piezas).toBe(0);
  });

  it("el score parcial de cada indicador no supera su peso individual", () => {
    // Indicadores al 100%
    const r = makeReport({
      reuniones:     { realizadas: 15, meta: 15 },
      productividad: { tareas: [{ nombre: "T", realizado: 10, meta: 10 }] },
      solicitudes:   { solicitudes: 10, editadas: 10 },
      piezas:        { piezas: 10, editadas: 10 },
      pautas:        { items: [{ clienteId: "c1", realizadas: 5, meta: 5 }] },
      crecimiento:   { items: [{ clienteId: "c1", seguidoresGanados: 100, seguidoresActuales: 1100, meta: 100 }] },
    });
    const scores = calcTotal(r, null);
    expect(scores.reuniones).toBe(20);
    expect(scores.productividad).toBe(20);
    expect(scores.crecimiento).toBe(20);
    expect(scores.solicitudes).toBe(10);
    expect(scores.pautas).toBe(20);
    expect(scores.piezas).toBe(10);
  });
});

// ─── lastLineScore ────────────────────────────────────────────────────────────
// Helper de reports ya filtrados por line_id (filas crudas de metric_reports).

function makeReportRow(month, dataOverrides = {}, extra = {}) {
  return {
    id: `r-${month}`,
    line_id: 'line-1',
    year: 2026,
    month,
    data: makeReport(dataOverrides),
    ...extra,
  }
}

describe("lastLineScore", () => {
  it("retorna { score: null, month: null } cuando no hay reportes", () => {
    expect(lastLineScore([])).toEqual({ score: null, month: null })
  })

  it("retorna el mes más reciente con datos", () => {
    const reports = [
      makeReportRow(3, { reuniones: { realizadas: 15, meta: 15 } }),
      makeReportRow(5, { reuniones: { realizadas: 15, meta: 15 } }),
    ]
    const { month } = lastLineScore(reports)
    expect(month).toBe(5)
  })

  it("ignora meses marcados como incompleto", () => {
    const reports = [
      makeReportRow(4, { reuniones: { realizadas: 15, meta: 15 } }),
      makeReportRow(5, {}, { data: { ...makeReport(), incompleto: true } }),
    ]
    const { month } = lastLineScore(reports)
    expect(month).toBe(4)
  })

  it("el score es 0 cuando todos los indicadores son 0", () => {
    const reports = [makeReportRow(1)]
    const { score } = lastLineScore(reports)
    expect(score).toBe(0)
  })

  it("el score es 100 cuando todos los indicadores están al máximo", () => {
    const reports = [
      makeReportRow(2, {
        reuniones:     { realizadas: 15, meta: 15 },
        productividad: { tareas: [{ nombre: "T", realizado: 10, meta: 10 }] },
        solicitudes:   { solicitudes: 10, editadas: 10 },
        piezas:        { piezas: 10, editadas: 10 },
        pautas:        { items: [{ clienteId: "c1", realizadas: 5, meta: 5 }] },
        crecimiento:   { items: [{ clienteId: "c1", seguidoresGanados: 100, meta: 100 }] },
      }),
    ]
    const { score } = lastLineScore(reports)
    expect(score).toBe(100)
  })

  it("retorna { score: null, month: null } cuando todos los reportes son incompletos", () => {
    const reports = [
      makeReportRow(1, {}, { data: { ...makeReport(), incompleto: true } }),
      makeReportRow(2, {}, { data: { ...makeReport(), incompleto: true } }),
    ]
    expect(lastLineScore(reports)).toEqual({ score: null, month: null })
  })
});
