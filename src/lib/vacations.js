import { supabase } from '../supabase'

/**
 * Statuses que NO representan una vacación confirmada: se excluyen del calendario.
 * `vacations.status` no tiene un vocabulario cerrado — VacationsDialog.jsx escribe
 * 'pending'/'approved'/'rejected'/'completed', pero datos existentes (import previo)
 * usan 'programmed'/'fulfilled' para lo confirmado. Por eso se excluye por negación
 * (pending/rejected) en vez de listar los valores "buenos", que quedarían incompletos
 * frente a cualquier otro valor histórico o futuro.
 */
const UNCONFIRMED_STATUSES = ['pending', 'rejected']

/**
 * Trae las vacaciones confirmadas (no pendientes ni rechazadas) de un conjunto de
 * empleados que caen dentro del rango [fetchStartKey, endKey] (ver monthGridRange en
 * utils/employeeCalendar.js). `vacations` no tiene `company_id`, así que el scoping va
 * por `userIds`. Con `userIds` vacío no se llega a golpear la red.
 */
export async function fetchVacationsInRange(userIds, fetchStartKey, endKey) {
  if (!userIds || userIds.length === 0) return []
  const { data, error } = await supabase
    .from('vacations')
    .select('id, user_id, start_date, end_date, status')
    .in('user_id', userIds)
    .not('status', 'in', `(${UNCONFIRMED_STATUSES.join(',')})`)
    .lte('start_date', endKey)
    .gte('end_date', fetchStartKey)
    .order('start_date')
  if (error) throw error
  return data ?? []
}
