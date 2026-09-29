/**
 * Detección de "recursos obsoletos": empleados archivados (despedidos o que se
 * fueron) que siguen asignados como equipo de una cuenta en `metric_clients`.
 *
 * Por qué existe: al archivar un empleado, `netlify/functions/archive-employee.js`
 * marca `users.deleted_at`, banea su login y borra su fila de
 * `metric_line_members`, pero NO limpia sus asignaciones en `metric_clients`
 * (social_manager_id / designer_id / audiovisual_ids / apoyo_ids). La hoja
 * "Clientes por social" (utils/exportClientsToPdf.js) resuelve esos ids contra
 * `loadCompanyEmployees`, que devuelve también archivados, así que un despedido
 * sigue encabezando su columna en la hoja impresa. Este módulo alimenta el aviso
 * bloqueante que obliga a la jefa de línea a reasignar (ver
 * hooks/useStaleClientResources.js y components/StaleClientResourcesModal.jsx).
 *
 * Todo acá es puro y recibe los datos ya cargados — mismo estilo que
 * utils/reportClosure.js — para poder testear sin mockear Supabase.
 *
 * Nota: la única fuente fiable de "ya no está en la empresa" es
 * `users.deleted_at` (igual que activeEmployees() en lib/employees.js). NO sirve
 * mirar `metric_line_members`: esa fila ya fue borrada al archivar.
 */

/**
 * Los cuatro campos de equipo de `metric_clients`, con el departamento que
 * acota sus candidatos. Fuente única para la detección y para los pickers del
 * modal, así que no pueden desincronizarse.
 *
 * `departmentId` replica el filtro que ya usa ClientModal.jsx:
 * 1 = Redes/Social, 2 = Audiovisual, 3 = Diseño. `apoyo_ids` es null porque
 * acepta a cualquier empleado de la empresa.
 */
export const RESOURCE_FIELDS = [
  { key: 'social_manager_id', label: 'Social', multi: false, departmentId: 1 },
  { key: 'designer_id', label: 'Diseñador', multi: false, departmentId: 3 },
  { key: 'audiovisual_ids', label: 'Audiovisual', multi: true, departmentId: 2 },
  { key: 'apoyo_ids', label: 'Apoyo', multi: true, departmentId: null },
]

/** Set de user_id de empleados archivados (soft delete: users.deleted_at). */
export function archivedUserIds(employees = []) {
  return new Set((employees ?? []).filter((e) => e.deleted_at).map((e) => e.user_id))
}

/** Normaliza el valor de un campo de recurso a array de ids (ignora null/vacíos). */
function idsOf(client, field) {
  const raw = client?.[field.key]
  if (field.multi) return Array.isArray(raw) ? raw.filter(Boolean) : []
  return raw ? [raw] : []
}

/**
 * Cuentas lideradas por `userId` que tienen algún recurso archivado asignado.
 *
 * Solo mira las líneas donde el usuario es jefa (`lead_user_id`, derivado por
 * loadLines desde `metric_line_members.is_lead`) y solo cuentas activas. Las
 * cuentas sin línea (`line_id = null`, "Independientes") no tienen jefa y por
 * tanto quedan fuera — punto ciego conocido y aceptado.
 *
 * @param {Array} clients   filas de metric_clients (ya sin archivadas idealmente)
 * @param {Array} employees filas de users INCLUYENDO archivados (hay que resolver
 *   el nombre del despedido para mostrarlo)
 * @param {Array} lines     líneas normalizadas por loadLines (traen lead_user_id)
 * @param {string|null|undefined} userId
 * @returns {Array<{client: object, line: object, stale: Array<object>}>}
 *   ordenado por nombre de cliente. Cada entrada de `stale` es
 *   `{ field, label, multi, departmentId, archived: Array<user>, keepIds: string[] }`
 */
export function staleResourceClients(clients, employees, lines, userId) {
  if (!userId) return []

  const leadLines = new Map(
    (lines ?? []).filter((l) => l.lead_user_id === userId).map((l) => [l.id, l]),
  )
  if (leadLines.size === 0) return []

  const archived = archivedUserIds(employees)
  if (archived.size === 0) return []

  const byId = new Map((employees ?? []).map((e) => [e.user_id, e]))

  return (clients ?? [])
    .filter((c) => !c.deleted_at && c.line_id && leadLines.has(c.line_id))
    .map((client) => {
      const stale = RESOURCE_FIELDS.map((field) => {
        const ids = idsOf(client, field)
        const staleIds = ids.filter((id) => archived.has(id))
        if (staleIds.length === 0) return null
        return {
          field: field.key,
          label: field.label,
          multi: field.multi,
          departmentId: field.departmentId,
          // Puede no existir en `employees` (id huérfano): se conserva el id para
          // no perder la fila y el modal muestra un fallback.
          archived: staleIds.map((id) => byId.get(id) ?? { user_id: id }),
          keepIds: ids.filter((id) => !archived.has(id)),
        }
      }).filter(Boolean)

      return stale.length > 0 ? { client, line: leadLines.get(client.line_id), stale } : null
    })
    .filter(Boolean)
    .sort((a, b) => (a.client.name ?? '').localeCompare(b.client.name ?? '', 'es'))
}

/**
 * Valor a guardar en `metric_clients` para una fila del modal, dado lo que el
 * picker tiene seleccionado.
 *
 * En los campos múltiples se guarda el array del picker tal cual: el picker se
 * precarga con `keepIds` (sin los archivados), así que el propio acto de guardar
 * es lo que los elimina — no hace falta restar nada.
 *
 * @param {{multi: boolean}} entry  fila de `stale`
 * @param {string|string[]|null} picked
 */
export function resolvedValue(entry, picked) {
  if (entry.multi) return Array.isArray(picked) ? picked : []
  return picked || null
}

/** Total de recursos obsoletos (para el encabezado del aviso). */
export function staleResourceCount(items = []) {
  return (items ?? []).reduce((acc, item) => acc + item.stale.length, 0)
}
