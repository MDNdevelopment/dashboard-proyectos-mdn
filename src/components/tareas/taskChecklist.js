/**
 * Helpers para el checklist de tareas (JSONB en tasks.checklist).
 *
 * Cada ítem: { id, title, assignee_id, due_date, done }
 *
 * El estado de la tarea es SIEMPRE manual — el checklist no lo modifica.
 */

// ── Creación de ítems ────────────────────────────────────────

/**
 * Crea un nuevo ítem de checklist vacío con id único.
 * Usa el mismo patrón de id que ProjectModal.jsx.
 */
export function newChecklistItem() {
  return {
    id: Math.random().toString(36).slice(2),
    title: '',
    assignee_id: null,
    due_date: '',
    done: false,
  }
}

// ── Ajuste de fechas ─────────────────────────────────────────

/**
 * Recorta la due_date de un ítem al rango [request_date, due_date] de la tarea.
 * Si la tarea no tiene fecha en un lado, ese límite no se aplica.
 *
 * @param {string} due_date   Fecha del ítem (YYYY-MM-DD o '')
 * @param {{ request_date?: string, due_date?: string }} task
 * @returns {string}  Fecha ajustada (puede ser la misma si ya estaba dentro)
 */
export function clampItemDueDate(due_date, task) {
  if (!due_date) return due_date
  let d = due_date
  if (task.request_date && d < task.request_date) d = task.request_date
  if (task.due_date     && d > task.due_date)     d = task.due_date
  return d
}

// ── Progreso ─────────────────────────────────────────────────

/**
 * Retorna el conteo de ítems hechos y el total del checklist.
 *
 * @param {Array} checklist
 * @returns {{ done: number, total: number }}
 */
export function checklistProgress(checklist) {
  if (!checklist || checklist.length === 0) return { done: 0, total: 0 }
  return {
    done:  checklist.filter(i => i.done).length,
    total: checklist.length,
  }
}
