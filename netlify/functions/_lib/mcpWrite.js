import pg from 'pg'

const { Pool } = pg

let pool

/**
 * Pool de conexión al rol Postgres `mcp_writer` (ver migración
 * supabase/migrations/*_mcp_writer_role.sql). Ese rol solo tiene GRANT INSERT
 * en `public.tasks` — ninguna otra tabla, ni UPDATE/DELETE siquiera ahí — así
 * que aunque esta capa de validación tuviera un hueco, la base física no deja
 * hacer nada más que insertar tareas.
 */
function getPool() {
  if (!pool) {
    if (!process.env.SUPABASE_WRITER_DB_URL) {
      throw new Error('SUPABASE_WRITER_DB_URL no configurada')
    }
    pool = new Pool({
      connectionString: process.env.SUPABASE_WRITER_DB_URL,
      ssl: { rejectUnauthorized: false },
      max: 1, // cada invocación de Netlify Function es efímera
      statement_timeout: 10000,
    })
  }
  return pool
}

export class TaskValidationError extends Error {}

function assertNonEmptyString(value, field) {
  if (typeof value !== 'string' || !value.trim()) {
    throw new TaskValidationError(`${field} es requerido`)
  }
  return value.trim()
}

/**
 * Allowlist de quién puede figurar como autor de una tarea creada por el MCP
 * de escritura — todos comparten la misma contraseña de escritura (role
 * 'writer'), así que no hay forma criptográfica de saber cuál de ellos está
 * escribiendo. `created_by` sí viene del modelo (a diferencia de
 * `company_id`), pero se valida contra esta lista fija: solo puede ser uno de
 * los user_id aquí, nunca un uuid arbitrario inventado o de otra persona.
 */
function allowedWriterIds() {
  return (process.env.MCP_WRITER_USER_IDS ?? '')
    .split(',')
    .map((id) => id.trim())
    .filter(Boolean)
}

/**
 * Crea una tarea desde el MCP de escritura. `company_id` nunca viene del
 * modelo — se fija aquí desde MCP_COMPANY_ID, así que no se puede falsear por
 * prompt injection ni por un argumento mal pasado. `created_by` sí es un
 * argumento, pero se valida contra `allowedWriterIds()` (ver arriba).
 * `status` siempre nace en 'Pendiente'.
 */
export async function createTask({
  team_id: teamId,
  assignee_ids: assigneeIds,
  description,
  client_id: clientId,
  client,
  due_date: dueDate,
  source,
  created_by: createdBy,
}) {
  assertNonEmptyString(teamId, 'team_id')
  assertNonEmptyString(description, 'description')
  assertNonEmptyString(createdBy, 'created_by')
  if (!Array.isArray(assigneeIds) || assigneeIds.length === 0) {
    throw new TaskValidationError('assignee_ids debe ser un array con al menos un responsable')
  }
  const cleanAssignees = assigneeIds.map((id, i) => assertNonEmptyString(id, `assignee_ids[${i}]`))

  const allowed = allowedWriterIds()
  if (!allowed.includes(createdBy)) {
    throw new TaskValidationError(
      'created_by no está autorizado a crear tareas por este medio — resuélvelo contra users y usa un user_id de la lista permitida',
    )
  }

  const companyId = process.env.MCP_COMPANY_ID
  if (!companyId) throw new Error('MCP_COMPANY_ID no configurada')

  const client_ = await getPool().connect()
  try {
    const result = await client_.query(
      `insert into public.tasks
         (company_id, team_id, client_id, client, assignee_ids, description,
          source, request_date, due_date, status, created_by)
       values ($1, $2, $3, $4, $5, $6, $7, current_date, $8, 'Pendiente', $9)
       returning id, team_id, client, description, assignee_ids, due_date, status, created_at`,
      [
        companyId,
        teamId,
        clientId || null,
        client || null,
        cleanAssignees,
        description.trim(),
        source ? String(source).trim() : 'MAPPI (voz)',
        dueDate || null,
        createdBy,
      ],
    )
    return result.rows[0]
  } finally {
    client_.release()
  }
}
