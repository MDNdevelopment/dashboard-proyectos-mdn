/**
 * Utilidades puras para gestionar la relación empleado↔línea.
 * member_user_ids se reconstruye desde metric_line_members al cargar líneas.
 * Mover un empleado = quitar su id de la línea anterior, añadirlo a la nueva.
 */

/**
 * Devuelve la línea que contiene a un empleado, o null si no está en ninguna.
 * @param {Array} lines - Array de líneas con member_user_ids: string[]
 * @param {string} userId
 * @returns {object|null}
 */
export function lineOfMember(lines, userId) {
  return lines.find(l => (l.member_user_ids ?? []).includes(userId)) ?? null
}

/**
 * Asigna un empleado a una línea, moviéndolo desde su línea actual si corresponde.
 * Devuelve un array de { line, changed } donde changed=true indica que esa línea fue modificada.
 * Las líneas no modificadas siguen en el resultado para facilitar el reemplazo de estado.
 *
 * @param {Array} lines  - Estado actual de todas las líneas
 * @param {string} lineId - Id de la línea destino
 * @param {string} userId - Id del empleado a mover
 * @returns {{ updated: Array, changedIds: string[] }}
 */
export function assignMemberToLine(lines, lineId, userId) {
  const changedIds = []
  const updated = lines.map(line => {
    const members = line.member_user_ids ?? []
    const hasMember = members.includes(userId)
    const isTarget = line.id === lineId

    if (isTarget && !hasMember) {
      // Añadir a la línea destino
      changedIds.push(line.id)
      return { ...line, member_user_ids: [...members, userId] }
    }
    if (!isTarget && hasMember) {
      // Quitar de cualquier otra línea — el liderazgo no viaja con el traslado
      // (en la BD la fila con is_lead se borra al quitarla de la línea anterior).
      changedIds.push(line.id)
      return {
        ...line,
        member_user_ids: members.filter(id => id !== userId),
        lead_user_id: line.lead_user_id === userId ? null : line.lead_user_id,
      }
    }
    return line
  })
  return { updated, changedIds }
}

/**
 * Filtra las líneas visibles para un usuario según su nivel de acceso.
 * - Nivel 4+ o admin: ve todas las líneas.
 * - tasks_view_all=true: ve todas las líneas (bypass por usuario, sin cambiar nivel).
 * - Nivel 1-3 sin flag: ve solo las líneas donde está en member_user_ids.
 *
 * @param {Array} lines - Todas las líneas cargadas de metric_lines
 * @param {object|null} userProfile - Perfil del usuario (de useAuth)
 * @returns {Array}
 */
export function visibleLinesForUser(lines, userProfile) {
  if (!lines) return []
  const viewAll = userProfile?.access_level >= 4
    || userProfile?.admin === true
    || userProfile?.tasks_view_all === true
  if (viewAll) return lines
  const uid = userProfile?.user_id
  if (!uid) return []
  return lines.filter(l => (l.member_user_ids ?? []).includes(uid))
}

/**
 * Quita un empleado de una línea específica.
 * @param {Array} lines
 * @param {string} lineId
 * @param {string} userId
 * @returns {{ updated: Array, changedIds: string[] }}
 */
export function removeMemberFromLine(lines, lineId, userId) {
  const changedIds = []
  const updated = lines.map(line => {
    if (line.id !== lineId) return line
    const members = line.member_user_ids ?? []
    if (!members.includes(userId)) return line
    changedIds.push(line.id)
    return {
      ...line,
      member_user_ids: members.filter(id => id !== userId),
      lead_user_id: line.lead_user_id === userId ? null : line.lead_user_id,
    }
  })
  return { updated, changedIds }
}
