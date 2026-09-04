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
    (u) => memberIds.includes(u.user_id) || (currentUserId != null && u.user_id === currentUserId),
  )
}

/**
 * Ids de los empleados "transversales": no pertenecen a ninguna línea real
 * (todas las líneas con is_general=false). Es la misma regla que usa la línea
 * "Independientes" derivada (ver withDerivedGeneralMembers en lineMembers.js),
 * extraída aquí para poder reutilizarla también en los selectores de asignable.
 *
 * IMPORTANTE: `allLines` debe ser la lista COMPLETA de líneas de la empresa, no
 * solo las visibles para el usuario actual — si no, cualquier miembro de una línea
 * que el usuario no ve parecería "sin línea" y se colaría en el pool.
 *
 * @param {Array} users    - Empleados de la empresa (con user_id, deleted_at)
 * @param {Array} allLines - TODAS las líneas de la empresa (no solo las visibles)
 * @returns {string[]} user_ids sin línea real asignada
 */
export function crossLineUserIds(users, allLines) {
  const assignedIds = new Set(
    (allLines ?? []).filter((l) => !l.is_general).flatMap((l) => l.member_user_ids ?? []),
  )
  return (users ?? [])
    .filter((u) => !u.deleted_at && !assignedIds.has(u.user_id))
    .map((u) => u.user_id)
}

/**
 * Usuarios asignables en una línea para selectores (responsable de tarea/CNP,
 * diseñador de cliente, etc.): los miembros de esa línea + el pool transversal
 * de empleados sin línea ("Independientes"), que puede ser asignado en cualquier línea.
 *
 * Devuelve los dos grupos por separado para que la UI pueda mostrarlos en secciones
 * distintas (p. ej. un separador "Independientes") en vez de mezclarlos sin más.
 *
 * @param {Array}       users         - Lista de usuarios con user_id
 * @param {object|null} team          - Línea/team con member_user_ids: string[] (o null)
 * @param {Array}       allLines      - TODAS las líneas de la empresa (ver crossLineUserIds)
 * @param {string|null} [currentUserId] - user_id actualmente seleccionado (opcional);
 *   se incluye siempre aunque no sea miembro ni parte del pool, para no romper
 *   ediciones de asignaciones históricas de otra línea.
 * @returns {{ members: Array, crossLine: Array }}
 */
export function assignableUsers(users, team, allLines, currentUserId = null) {
  const memberIds = new Set(team?.member_user_ids ?? [])
  const crossIds = new Set(crossLineUserIds(users, allLines))

  const members = users.filter((u) => memberIds.has(u.user_id))
  const crossLine = users.filter((u) => crossIds.has(u.user_id) && !memberIds.has(u.user_id))

  if (currentUserId != null && !memberIds.has(currentUserId) && !crossIds.has(currentUserId)) {
    const extra = users.find((u) => u.user_id === currentUserId)
    if (extra) members.push(extra)
  }

  return { members, crossLine }
}

/**
 * Aplana el resultado de assignableUsers en una sola lista para pasar a pickers que no
 * soportan grupos (UserPickerSingle/Multi ordenan alfabéticamente y no agrupan). A los
 * usuarios del pool transversal se les anota el puesto con el sufijo "Independiente" (o
 * "Alta gerencia" para access_level >= 4, ver withDerivedGeneralMembers en lineMembers.js)
 * para que se distingan en la lista aunque queden intercalados con los miembros de la línea.
 *
 * @param {{ members: Array, crossLine: Array }} assignable - resultado de assignableUsers
 * @returns {Array}
 */
export function flattenAssignable({ members, crossLine }) {
  const taggedCrossLine = crossLine.map((u) => {
    const tag = (u.access_level ?? 0) >= 4 ? 'Alta gerencia' : 'Independiente'
    return {
      ...u,
      position: u.position?.position_name
        ? { ...u.position, position_name: `${u.position.position_name} · ${tag}` }
        : { position_name: tag },
    }
  })
  return [...members, ...taggedCrossLine]
}

/**
 * Devuelve las tareas cuyo team_id pertenece a alguna de las líneas visibles.
 * Usado por las vistas de Tareas (Base, Stand-up) en modo "Todos",
 * para combinar todas las líneas que el usuario puede ver sin incluir tareas
 * de líneas fuera de su alcance.
 *
 * @param {Array} tasks - Lista de tareas con team_id
 * @param {Array} teams - Líneas visibles para el usuario actual
 * @returns {Array} Tareas filtradas
 */
export function tasksForVisibleLines(tasks, teams) {
  const visibleIds = new Set(teams.map((t) => t.id))
  return tasks.filter((t) => visibleIds.has(t.team_id))
}
