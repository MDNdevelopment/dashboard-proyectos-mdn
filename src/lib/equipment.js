import { supabase } from '../supabase'

const COLUMNS =
  'id, company_id, model, serial, icloud_email, line_id, responsible_user_id, status, notes, created_by, created_at, updated_at'

/** Todo el inventario de la empresa. La RLS exige `empresa.equipos`. */
export async function fetchEquipment(companyId) {
  if (!companyId) return []
  const { data, error } = await supabase
    .from('company_equipment')
    .select(COLUMNS)
    .eq('company_id', companyId)
    .order('created_at', { ascending: false })
  if (error) throw error
  return data ?? []
}

/** Crea un equipo. La RLS exige `empresa.equipos.manage`. */
export async function createEquipment(companyId, fields, createdBy) {
  const { data, error } = await supabase
    .from('company_equipment')
    .insert({ ...fields, company_id: companyId, created_by: createdBy ?? null })
    .select(COLUMNS)
    .single()
  if (error) throw error
  return data
}

export async function updateEquipment(id, fields) {
  const { data, error } = await supabase
    .from('company_equipment')
    .update({ ...fields, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select(COLUMNS)
    .single()
  if (error) throw error
  return data
}

export async function deleteEquipment(id) {
  const { error } = await supabase.from('company_equipment').delete().eq('id', id)
  if (error) throw error
}

/** Historial de responsables/líneas de un equipo, el más reciente primero. */
export async function fetchEquipmentHistory(equipmentId) {
  const { data, error } = await supabase
    .from('company_equipment_assignments')
    .select('id, equipment_id, user_id, line_id, started_at, ended_at, changed_by')
    .eq('equipment_id', equipmentId)
    .order('started_at', { ascending: false })
  if (error) throw error
  return data ?? []
}

/** iPhones que tiene a su cargo un empleado (sin los dados de baja). */
export async function fetchEquipmentForUser(userId) {
  if (!userId) return []
  const { data, error } = await supabase
    .from('company_equipment')
    .select(COLUMNS)
    .eq('responsible_user_id', userId)
    .neq('status', 'baja')
    .order('model')
  if (error) throw error
  return data ?? []
}
