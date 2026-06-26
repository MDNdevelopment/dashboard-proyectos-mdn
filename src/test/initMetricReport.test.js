import { describe, it, expect } from "vitest";
import { initMetricReport } from "../utils/initMetricReport";
import { DEFAULT_SUBTAREAS } from "../components/metricas/constants";

const CLIENTS = [
  { id: "c1", name: "Cliente A" },
  { id: "c2", name: "Cliente B" },
];

function makePrevReport(overrides = {}) {
  return {
    reuniones:     { realizadas: 15, meta: 20 },
    productividad: { tareas: [{ nombre: "Métricas", realizado: 10, meta: 15 }] },
    crecimiento:   { items: [{ clienteId: "c1", seguidoresActuales: 1000, meta: 50 }] },
    solicitudes:   { solicitudes: 10, editadas: 8 },
    pautas:        { items: [{ clienteId: "c1", realizadas: 5, meta: 5 }] },
    piezas:        { piezas: 20, editadas: 18 },
    feedback:      { items: [{ clienteId: "c1", score: 8 }] },
    finanzas: {
      ingresos:         [{ id: "i1", descripcion: "Ing A", monto: 1000 }],
      gastosOperativos: [],
      sueldos:          [{ id: "s1", descripcion: "Juan", monto: 500 }],
      otrosGastos:      [],
    },
    ...overrides,
  };
}

describe("initMetricReport — sin mes anterior", () => {
  it("usa DEFAULT_SUBTAREAS cuando no hay prevReport", () => {
    const r = initMetricReport(null, CLIENTS);
    expect(r.productividad.tareas).toHaveLength(DEFAULT_SUBTAREAS.length);
    expect(r.productividad.tareas[0].nombre).toBe(DEFAULT_SUBTAREAS[0].nombre);
    expect(r.productividad.tareas[0].realizado).toBe(0);
  });

  it("inicializa items de indicadores a partir de lineClients", () => {
    const r = initMetricReport(null, CLIENTS);
    expect(r.crecimiento.items).toHaveLength(2);
    expect(r.crecimiento.items[0].clienteId).toBe("c1");
    expect(r.crecimiento.items[0].seguidoresActuales).toBeNull();
    expect(r.pautas.items).toHaveLength(2);
    expect(r.feedback.items).toHaveLength(2);
    expect(r.feedback.items[0].score).toBeNull();
  });

  it("retorna meta de reuniones en 15 por defecto", () => {
    const r = initMetricReport(null, []);
    expect(r.reuniones.meta).toBe(15);
    expect(r.reuniones.realizadas).toBe(0);
  });

  it("inicializa finanzas vacías", () => {
    const r = initMetricReport(null, []);
    expect(r.finanzas.ingresos).toEqual([]);
    expect(r.finanzas.sueldos).toEqual([]);
  });
});

describe("initMetricReport — con mes anterior (carry-forward)", () => {
  it("hereda la meta de reuniones del mes anterior", () => {
    const r = initMetricReport(makePrevReport(), []);
    expect(r.reuniones.meta).toBe(20); // heredada
    expect(r.reuniones.realizadas).toBe(0); // reseteada
  });

  it("resetea los valores pero conserva las metas de tareas", () => {
    const r = initMetricReport(makePrevReport(), []);
    expect(r.productividad.tareas[0].nombre).toBe("Métricas");
    expect(r.productividad.tareas[0].meta).toBe(15);
    expect(r.productividad.tareas[0].realizado).toBe(0); // reseteado
  });

  it("resetea seguidores pero conserva clientes y metas de crecimiento", () => {
    const r = initMetricReport(makePrevReport(), []);
    expect(r.crecimiento.items[0].clienteId).toBe("c1");
    expect(r.crecimiento.items[0].meta).toBe(50); // heredada
    expect(r.crecimiento.items[0].seguidoresActuales).toBeNull(); // reseteada
    expect(r.crecimiento.items[0].seguidoresBase).toBeNull();
  });

  it("resetea realizadas en pautas pero conserva metas", () => {
    const r = initMetricReport(makePrevReport(), []);
    expect(r.pautas.items[0].realizadas).toBe(0);
    expect(r.pautas.items[0].meta).toBe(5);
  });

  it("resetea scores de feedback", () => {
    const r = initMetricReport(makePrevReport(), []);
    expect(r.feedback.items[0].score).toBeNull();
  });

  it("resetea solicitudes y piezas a 0", () => {
    const r = initMetricReport(makePrevReport(), []);
    expect(r.solicitudes.solicitudes).toBe(0);
    expect(r.solicitudes.editadas).toBe(0);
    expect(r.piezas.piezas).toBe(0);
    expect(r.piezas.editadas).toBe(0);
  });

  it("hereda las finanzas del mes anterior con sus montos", () => {
    const r = initMetricReport(makePrevReport(), []);
    expect(r.finanzas.ingresos).toHaveLength(1);
    expect(r.finanzas.ingresos[0].monto).toBe(1000);
    expect(r.finanzas.sueldos[0].monto).toBe(500);
  });

  it("no muta el reporte previo (copia profunda)", () => {
    const prev = makePrevReport();
    const r = initMetricReport(prev, []);
    r.finanzas.ingresos[0].monto = 9999;
    expect(prev.finanzas.ingresos[0].monto).toBe(1000); // sin mutar
  });
});
