import { supabase } from '../supabase'

const COLUMNS =
  'id, user_id, company_id, type, start_date, end_date, event_time, reason, created_by, created_at'

/**
 * Trae los permisos/ausencias/reposos (`employee_permissions`) de un conjunto de
 * empleados que se solapan con el mes (year, month). `employee_permissions` no tiene
 * scoping por company_id real (igual que `vacations`), así que se filtra por `userIds`.
 * Con `userIds` vacío no se llega a golpear la red.
 */
export async function fetchPermissionsByMonth(userIds, year, month) {
  if (!userIds || userIds.length === 0) return []
  const mm = String(month).padStart(2, '0')
  const lastDay = new Date(year, month, 0).getDate()
  const firstKey = `${year}-${mm}-01`
  const lastKey = `${year}-${mm}-${String(lastDay).padStart(2, '0')}`
  const { data, error } = await supabase
    .from('employee_permissions')
    .select(COLUMNS)
    .in('user_id', userIds)
    .lte('start_date', lastKey)
    .gte('end_date', firstKey)
    .order('start_date')
  if (error) throw error
  return data ?? []
}

/** Historial completo de una persona, más reciente primero (para el bloque de la ficha). */
export async function fetchPermissionsForEmployee(userId) {
  if (!userId) return []
  const { data, error } = await supabase
    .from('employee_permissions')
    .select(COLUMNS)
    .eq('user_id', userId)
    .order('start_date', { ascending: false })
  if (error) throw error
  return data ?? []
}

/** Crea un registro de permiso/ausencia/reposo/llegada tarde/salida temprana. Escritura
 * directa: la RLS ya exige `empresa.permisos.manage`, no hay campos privilegiados que
 * clamplear server-side. `eventTime` ('HH:mm' o null) solo aplica a llegada_tarde/
 * salida_temprana (ver PERMISSION_TYPES.hasTime en utils/employeePermissions.js). */
export async function createPermission({
  userId,
  companyId,
  type,
  startDate,
  endDate,
  eventTime,
  reason,
  createdBy,
}) {
  const { data, error } = await supabase
    .from('employee_permissions')
    .insert({
      user_id: userId,
      company_id: companyId ?? null,
      type,
      start_date: startDate,
      end_date: endDate,
      event_time: eventTime ?? null,
      reason: reason ?? null,
      created_by: createdBy ?? null,
    })
    .select(COLUMNS)
    .single()
  if (error) throw error
  return data
}

export async function deletePermission(id) {
  const { error } = await supabase.from('employee_permissions').delete().eq('id', id)
  if (error) throw error
}
