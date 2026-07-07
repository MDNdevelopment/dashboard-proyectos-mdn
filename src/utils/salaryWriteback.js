/**
 * Calcula qué sueldos de un reporte deben escribirse de vuelta a users.monthly_salary.
 *
 * Reglas:
 *  - Solo filas de empleado (empleadoId != null).
 *  - Solo montos > 0 (nunca sobrescribir el maestro con 0 o vacío).
 *  - Solo si el monto del reporte difiere del sueldo maestro actual del empleado.
 *
 * @param {Array} sueldos       - report.finanzas.sueldos (filas del reporte).
 * @param {Array} lineEmployees - Empleados del team cargados en memoria (con monthly_salary).
 * @returns {Array<{ user_id: string, monto: number }>}
 */
export function pickSalaryUpdates(sueldos, lineEmployees) {
  return (sueldos ?? [])
    .filter(s => s.empleadoId != null && Number(s.monto) > 0)
    .map(s => ({ user_id: s.empleadoId, monto: Number(s.monto) }))
    .filter(u => {
      const emp = lineEmployees.find(e => e.user_id === u.user_id);
      return Number(emp?.monthly_salary ?? 0) !== u.monto;
    });
}
