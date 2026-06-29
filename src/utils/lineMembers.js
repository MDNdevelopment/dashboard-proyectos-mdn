/**
 * Utilidades puras para gestionar la relación empleado↔línea.
 * member_user_ids es un array jsonb en metric_lines: [user_id, ...]
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
      // Quitar de cualquier otra línea
      changedIds.push(line.id)
      return { ...line, member_user_ids: members.filter(id => id !== userId) }
    }
    return line
  })
  return { updated, changedIds }
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
    return { ...line, member_user_ids: members.filter(id => id !== userId) }
  })
  return { updated, changedIds }
}
