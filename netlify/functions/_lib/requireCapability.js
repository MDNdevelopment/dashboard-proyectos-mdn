import { supabase } from './supabase.js'
import { canAccessModule } from '../../../src/lib/permissions.js'

const errJson = (statusCode, message) => ({
  statusCode,
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ error: message }),
})

/**
 * Verifica que el caller tenga un JWT válido Y la capacidad indicada, evaluada con el
 * mismo motor que el frontend (`src/lib/permissions.js#canAccessModule`) — admin siempre
 * pasa, sin fila en `module_permissions` = capacidad abierta a todos.
 *
 * Distinto de requireAdmin (exige admin === true a secas) y requireUser (cualquier
 * autenticado, sin evaluar capacidades).
 *
 * @param {object} event
 * @param {string} capabilityKey - p.ej. 'empresa.empleados.manage'
 * @returns {{ error: object } | { caller: { user_id: string, admin: boolean, access_level: number, department_id: number|null, position_id: number|null, company_id: string } }}
 */
export async function requireCapability(event, capabilityKey) {
  const header = event.headers?.authorization ?? event.headers?.Authorization ?? ''
  const token = header.startsWith('Bearer ') ? header.slice(7) : ''

  if (!token) return { error: errJson(401, 'Unauthorized') }

  // Verificar JWT con el cliente service-role
  const {
    data: { user },
    error: authErr,
  } = await supabase.auth.getUser(token)
  if (authErr || !user) return { error: errJson(401, 'Unauthorized') }

  const { data: profile, error: profileErr } = await supabase
    .from('users')
    .select('user_id, admin, access_level, department_id, position_id, company_id, deleted_at')
    .eq('user_id', user.id)
    .single()

  if (profileErr || !profile) return { error: errJson(401, 'Unauthorized') }
  if (profile.deleted_at) return { error: errJson(401, 'Unauthorized') }

  if (!profile.admin) {
    const { data: permRow, error: permErr } = await supabase
      .from('module_permissions')
      .select('rules')
      .eq('company_id', profile.company_id)
      .eq('module_key', capabilityKey)
      .maybeSingle()

    if (permErr) return { error: errJson(500, 'Error verificando permisos') }

    const configByModule = { [capabilityKey]: permRow?.rules ?? null }
    if (!canAccessModule(capabilityKey, profile, configByModule)) {
      return { error: errJson(403, 'Forbidden') }
    }
  }

  return { caller: profile }
}
