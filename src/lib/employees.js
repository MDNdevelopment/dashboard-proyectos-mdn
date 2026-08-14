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

/**
 * Decide qué hacer al crear un empleado según la fila existente en `users`
 * encontrada por email (o su ausencia).
 * `existing` = fila { deleted_at } encontrada por email, o null/undefined si no hay.
 * Devuelve: 'new' (no hay fila, se puede crear) | 'active-duplicate' (email ya
 * pertenece a un empleado activo) | 'archived' (email pertenece a un empleado
 * archivado; debe restaurarse, no recrearse).
 */
export function classifyEmployeeCreation(existing) {
  if (!existing) return 'new'
  return existing.deleted_at ? 'archived' : 'active-duplicate'
}
