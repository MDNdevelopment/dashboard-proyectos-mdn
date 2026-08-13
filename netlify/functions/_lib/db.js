import pg from 'pg'

const { Pool } = pg

const MAX_ROWS = 1000
const DEFAULT_ROWS = 500

let pool

/**
 * Pool de conexión al rol Postgres `mcp_readonly` (ver migración
 * supabase/migrations/*_mcp_readonly_role.sql). Ese rol tiene
 * default_transaction_read_only = on a nivel de servidor, así que incluso si
 * esta capa de validación tuviera un hueco, la base física rechaza escrituras.
 */
function getPool() {
  if (!pool) {
    if (!process.env.SUPABASE_READONLY_DB_URL) {
      throw new Error('SUPABASE_READONLY_DB_URL no configurada')
    }
    pool = new Pool({
      connectionString: process.env.SUPABASE_READONLY_DB_URL,
      ssl: { rejectUnauthorized: false },
      max: 1, // cada invocación de Netlify Function es efímera
      statement_timeout: 10000,
    })
  }
  return pool
}

export class QueryValidationError extends Error {}

/**
 * Valida (sin ejecutar) que `sql` sea un único statement SELECT/WITH.
 * Defensa de app en profundidad, adicional al rol read-only de la BD.
 * @returns {string} el SQL sin punto y coma final, listo para envolver
 */
export function assertReadOnlySelect(sql) {
  if (typeof sql !== 'string' || !sql.trim()) {
    throw new QueryValidationError('sql es requerido')
  }
  const trimmed = sql.trim()
  const withoutTrailingSemicolon = trimmed.endsWith(';') ? trimmed.slice(0, -1) : trimmed

  if (withoutTrailingSemicolon.includes(';')) {
    throw new QueryValidationError('Solo se permite un único statement')
  }
  if (!/^(select|with)\b/i.test(withoutTrailingSemicolon.trim())) {
    throw new QueryValidationError('Solo se permiten consultas SELECT o WITH...SELECT')
  }
  return withoutTrailingSemicolon
}

function clampLimit(limit) {
  const n = Number(limit)
  if (!Number.isFinite(n) || n <= 0) return DEFAULT_ROWS
  return Math.min(Math.floor(n), MAX_ROWS)
}

/**
 * Ejecuta un SELECT de solo lectura y devuelve las filas resultantes.
 * El statement se envuelve en `SELECT * FROM (...) LIMIT n`, lo que además
 * de acotar el resultado obliga a que el SQL de entrada sea una subconsulta
 * válida (rechaza naturalmente cualquier cosa que no sea un SELECT-able).
 */
export async function runReadOnlyQuery(sql, limit) {
  const clean = assertReadOnlySelect(sql)
  const rowLimit = clampLimit(limit)

  const client = await getPool().connect()
  try {
    await client.query('BEGIN TRANSACTION READ ONLY')
    const result = await client.query(`SELECT * FROM (${clean}) AS _mcp_query LIMIT ${rowLimit}`)
    await client.query('COMMIT')
    return { rows: result.rows, rowCount: result.rowCount }
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {})
    throw err
  } finally {
    client.release()
  }
}

/** Lista tablas y columnas del schema public para que el modelo conozca el esquema disponible. */
export async function listTables() {
  const client = await getPool().connect()
  try {
    const result = await client.query(`
      select table_name, column_name, data_type, is_nullable
      from information_schema.columns
      where table_schema = 'public'
      order by table_name, ordinal_position
    `)
    return result.rows
  } finally {
    client.release()
  }
}
