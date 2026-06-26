/**
 * Utilidades puras para filtrar usuarios por pertenencia a una línea/team.
 * Complementa lineMembers.js (que opera sobre el array de la línea);
 * este módulo opera sobre la lista de usuarios.
 */

/**
 * Devuelve los usuarios que son miembros del team dado.
 * Si se indica `currentUserId`, ese usuario se incluye siempre aunque no sea miembro
 * (evita romper ediciones de tareas con responsable de otra línea).
 *
 * @param {Array}       users         - Lista de usuarios con user_id
 * @param {object|null} team          - Línea/team con member_user_ids: string[] (o null)
 * @param {string|null} [currentUserId] - user_id actualmente seleccionado (opcional)
 * @returns {Array} Usuarios filtrados
 */
export function teamMemberUsers(users, team, currentUserId = null) {
  const memberIds = team?.member_user_ids ?? []
  return users.filter(
    u => memberIds.includes(u.user_id) || (currentUserId != null && u.user_id === currentUserId),
  )
}
