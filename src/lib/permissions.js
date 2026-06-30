/**
 * Lógica pura de evaluación de permisos por módulo.
 *
 * Modelo de reglas — Forma Normal Disyuntiva (DNF):
 *   config.rules = [grupo1, grupo2, ...]   ← OR entre grupos
 *   grupo.all   = [condición1, condición2] ← AND dentro del grupo
 *
 * Tipos de condición:
 *   { type: 'department', ids: [number] }   → department_id ∈ ids
 *   { type: 'min_level',  value: number }   → access_level >= value
 *   { type: 'user',       ids: [string] }   → user_id ∈ ids
 *   { type: 'position',   ids: [number] }   → position_id ∈ ids
 *
 * Defaults:
 *   - Si userProfile es null/undefined → false
 *   - Si userProfile.admin === true    → true (siempre)
 *   - Si no hay reglas configuradas    → true (módulo abierto a todos)
 *   - Un grupo sin condiciones         → true (grupo vacío pasa)
 */

/**
 * @param {string}   moduleKey
 * @param {object}   userProfile  — objeto del contexto Auth (puede ser null)
 * @param {object}   configByModule — { [moduleKey]: { rules: [...] } }
 * @returns {boolean}
 */
/**
 * Alias de canAccessModule para claves de capacidad granulares.
 * Usa la misma firma — el evaluador funciona igual para 'empresa',
 * 'empresa.clientes' o 'empresa.lineas.manage'.
 *
 * @param {string} key - Clave de capacidad (módulo, tab o acción)
 * @param {object} userProfile
 * @param {object} configByModule - { [key]: { rules: [...] } }
 * @returns {boolean}
 */
export const can = canAccessModule

export function canAccessModule(moduleKey, userProfile, configByModule) {
  if (!userProfile) return false
  if (userProfile.admin === true) return true

  const config = configByModule?.[moduleKey]
  const rules = config?.rules ?? []

  // Sin reglas = acceso libre
  if (rules.length === 0) return true

  // OR: basta con que un grupo pase
  return rules.some(group => groupPasses(group, userProfile))
}

/**
 * Un grupo pasa si TODAS sus condiciones se cumplen (AND).
 */
function groupPasses(group, userProfile) {
  const conditions = group?.all ?? []
  if (conditions.length === 0) return true
  return conditions.every(cond => matchCondition(cond, userProfile))
}

function matchCondition(cond, userProfile) {
  if (!cond?.type) return false

  switch (cond.type) {
    case 'department':
      return Array.isArray(cond.ids) && cond.ids.includes(userProfile.department_id)

    case 'min_level':
      return (userProfile.access_level ?? 1) >= (cond.value ?? 1)

    case 'user':
      return Array.isArray(cond.ids) && cond.ids.includes(userProfile.user_id)

    case 'position':
      return Array.isArray(cond.ids) && cond.ids.includes(userProfile.position_id)

    default:
      return false
  }
}
