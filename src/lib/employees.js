/**
 * Filtra empleados archivados (soft delete: users.deleted_at).
 * Usar en puntos de SELECCIÓN (pickers, formularios de asignación) y CONTEO
 * (KPIs, dashboards). NO usar en los loaders de datos: un empleado archivado
 * debe seguir resolviendo su nombre en registros históricos (tareas, reuniones,
 * evaluaciones, reportes) que lo referencian por user_id.
 */
export function activeEmployees(list = []) {
  return list.filter((e) => !e.deleted_at)
}
