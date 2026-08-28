import { supabase } from '../supabase'
import { EXCLUDED_VACATION_STATUSES } from '../utils/employeeCalendar'

/**
 * Trae las vacaciones no rechazadas (tentativas y confirmadas, para que el calendario
 * pueda mostrar ambas distinguidas) de un conjunto de empleados que caen dentro del
 * rango [fetchStartKey, endKey] (ver monthGridRange en utils/employeeCalendar.js).
 * `vacations` no tiene `company_id`, así que el scoping va por `userIds`. Con `userIds`
 * vacío no se llega a golpear la red. El vocabulario de exclusión vive en
 * employeeCalendar.js (resolveVacationStatus) para no duplicarlo.
 */
export async function fetchVacationsInRange(userIds, fetchStartKey, endKey) {
  if (!userIds || userIds.length === 0) return []
  const { data, error } = await supabase
    .from('vacations')
    .select('id, user_id, start_date, end_date, status')
    .in('user_id', userIds)
    .not('status', 'in', `(${EXCLUDED_VACATION_STATUSES.join(',')})`)
    .lte('start_date', endKey)
    .gte('end_date', fetchStartKey)
    .order('start_date')
  if (error) throw error
  return data ?? []
}

/**
 * Trae las vacaciones no rechazadas de un conjunto de empleados que se solapan con el año
 * `year` (para el panel global "Vacaciones del año" en Empresa → Empleados). Mismo patrón
 * de scoping por `userIds` y corte por strings 'yyyy-MM-dd' que `fetchVacationsInRange`.
 */
export async function fetchVacationsByYear(userIds, year) {
  if (!userIds || userIds.length === 0) return []
  const { data, error } = await supabase
    .from('vacations')
    .select('id, user_id, start_date, end_date, status')
    .in('user_id', userIds)
    .not('status', 'in', `(${EXCLUDED_VACATION_STATUSES.join(',')})`)
    .lte('start_date', `${year}-12-31`)
    .gte('end_date', `${year}-01-01`)
    .order('start_date')
  if (error) throw error
  return data ?? []
}
