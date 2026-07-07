import { describe, it, expect } from "vitest";
import { syncReportClients } from "../utils/syncReportClients";

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

const CLIENTS = [
  { id: "c1", name: "Cliente Uno",  monthly_fee: 500 },
  { id: "c2", name: "Cliente Dos",  monthly_fee: 300 },
];

describe("syncReportClients — crecimiento / pautas / feedback", () => {
  it("agrega clientes nuevos a un reporte vacío", () => {
    const report = makeReport();
    const synced = syncReportClients(report, CLIENTS);

    expect(synced.crecimiento.items).toHaveLength(2);
    expect(synced.pautas.items).toHaveLength(2);
    expect(synced.feedback.items).toHaveLength(2);

    expect(synced.crecimiento.items[0]).toEqual({
      clienteId: "c1",
      seguidoresGanados: null,
      seguidoresGanadosPrev: null,
      seguidoresActuales: null,
      seguidoresBase: null,
      meta: 0,
    });
    expect(synced.pautas.items[0]).toEqual({ clienteId: "c1", realizadas: 0, meta: 0 });
    expect(synced.feedback.items[0]).toEqual({ clienteId: "c1", score: null });
  });

  it("conserva valores existentes de un cliente ya en el reporte", () => {
    const report = makeReport({
      crecimiento: {
        items: [{ clienteId: "c1", seguidoresActuales: 500, seguidoresBase: 400, meta: 100 }],
      },
      pautas: {
        items: [{ clienteId: "c1", realizadas: 3, meta: 5 }],
      },
      feedback: {
        items: [{ clienteId: "c1", score: 8 }],
      },
    });
    const synced = syncReportClients(report, CLIENTS);

    // c1 conservado
    expect(synced.crecimiento.items.find(i => i.clienteId === "c1")).toMatchObject({
      seguidoresActuales: 500,
      seguidoresBase: 400,
      meta: 100,
    });
    expect(synced.pautas.items.find(i => i.clienteId === "c1")).toMatchObject({ realizadas: 3, meta: 5 });
    expect(synced.feedback.items.find(i => i.clienteId === "c1")).toMatchObject({ score: 8 });

    // c2 agregado con defaults
    expect(synced.crecimiento.items.find(i => i.clienteId === "c2")).toMatchObject({ meta: 0 });
  });

  it("descarta items de clientes que ya no están en la línea", () => {
    const report = makeReport({
      crecimiento: {
        items: [
          { clienteId: "c1", seguidoresActuales: 100, seguidoresBase: 0, meta: 50 },
          { clienteId: "cOld", seguidoresActuales: 200, seguidoresBase: 150, meta: 50 },
        ],
      },
      pautas: {
        items: [
          { clienteId: "c1", realizadas: 2, meta: 4 },
          { clienteId: "cOld", realizadas: 1, meta: 3 },
        ],
      },
      feedback: {
        items: [
          { clienteId: "c1", score: 7 },
          { clienteId: "cOld", score: 9 },
        ],
      },
    });
    const synced = syncReportClients(report, CLIENTS); // CLIENTS = [c1, c2], no cOld

    expect(synced.crecimiento.items.map(i => i.clienteId)).not.toContain("cOld");
    expect(synced.pautas.items.map(i => i.clienteId)).not.toContain("cOld");
    expect(synced.feedback.items.map(i => i.clienteId)).not.toContain("cOld");
  });

  it("el orden de items sigue el orden de lineClients", () => {
    const report = makeReport({
      crecimiento: { items: [{ clienteId: "c2", seguidoresActuales: 50, seguidoresBase: 0, meta: 0 }] },
    });
    const synced = syncReportClients(report, CLIENTS);
    expect(synced.crecimiento.items[0].clienteId).toBe("c1");
    expect(synced.crecimiento.items[1].clienteId).toBe("c2");
  });

  it("no muta el objeto original", () => {
    const report = makeReport();
    const reportCopy = JSON.stringify(report);
    syncReportClients(report, CLIENTS);
    expect(JSON.stringify(report)).toBe(reportCopy);
  });

  it("funciona con cartera vacía (devuelve items vacíos)", () => {
    const report = makeReport({
      crecimiento: { items: [{ clienteId: "c1", seguidoresActuales: 100, seguidoresBase: 0, meta: 50 }] },
    });
    const synced = syncReportClients(report, []);
    expect(synced.crecimiento.items).toHaveLength(0);
    expect(synced.pautas.items).toHaveLength(0);
    expect(synced.feedback.items).toHaveLength(0);
  });
});

describe("syncReportClients — ingresos", () => {
  it("siembra ingresos de clientes cuando el reporte no tiene ninguno", () => {
    const report = makeReport();
    const synced = syncReportClients(report, CLIENTS);

    expect(synced.finanzas.ingresos).toHaveLength(2);
    expect(synced.finanzas.ingresos[0]).toMatchObject({
      clienteId: "c1",
      descripcion: "Cliente Uno",
      monto: 500,
    });
    expect(synced.finanzas.ingresos[1]).toMatchObject({
      clienteId: "c2",
      descripcion: "Cliente Dos",
      monto: 300,
    });
  });

  it("preserva el monto ya editado de un cliente existente", () => {
    const report = makeReport({
      finanzas: {
        ingresos: [
          { id: "ing-c1", clienteId: "c1", descripcion: "Cliente Uno", monto: 750 }, // monto editado
        ],
        gastosOperativos: [], sueldos: [], otrosGastos: [],
      },
    });
    const synced = syncReportClients(report, CLIENTS);

    const c1row = synced.finanzas.ingresos.find(i => i.clienteId === "c1");
    expect(c1row.monto).toBe(750); // editado conservado
    const c2row = synced.finanzas.ingresos.find(i => i.clienteId === "c2");
    expect(c2row.monto).toBe(300); // nuevo con monthly_fee
  });

  it("descarta el ingreso de un cliente que salió de la línea", () => {
    const report = makeReport({
      finanzas: {
        ingresos: [
          { id: "ing-c1",   clienteId: "c1",   descripcion: "Cliente Uno", monto: 500 },
          { id: "ing-cOld", clienteId: "cOld", descripcion: "Ex-cliente",  monto: 200 },
        ],
        gastosOperativos: [], sueldos: [], otrosGastos: [],
      },
    });
    const synced = syncReportClients(report, CLIENTS); // CLIENTS = [c1, c2]

    const ids = synced.finanzas.ingresos.map(i => i.clienteId);
    expect(ids).toContain("c1");
    expect(ids).toContain("c2");
    expect(ids).not.toContain("cOld");
  });

  it("conserva las filas manuales (clienteId == null) aunque cambien los clientes", () => {
    const report = makeReport({
      finanzas: {
        ingresos: [
          { id: "m1", clienteId: null, descripcion: "Cobro puntual", monto: 100 },
          { id: "ing-c1", clienteId: "c1", descripcion: "Cliente Uno", monto: 500 },
        ],
        gastosOperativos: [], sueldos: [], otrosGastos: [],
      },
    });
    const synced = syncReportClients(report, CLIENTS);

    const manual = synced.finanzas.ingresos.filter(i => i.clienteId == null);
    expect(manual).toHaveLength(1);
    expect(manual[0].descripcion).toBe("Cobro puntual");
  });

  it("con cartera vacía solo conserva filas manuales", () => {
    const report = makeReport({
      finanzas: {
        ingresos: [
          { id: "m1", clienteId: null, descripcion: "Otro ingreso", monto: 50 },
          { id: "ing-c1", clienteId: "c1", descripcion: "Cliente Uno", monto: 500 },
        ],
        gastosOperativos: [], sueldos: [], otrosGastos: [],
      },
    });
    const synced = syncReportClients(report, []);

    expect(synced.finanzas.ingresos).toHaveLength(1);
    expect(synced.finanzas.ingresos[0].clienteId).toBeNull();
  });

  it("trata monthly_fee nulo o undefined como monto 0 en clientes nuevos", () => {
    const clientsSinFee = [{ id: "cx", name: "Sin Fee" }]; // sin monthly_fee
    const report = makeReport();
    const synced = syncReportClients(report, clientsSinFee);

    expect(synced.finanzas.ingresos[0].monto).toBe(0);
  });
});

// ─── sueldos ────────────────────────────────────────────────────────────────

const EMPLOYEES = [
  { user_id: "u1", first_name: "Juan",  last_name: "Pérez",   monthly_salary: 500 },
  { user_id: "u2", first_name: "María", last_name: "Gómez",   monthly_salary: 450 },
];

describe("syncReportClients — sueldos (auto-generación por empleado)", () => {
  it("siembra sueldos de empleados cuando el reporte no tiene ninguno", () => {
    const report = makeReport();
    const synced = syncReportClients(report, CLIENTS, EMPLOYEES);

    expect(synced.finanzas.sueldos).toHaveLength(2);
    expect(synced.finanzas.sueldos[0]).toMatchObject({
      empleadoId: "u1",
      descripcion: "Juan Pérez",
      monto: 500,
    });
    expect(synced.finanzas.sueldos[1]).toMatchObject({
      empleadoId: "u2",
      descripcion: "María Gómez",
      monto: 450,
    });
  });

  it("preserva el monto ya editado de un empleado existente", () => {
    const report = makeReport({
      finanzas: {
        ingresos: [],
        gastosOperativos: [],
        sueldos: [
          { id: "sue-u1", empleadoId: "u1", descripcion: "Juan Pérez", monto: 750 }, // editado
        ],
        otrosGastos: [],
      },
    });
    const synced = syncReportClients(report, CLIENTS, EMPLOYEES);

    const u1row = synced.finanzas.sueldos.find(i => i.empleadoId === "u1");
    expect(u1row.monto).toBe(750); // editado conservado
    const u2row = synced.finanzas.sueldos.find(i => i.empleadoId === "u2");
    expect(u2row.monto).toBe(450); // nuevo con monthly_salary
  });

  it("descarta el sueldo de un empleado que salió del team", () => {
    const report = makeReport({
      finanzas: {
        ingresos: [],
        gastosOperativos: [],
        sueldos: [
          { id: "sue-u1",   empleadoId: "u1",   descripcion: "Juan Pérez", monto: 500 },
          { id: "sue-uOld", empleadoId: "uOld", descripcion: "Ex-empleado", monto: 300 },
        ],
        otrosGastos: [],
      },
    });
    const synced = syncReportClients(report, CLIENTS, EMPLOYEES); // EMPLOYEES = [u1, u2]

    const ids = synced.finanzas.sueldos.map(i => i.empleadoId);
    expect(ids).toContain("u1");
    expect(ids).toContain("u2");
    expect(ids).not.toContain("uOld");
  });

  it("conserva las filas manuales (empleadoId == null) aunque cambie el team", () => {
    const report = makeReport({
      finanzas: {
        ingresos: [],
        gastosOperativos: [],
        sueldos: [
          { id: "m1", empleadoId: null, descripcion: "Pago extra", monto: 100 },
          { id: "sue-u1", empleadoId: "u1", descripcion: "Juan Pérez", monto: 500 },
        ],
        otrosGastos: [],
      },
    });
    const synced = syncReportClients(report, CLIENTS, EMPLOYEES);

    const manual = synced.finanzas.sueldos.filter(i => i.empleadoId == null);
    expect(manual).toHaveLength(1);
    expect(manual[0].descripcion).toBe("Pago extra");
  });

  it("trata monthly_salary nulo como monto 0 en empleados nuevos", () => {
    const empSinSueldo = [{ user_id: "ux", first_name: "Sin", last_name: "Sueldo" }];
    const report = makeReport();
    const synced = syncReportClients(report, CLIENTS, empSinSueldo);

    expect(synced.finanzas.sueldos[0].monto).toBe(0);
  });

  it("retro-compatibilidad: llamada con 2 args no siembra sueldos si el reporte no tiene ninguno", () => {
    const report = makeReport();
    const synced = syncReportClients(report, CLIENTS);

    // Sin employees y sin filas previas, los sueldos quedan vacíos
    const empRows = synced.finanzas.sueldos.filter(i => i.empleadoId != null);
    expect(empRows).toHaveLength(0);
  });

  // Regresión: bug donde OperacionesView omitía el argumento lineEmployees y al guardar
  // se borraban todos los sueldos del team (solo sobrevivía la fila manual).
  it("blindaje: llamada sin lineEmployees conserva filas de empleado ya existentes", () => {
    const report = makeReport({
      finanzas: {
        ingresos: [],
        gastosOperativos: [],
        sueldos: [
          { id: "sue-u1", empleadoId: "u1", descripcion: "Juan Pérez",   monto: 750 },
          { id: "sue-u2", empleadoId: "u2", descripcion: "María Gómez",  monto: 600 },
          { id: "m1",     empleadoId: null,  descripcion: "Liz Luzardo", monto: 400 },
        ],
        otrosGastos: [],
      },
    });
    // Llamada de 2 argumentos (sin lineEmployees): simula el bug de OperacionesView
    const synced = syncReportClients(report, CLIENTS);

    // Las filas de empleado se conservan intactas (blindaje activado)
    const empRows = synced.finanzas.sueldos.filter(i => i.empleadoId != null);
    expect(empRows).toHaveLength(2);
    expect(empRows.find(r => r.empleadoId === "u1").monto).toBe(750);
    expect(empRows.find(r => r.empleadoId === "u2").monto).toBe(600);

    // La fila manual (Liz Luzardo) también se conserva
    const manualRows = synced.finanzas.sueldos.filter(i => i.empleadoId == null);
    expect(manualRows).toHaveLength(1);
    expect(manualRows[0].monto).toBe(400);
  });

  it("con team vacío solo conserva filas manuales de sueldos", () => {
    const report = makeReport({
      finanzas: {
        ingresos: [],
        gastosOperativos: [],
        sueldos: [
          { id: "m1", empleadoId: null, descripcion: "Gasto extra", monto: 50 },
          { id: "sue-u1", empleadoId: "u1", descripcion: "Juan Pérez", monto: 500 },
        ],
        otrosGastos: [],
      },
    });
    const synced = syncReportClients(report, CLIENTS, []);

    expect(synced.finanzas.sueldos).toHaveLength(1);
    expect(synced.finanzas.sueldos[0].empleadoId).toBeNull();
  });
});
