/**
 * Utilidades puras para gestionar la relación empleado↔línea.
 * member_user_ids se reconstruye desde metric_line_members al cargar líneas.
 * Mover un empleado = quitar su id de la línea anterior, añadirlo a la nueva.
 */
import { crossLineUserIds } from './lineFilters'

/**
 * Devuelve la línea que contiene a un empleado, o null si no está en ninguna.
 * @param {Array} lines - Array de líneas con member_user_ids: string[]
 * @param {string} userId
 * @returns {object|null}
 */
export function lineOfMember(lines, userId) {
  return lines.find((l) => (l.member_user_ids ?? []).includes(userId)) ?? null
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
  const updated = lines.map((line) => {
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
        member_user_ids: members.filter((id) => id !== userId),
        lead_user_id: line.lead_user_id === userId ? null : line.lead_user_id,
      }
    }
    return line
  })
  return { updated, changedIds }
}

/**
 * Determina si un usuario debe ver todas las líneas (sin scoping).
 * - Nivel 4+ o admin: ve todas las líneas.
 * - tasks_view_all=true: ve todas las líneas (bypass por usuario, sin cambiar nivel).
 * - extraViewAll=true: bypass adicional para módulos con su propia capability de "ver
 *   todo" (p. ej. Pautas → `audiovisual.ver_todo`), sin tener que subir el nivel del
 *   usuario ni volverlo miembro de todas las líneas.
 *
 * @param {object|null} userProfile - Perfil del usuario (de useAuth)
 * @param {{ extraViewAll?: boolean }} [opts]
 * @returns {boolean}
 */
export function userViewsAllLines(userProfile, { extraViewAll = false } = {}) {
  return (
    userProfile?.access_level >= 4 ||
    userProfile?.admin === true ||
    userProfile?.tasks_view_all === true ||
    extraViewAll
  )
}

/**
 * Filtra las líneas visibles para un usuario según su nivel de acceso.
 * - userViewsAllLines(): ve todas las líneas.
 * - Nivel 1-3 sin flag: ve solo las líneas donde está en member_user_ids.
 *
 * @param {Array} lines - Todas las líneas cargadas de metric_lines
 * @param {object|null} userProfile - Perfil del usuario (de useAuth)
 * @param {{ extraViewAll?: boolean }} [opts] - ver `userViewsAllLines`
 * @returns {Array}
 */
export function visibleLinesForUser(lines, userProfile, opts) {
  if (!lines) return []
  if (userViewsAllLines(userProfile, opts)) return lines
  const uid = userProfile?.user_id
  if (!uid) return []
  return lines.filter((l) => (l.member_user_ids ?? []).includes(uid))
}

/**
 * Rellena member_user_ids de "Independientes" (is_general) y "Alta Gerencia"
 * (is_management) con los empleados que no pertenecen a ninguna línea real, repartidos
 * por nivel de acceso: dirección (access_level >= 4) va a Alta Gerencia, el resto a
 * Independientes — así los independientes no ven las tareas de dirección. Es una
 * derivación pura (no se persiste en metric_line_members): se recalcula cada vez que se
 * cargan líneas/usuarios, así que se auto-mantiene al mover empleados entre líneas o
 * cambiarles el nivel de acceso.
 *
 * @param {Array} lines - Líneas cargadas (incluye las filas is_general/is_management si existen)
 * @param {Array} users - Empleados de la empresa (con user_id, access_level, deleted_at)
 * @returns {Array} Copia de lines con member_user_ids de ambas líneas ocultas recalculado
 */
export function withDerivedGeneralMembers(lines, users) {
  const unassignedIds = new Set(crossLineUserIds(users, lines))
  const byId = new Map((users ?? []).map((u) => [u.user_id, u]))
  const managementIds = [...unassignedIds].filter((id) => (byId.get(id)?.access_level ?? 0) >= 4)
  const generalIds = [...unassignedIds].filter((id) => (byId.get(id)?.access_level ?? 0) < 4)
  return lines.map((l) => {
    if (l.is_management) return { ...l, member_user_ids: managementIds }
    if (l.is_general) return { ...l, member_user_ids: generalIds }
    return l
  })
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
  const updated = lines.map((line) => {
    if (line.id !== lineId) return line
    const members = line.member_user_ids ?? []
    if (!members.includes(userId)) return line
    changedIds.push(line.id)
    return {
      ...line,
      member_user_ids: members.filter((id) => id !== userId),
      lead_user_id: line.lead_user_id === userId ? null : line.lead_user_id,
    }
  })
  return { updated, changedIds }
}
