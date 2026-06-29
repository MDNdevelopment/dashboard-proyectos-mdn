import { supabase } from '../../supabase'

/**
 * Returns the Supabase update patch for a task status change.
 * Pure function — testable without mocking.
 * Rule: switching to "Terminado" sets today's closed_date; any other status clears it.
 */
export function statusUpdatePatch(newStatus) {
  return newStatus === 'Terminado'
    ? { status: newStatus, closed_date: new Date().toISOString().slice(0, 10) }
    : { status: newStatus, closed_date: null }
}

/**
 * Updates a task's status in Supabase and returns the updated row.
 * Returns { data, error } from supabase.
 */
export async function updateTaskStatus(taskId, newStatus) {
  return supabase
    .from('tasks')
    .update(statusUpdatePatch(newStatus))
    .eq('id', taskId)
    .select()
    .single()
}
