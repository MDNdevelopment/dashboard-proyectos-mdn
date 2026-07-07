import { describe, it, expect } from "vitest";
import { pickSalaryUpdates } from "../utils/salaryWriteback";

const EMPLOYEES = [
  { user_id: "u1", first_name: "Jaidana", last_name: "Tineo",  monthly_salary: 0   },
  { user_id: "u2", first_name: "María",   last_name: "Gómez",  monthly_salary: 200 },
  { user_id: "u3", first_name: "Luis",    last_name: "Pérez",  monthly_salary: 300 },
];

describe("pickSalaryUpdates", () => {
  it("incluye empleado con maestro=0 y reporte>0 (caso Jaidana)", () => {
    const sueldos = [
      { id: "sue-u1", empleadoId: "u1", descripcion: "Jaidana Tineo", monto: 200 },
    ];
    const result = pickSalaryUpdates(sueldos, EMPLOYEES);
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({ user_id: "u1", monto: 200 });
  });

  it("excluye empleado cuando el reporte coincide con el maestro (sin cambio)", () => {
    const sueldos = [
      { id: "sue-u2", empleadoId: "u2", descripcion: "María Gómez", monto: 200 },
    ];
    const result = pickSalaryUpdates(sueldos, EMPLOYEES);
    expect(result).toHaveLength(0);
  });

  it("incluye empleado cuando el reporte difiere del maestro (ej. aumento)", () => {
    const sueldos = [
      { id: "sue-u3", empleadoId: "u3", descripcion: "Luis Pérez", monto: 350 },
    ];
    const result = pickSalaryUpdates(sueldos, EMPLOYEES);
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({ user_id: "u3", monto: 350 });
  });

  it("excluye filas manuales (empleadoId == null)", () => {
    const sueldos = [
      { id: "m1", empleadoId: null, descripcion: "Liz Luzardo", monto: 500 },
      { id: "sue-u1", empleadoId: "u1", descripcion: "Jaidana Tineo", monto: 200 },
    ];
    const result = pickSalaryUpdates(sueldos, EMPLOYEES);
    expect(result.every(r => r.user_id != null)).toBe(true);
    expect(result).toHaveLength(1);
  });

  it("excluye filas con monto = 0 o null (no sobrescribir maestro con 0)", () => {
    const sueldos = [
      { id: "sue-u1", empleadoId: "u1", descripcion: "Jaidana Tineo", monto: 0    },
      { id: "sue-u2", empleadoId: "u2", descripcion: "María Gómez",   monto: null },
    ];
    const result = pickSalaryUpdates(sueldos, EMPLOYEES);
    expect(result).toHaveLength(0);
  });

  it("mezcla: solo devuelve los que cumplen todas las condiciones", () => {
    const sueldos = [
      { id: "sue-u1", empleadoId: "u1", descripcion: "Jaidana Tineo", monto: 200 }, // incluir (maestro=0)
      { id: "sue-u2", empleadoId: "u2", descripcion: "María Gómez",   monto: 200 }, // excluir (sin cambio)
      { id: "sue-u3", empleadoId: "u3", descripcion: "Luis Pérez",    monto: 0   }, // excluir (monto=0)
      { id: "m1",     empleadoId: null, descripcion: "Liz Luzardo",   monto: 500 }, // excluir (manual)
    ];
    const result = pickSalaryUpdates(sueldos, EMPLOYEES);
    expect(result).toHaveLength(1);
    expect(result[0].user_id).toBe("u1");
  });

  it("retorna array vacío cuando sueldos es undefined o vacío", () => {
    expect(pickSalaryUpdates(undefined, EMPLOYEES)).toHaveLength(0);
    expect(pickSalaryUpdates([], EMPLOYEES)).toHaveLength(0);
  });

  it("empleado no encontrado en lineEmployees → lo incluye (maestro se asume 0)", () => {
    // Empleado en el reporte pero no en lineEmployees (edge case: team cambió)
    const sueldos = [
      { id: "sue-u9", empleadoId: "u9", descripcion: "Nuevo", monto: 150 },
    ];
    const result = pickSalaryUpdates(sueldos, EMPLOYEES);
    // maestro = undefined → Number(undefined ?? 0) = 0 → difiere de 150 → incluir
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({ user_id: "u9", monto: 150 });
  });
});
