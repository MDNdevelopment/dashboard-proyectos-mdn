/**
 * Capa de acceso a datos de recursos externos (`external_resources`): gente que la
 * agencia contrata para grabar/editar/ads pero que NO es empleado — no debe aparecer en
 * Tareas, Líneas ni Evaluaciones (ver ARQUITECTURA.md). Se gestionan desde Empresa →
 * Empleados y solo se consumen en el módulo Pautas. Mismo patrón `{ data, error }` que
 * `avPautasApi.js`.
 */
import { supabase } from '../../supabase'

const ALLOWED_ROLES = ['grabacion', 'edicion', 'ads']

/** Carga todos los recursos externos (activos y archivados) de la empresa. */
export async function loadExternalResources(companyId) {
  return supabase
    .from('external_resources')
    .select('*')
    .eq('company_id', companyId)
    .order('full_name', { ascending: true })
}

export async function createExternalResource(companyId, fields) {
  return supabase
    .from('external_resources')
    .insert({ ...sanitizeFields(fields), company_id: companyId })
    .select()
    .single()
}

export async function updateExternalResource(id, fields) {
  return supabase
    .from('external_resources')
    .update(sanitizeFields(fields))
    .eq('id', id)
    .select()
    .single()
}

/** Soft delete: los recursos externos ya asignados en pautas pasadas deben seguir
 * resolviendo su nombre (igual que empleados archivados), así que nunca se borran físico. */
export async function deleteExternalResource(id) {
  return supabase
    .from('external_resources')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single()
}

export async function restoreExternalResource(id) {
  return supabase
    .from('external_resources')
    .update({ deleted_at: null })
    .eq('id', id)
    .select()
    .single()
}

/** Solo persiste `full_name` y `roles` (filtrando cualquier rol fuera del set permitido). */
function sanitizeFields(fields) {
  const out = {}
  if ('full_name' in fields) out.full_name = (fields.full_name ?? '').trim()
  if ('roles' in fields) out.roles = (fields.roles ?? []).filter((r) => ALLOWED_ROLES.includes(r))
  return out
}
