import {
  getWriterPool,
  assertNonEmptyString,
  requiredCompanyId,
  buildSet,
  ValidationError,
} from './mcpWrite.js'
import { runInternalQuery } from './db.js'

export const TASK_STATUSES = ['Pendiente', 'En proceso', 'Paralizado', 'Terminado']

const TASK_UPDATE_COLUMNS = ['status', 'closed_date', 'blocked_reason']

const MAX_COMMENT_LENGTH = 4000

/** Fecha de hoy (YYYY-MM-DD) en hora de Venezuela — igual que la fecha local que pone TaskModal. */
export function todayCaracas(now = new Date()) {
  return now.toLocaleDateString('en-CA', { timeZone: 'America/Caracas' })
}

/**
 * Carga la tarea (acotada a la empresa del MCP) y verifica que quien escribe esté
 * involucrado: responsable (assignee_id / assignee_ids) o creador. El MCP de escritura
 * es compartido por un grupo pequeño, pero ninguno debería poder tocar tareas ajenas
 * por un prompt mal entendido.
 */
async function loadOwnTask(id, userId, companyId) {
  const { rows } = await runInternalQuery(
    `select id, status, assignee_id, assignee_ids, created_by
       from public.tasks where id = $1 and company_id = $2`,
    [id, companyId],
  )
  const task = rows[0]
  if (!task) throw new ValidationError('La tarea no existe')
  const involved =
    task.assignee_id === userId ||
    (Array.isArray(task.assignee_ids) && task.assignee_ids.includes(userId)) ||
    task.created_by === userId
  if (!involved) {
    throw new ValidationError('Solo puedes actualizar tareas asignadas a ti o creadas por ti')
  }
  return task
}

/**
 * Cambia el estado de una tarea desde el MCP. Replica las reglas de TaskModal.jsx:
 * - 'Terminado' fija `closed_date` (hoy, hora de Caracas); cualquier otro estado lo limpia.
 * - 'Paralizado' exige `blocked_reason`; cualquier otro estado lo limpia.
 * Solo toca status / closed_date / blocked_reason (el GRANT UPDATE de la base tampoco
 * permite más). `updated_by` lo fija mcp.js desde el token, nunca el modelo.
 */
export async function updateTask({
  id,
  status,
  blocked_reason: blockedReason,
  updated_by: updatedBy,
}) {
  assertNonEmptyString(id, 'id')
  assertNonEmptyString(updatedBy, 'updated_by')
  assertNonEmptyString(status, 'status')
  if (!TASK_STATUSES.includes(status)) {
    throw new ValidationError(`status debe ser uno de: ${TASK_STATUSES.join(', ')}`)
  }
  if (status === 'Paralizado' && !(typeof blockedReason === 'string' && blockedReason.trim())) {
    throw new ValidationError('blocked_reason es requerido para paralizar una tarea')
  }

  const companyId = requiredCompanyId()
  await loadOwnTask(id, updatedBy, companyId)

  const patch = {
    status,
    closed_date: status === 'Terminado' ? todayCaracas() : null,
    blocked_reason: status === 'Paralizado' ? blockedReason.trim() : null,
  }
  const { clauses, values } = buildSet(patch, TASK_UPDATE_COLUMNS, 1)

  const client = await getWriterPool().connect()
  try {
    const result = await client.query(
      `update public.tasks set ${clauses.join(', ')}
       where id = $${values.length + 1} and company_id = $${values.length + 2}
       returning id, description, status, closed_date, blocked_reason`,
      [...values, id, companyId],
    )
    return result.rows[0]
  } finally {
    client.release()
  }
}

/**
 * Agrega un comentario a una tarea desde el MCP (p.ej. el link del PR que la resuelve,
 * o preguntas cuando la tarea es ambigua). `author_id` lo fija mcp.js desde el token.
 * El trigger notify_task_comment (security definer) notifica a los involucrados.
 */
export async function addTaskComment({ task_id: taskId, content, author_id: authorId }) {
  assertNonEmptyString(taskId, 'task_id')
  assertNonEmptyString(authorId, 'author_id')
  const text = assertNonEmptyString(content, 'content')
  if (text.length > MAX_COMMENT_LENGTH) {
    throw new ValidationError(`content no puede superar ${MAX_COMMENT_LENGTH} caracteres`)
  }

  const companyId = requiredCompanyId()
  await loadOwnTask(taskId, authorId, companyId)

  const client = await getWriterPool().connect()
  try {
    const result = await client.query(
      `insert into public.task_comments (task_id, company_id, author_id, content)
       values ($1, $2, $3, $4)
       returning id, task_id, author_id, content, created_at`,
      [taskId, companyId, authorId, text],
    )
    return result.rows[0]
  } finally {
    client.release()
  }
}
