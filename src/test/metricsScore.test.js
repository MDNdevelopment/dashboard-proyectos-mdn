import { describe, it, expect } from "vitest";
import {
  calcReuniones, calcProductividad, calcCrecimiento,
  calcSolicitudes, calcPautas, calcPiezas, calcFeedback,
  calcTotal, sumScore, crecimientoCliente,
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
    feedback:      { items: [] },
    finanzas:      { ingresos: [], gastosOperativos: [], sueldos: [], otrosGastos: [] },
    ...overrides,
  };
}

// ─── pesos ────────────────────────────────────────────────────────────────────
describe("INDICATORS weights", () => {
  it("Los pesos de los 7 indicadores suman 100", () => {
    const total = INDICATORS.reduce((acc, ind) => acc + ind.peso, 0);
    expect(total).toBe(100);
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

// ─── calcProductividad ────────────────────────────────────────────────────────
describe("calcProductividad", () => {
  it("retorna 15 cuando se cumplen todas las tareas", () => {
    const r = makeReport({
      productividad: {
        tareas: [
          { nombre: "A", realizado: 15, meta: 15 },
          { nombre: "B", realizado: 41, meta: 41 },
        ],
      },
    });
    expect(calcProductividad(r)).toBe(15);
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
    // (15/30)*15 = 7.5
    expect(calcProductividad(r)).toBe(7.5);
  });
});

// ─── crecimientoCliente ───────────────────────────────────────────────────────
describe("crecimientoCliente", () => {
  it("cumple cuando (actuales − base) >= meta, usando seguidoresBase", () => {
    const item = { clienteId: "c1", seguidoresActuales: 1100, seguidoresBase: 1000, meta: 100 };
    const res = crecimientoCliente(item, null);
    expect(res.crecimiento).toBe(100);
    expect(res.cumple).toBe(true);
  });

  it("no cumple cuando (actuales − base) < meta", () => {
    const item = { clienteId: "c1", seguidoresActuales: 1050, seguidoresBase: 1000, meta: 100 };
    const res = crecimientoCliente(item, null);
    expect(res.crecimiento).toBe(50);
    expect(res.cumple).toBe(false);
  });

  it("cumple exacto en el límite (crec === meta)", () => {
    const item = { clienteId: "c1", seguidoresActuales: 1100, seguidoresBase: 1000, meta: 100 };
    const res = crecimientoCliente(item, null);
    expect(res.cumple).toBe(true);
  });

  it("retorna cumple: null cuando falta seguidoresActuales", () => {
    const item = { clienteId: "c1", seguidoresActuales: null, seguidoresBase: 1000, meta: 100 };
    const res = crecimientoCliente(item, null);
    expect(res.crecimiento).toBeNull();
    expect(res.cumple).toBeNull();
  });

  it("retorna cumple: null cuando falta base (sin seguidoresBase ni prevReport)", () => {
    const item = { clienteId: "c1", seguidoresActuales: 1100, seguidoresBase: null, meta: 100 };
    const res = crecimientoCliente(item, null);
    expect(res.crecimiento).toBeNull();
    expect(res.cumple).toBeNull();
  });

  it("toma la base del mes anterior (seguidoresActuales de prevReport) en lugar de seguidoresBase", () => {
    const prevReport = {
      crecimiento: { items: [{ clienteId: "c1", seguidoresActuales: 900 }] },
    };
    const item = { clienteId: "c1", seguidoresActuales: 1050, seguidoresBase: 1000, meta: 100 };
    const res = crecimientoCliente(item, prevReport);
    // base = 900 (mes anterior), no 1000 (manual); crec = 150 >= 100 → cumple
    expect(res.crecimiento).toBe(150);
    expect(res.cumple).toBe(true);
  });

  it("cae a seguidoresBase si el prevReport no tiene el cliente", () => {
    const prevReport = {
      crecimiento: { items: [{ clienteId: "c2", seguidoresActuales: 900 }] },
    };
    const item = { clienteId: "c1", seguidoresActuales: 1050, seguidoresBase: 1000, meta: 100 };
    const res = crecimientoCliente(item, prevReport);
    // prevReport no tiene c1 → base = 1000; crec = 50 < 100 → no cumple
    expect(res.crecimiento).toBe(50);
    expect(res.cumple).toBe(false);
  });
});

// ─── calcCrecimiento ──────────────────────────────────────────────────────────
describe("calcCrecimiento", () => {
  const clienteId = "c1";

  it("retorna 15 cuando todos los clientes cumplen la meta (con mes anterior)", () => {
    const prev = makeReport({
      crecimiento: { items: [{ clienteId, seguidoresActuales: 1000, meta: 0 }] },
    });
    const curr = makeReport({
      crecimiento: { items: [{ clienteId, seguidoresActuales: 1100, meta: 100 }] },
    });
    expect(calcCrecimiento(curr, prev)).toBe(15);
  });

  it("usa seguidoresBase manual si no hay mes anterior", () => {
    const curr = makeReport({
      crecimiento: { items: [{ clienteId, seguidoresActuales: 1100, seguidoresBase: 1000, meta: 100 }] },
    });
    expect(calcCrecimiento(curr, null)).toBe(15);
  });

  it("retorna 0 si no hay datos de base", () => {
    const curr = makeReport({
      crecimiento: { items: [{ clienteId, seguidoresActuales: 1100, seguidoresBase: null, meta: 100 }] },
    });
    expect(calcCrecimiento(curr, null)).toBe(0);
  });

  it("retorna 0 cuando no hay items", () => {
    expect(calcCrecimiento(makeReport())).toBe(0);
  });

  it("cuenta solo clientes que alcanzan la meta", () => {
    const prev = makeReport({
      crecimiento: {
        items: [
          { clienteId: "c1", seguidoresActuales: 1000, meta: 0 },
          { clienteId: "c2", seguidoresActuales: 2000, meta: 0 },
        ],
      },
    });
    const curr = makeReport({
      crecimiento: {
        items: [
          { clienteId: "c1", seguidoresActuales: 1100, meta: 100 }, // +100 >= 100 ✓
          { clienteId: "c2", seguidoresActuales: 2050, meta: 100 }, // +50 < 100 ✗
        ],
      },
    });
    // 1/2 clientes cumplen → (1/2)*15 = 7.5
    expect(calcCrecimiento(curr, prev)).toBe(7.5);
  });
});

// ─── calcSolicitudes ──────────────────────────────────────────────────────────
describe("calcSolicitudes", () => {
  it("retorna 15 cuando editadas === solicitudes", () => {
    const r = makeReport({ solicitudes: { solicitudes: 10, editadas: 10 } });
    expect(calcSolicitudes(r)).toBe(15);
  });

  it("retorna 0 cuando solicitudes === 0", () => {
    const r = makeReport({ solicitudes: { solicitudes: 0, editadas: 5 } });
    expect(calcSolicitudes(r)).toBe(0);
  });
});

// ─── calcPautas ───────────────────────────────────────────────────────────────
describe("calcPautas", () => {
  it("retorna 10 cuando todos los clientes cumplen", () => {
    const r = makeReport({
      pautas: { items: [
        { clienteId: "c1", realizadas: 5, meta: 5 },
        { clienteId: "c2", realizadas: 3, meta: 3 },
      ]},
    });
    expect(calcPautas(r)).toBe(10);
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
    expect(calcPautas(r)).toBe(5); // (1/2)*10
  });
});

// ─── calcPiezas ───────────────────────────────────────────────────────────────
describe("calcPiezas", () => {
  it("retorna 15 cuando editadas === piezas", () => {
    const r = makeReport({ piezas: { piezas: 20, editadas: 20 } });
    expect(calcPiezas(r)).toBe(15);
  });

  it("retorna 0 cuando piezas === 0", () => {
    expect(calcPiezas(makeReport())).toBe(0);
  });
});

// ─── calcFeedback ─────────────────────────────────────────────────────────────
describe("calcFeedback", () => {
  it("retorna 10 cuando todos los scores son 10", () => {
    const r = makeReport({
      feedback: { items: [
        { clienteId: "c1", score: 10 },
        { clienteId: "c2", score: 10 },
      ]},
    });
    expect(calcFeedback(r)).toBe(10);
  });

  it("retorna 0 cuando no hay scores", () => {
    expect(calcFeedback(makeReport())).toBe(0);
  });

  it("ignora items sin score (null)", () => {
    const r = makeReport({
      feedback: { items: [
        { clienteId: "c1", score: 10 },
        { clienteId: "c2", score: null }, // ignorado
      ]},
    });
    expect(calcFeedback(r)).toBe(10);
  });

  it("promedia los scores disponibles", () => {
    const r = makeReport({
      feedback: { items: [
        { clienteId: "c1", score: 8 },
        { clienteId: "c2", score: 6 },
      ]},
    });
    // avg = 7, (7/10)*10 = 7
    expect(calcFeedback(r)).toBe(7);
  });
});

// ─── calcTotal + sumScore ─────────────────────────────────────────────────────
describe("calcTotal + sumScore", () => {
  it("clampea a 100 cuando los indicadores de ratio se exceden", () => {
    // Reuniones: realizadas (30) > meta (15) → calcReuniones devuelve 40 (2×20)
    const r = makeReport({
      reuniones:     { realizadas: 30, meta: 15 },
      productividad: { tareas: [{ nombre: "T", realizado: 20, meta: 10 }] }, // 2×15
      solicitudes:   { solicitudes: 10, editadas: 10 },
      piezas:        { piezas: 10, editadas: 10 },
      feedback:      { items: [{ clienteId: "c1", score: 10 }] },
      pautas:        { items: [{ clienteId: "c1", realizadas: 5, meta: 5 }] },
      crecimiento:   { items: [{ clienteId: "c1", seguidoresActuales: 1100, seguidoresBase: 1000, meta: 100 }] },
    });
    const scores = calcTotal(r, null);
    // sumScore sin clamp sería 40+30+15+15+10+15+10 = 135
    expect(sumScore(scores)).toBe(100);
  });

  it("todos los indicadores en su máximo suman 100", () => {
    const r = makeReport({
      reuniones:     { realizadas: 15, meta: 15 },
      productividad: { tareas: [{ nombre: "T", realizado: 10, meta: 10 }] },
      solicitudes:   { solicitudes: 10, editadas: 10 },
      piezas:        { piezas: 10, editadas: 10 },
      feedback:      { items: [{ clienteId: "c1", score: 10 }] },
      pautas:        { items: [{ clienteId: "c1", realizadas: 5, meta: 5 }] },
      crecimiento:   { items: [{ clienteId: "c1", seguidoresActuales: 1100, seguidoresBase: 1000, meta: 100 }] },
    });
    const scores = calcTotal(r, null);
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
    expect(scores.feedback).toBe(0);
  });
});
