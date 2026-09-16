import pg from 'pg'

const { Pool } = pg

let pool

/**
 * Pool de conexión al rol Postgres `mcp_writer` (ver migraciones
 * supabase/migrations/*_mcp_writer_role.sql y *_mcp_writer_returning_select.sql,
 * y *_mcp_writer_meetings_cnp.sql para los GRANT de meetings/cnp_requests).
 * El rol solo tiene GRANT INSERT/UPDATE/DELETE en las tablas puntuales que cada
 * migración le otorga explícitamente — así que aunque esta capa de validación
 * tuviera un hueco, la base física no deja hacer nada más que eso.
 * ADEMÁS tiene GRANT SELECT (a nivel de columna en `tasks`, de tabla completa en
 * `meetings`/`cnp_requests` — ver la migración de estas dos): Postgres exige
 * privilegio SELECT sobre las columnas que un RETURNING/WHERE toca, no basta con
 * INSERT/UPDATE — si agregas una columna nueva a un RETURNING de `tasks`,
 * agrégala también al GRANT SELECT de esa migración o vuelve a romperse con
 * "permission denied for table".
 */
export function getWriterPool() {
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

export class ValidationError extends Error {}
// Alias retrocompatible: el nombre histórico de este error en mcpWrite.js/mcpWrite.test.js.
export const TaskValidationError = ValidationError

export function assertNonEmptyString(value, field) {
  if (typeof value !== 'string' || !value.trim()) {
    throw new ValidationError(`${field} es requerido`)
  }
  return value.trim()
}

export function requiredCompanyId() {
  const companyId = process.env.MCP_COMPANY_ID
  if (!companyId) throw new Error('MCP_COMPANY_ID no configurada')
  return companyId
}

/**
 * Arma la lista de asignaciones `"col" = $n` de un UPDATE parcial a partir de un
 * whitelist de columnas escribibles — los NOMBRES de columna siempre vienen del
 * array `allowedColumns` (literal en el código de cada tool, nunca de `patch`),
 * los VALORES siempre van parametrizados. Evita dos problemas a la vez: una tool
 * por campo (infla tools/list) y un SET armado concatenando claves del modelo
 * (inyección SQL). `patch` es un objeto `{ columna: valor }`; solo se incluyen
 * las claves presentes (permite patches parciales — omitir una clave dejar esa
 * columna intacta). `startIndex` es el número de parámetro `$n` inicial (1-based).
 * @returns {{ clauses: string[], values: any[] }}
 */
export function buildSet(patch, allowedColumns, startIndex = 1) {
  const clauses = []
  const values = []
  let i = startIndex
  for (const col of allowedColumns) {
    if (!(col in patch)) continue
    clauses.push(`${col} = $${i}`)
    values.push(patch[col])
    i += 1
  }
  return { clauses, values }
}

/**
 * Crea una tarea desde el MCP de escritura. `company_id` nunca viene del
 * modelo — se fija aquí desde MCP_COMPANY_ID, así que no se puede falsear por
 * prompt injection ni por un argumento mal pasado. `created_by` tampoco es un
 * argumento del modelo: lo resuelve mcp.js a partir de CON QUÉ contraseña
 * individual se autenticó quien está llamando (ver oauth.js →
 * resolveAuth()/MCP_WRITERS) y lo pasa aquí ya fijo — cada persona autorizada
 * a escribir tiene su propia contraseña, así que el autor queda determinado
 * por el servidor, nunca por lo que el modelo diga. `status` siempre nace en
 * 'Pendiente'.
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
    throw new ValidationError('assignee_ids debe ser un array con al menos un responsable')
  }
  const cleanAssignees = assigneeIds.map((id, i) => assertNonEmptyString(id, `assignee_ids[${i}]`))

  const companyId = requiredCompanyId()

  const client_ = await getWriterPool().connect()
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
