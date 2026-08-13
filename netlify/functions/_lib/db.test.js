import { describe, it, expect, vi, beforeEach } from 'vitest'

const queryMock = vi.fn()
const releaseMock = vi.fn()
const connectMock = vi.fn(async () => ({ query: queryMock, release: releaseMock }))

vi.mock('pg', () => ({
  default: {
    Pool: vi.fn().mockImplementation(function PoolMock() {
      return { connect: connectMock }
    }),
  },
}))

describe('assertReadOnlySelect', () => {
  let assertReadOnlySelect, QueryValidationError

  beforeEach(async () => {
    ;({ assertReadOnlySelect, QueryValidationError } = await import('./db.js'))
  })

  it('acepta un SELECT simple', () => {
    expect(assertReadOnlySelect('select * from projects')).toBe('select * from projects')
  })

  it('acepta un WITH...SELECT (CTE)', () => {
    const sql = 'with x as (select 1) select * from x'
    expect(assertReadOnlySelect(sql)).toBe(sql)
  })

  it('quita un único punto y coma final', () => {
    expect(assertReadOnlySelect('select 1;')).toBe('select 1')
  })

  it('rechaza sql vacío', () => {
    expect(() => assertReadOnlySelect('')).toThrow(QueryValidationError)
    expect(() => assertReadOnlySelect('   ')).toThrow(QueryValidationError)
  })

  it('rechaza sql no-string', () => {
    expect(() => assertReadOnlySelect(null)).toThrow(QueryValidationError)
    expect(() => assertReadOnlySelect(undefined)).toThrow(QueryValidationError)
  })

  it('rechaza INSERT/UPDATE/DELETE/DROP', () => {
    expect(() => assertReadOnlySelect("insert into projects (name) values ('x')")).toThrow(
      QueryValidationError,
    )
    expect(() => assertReadOnlySelect("update projects set name = 'x'")).toThrow(
      QueryValidationError,
    )
    expect(() => assertReadOnlySelect('delete from projects')).toThrow(QueryValidationError)
    expect(() => assertReadOnlySelect('drop table projects')).toThrow(QueryValidationError)
  })

  it('rechaza múltiples statements separados por punto y coma', () => {
    expect(() => assertReadOnlySelect('select 1; drop table projects')).toThrow(
      QueryValidationError,
    )
  })
})

describe('runReadOnlyQuery', () => {
  let runReadOnlyQuery

  beforeEach(async () => {
    vi.clearAllMocks()
    queryMock.mockReset()
    process.env.SUPABASE_READONLY_DB_URL = 'postgres://mcp_readonly:x@localhost:5432/postgres'
    vi.resetModules()
    ;({ runReadOnlyQuery } = await import('./db.js'))
  })

  it('envuelve el SQL en una subconsulta con LIMIT y ejecuta dentro de una transacción read-only', async () => {
    queryMock.mockImplementation((sql) => {
      if (sql.startsWith('SELECT * FROM')) return { rows: [{ id: 1 }], rowCount: 1 }
      return {}
    })

    const result = await runReadOnlyQuery('select * from projects', 10)

    expect(queryMock).toHaveBeenCalledWith('BEGIN TRANSACTION READ ONLY')
    expect(queryMock).toHaveBeenCalledWith(
      'SELECT * FROM (select * from projects) AS _mcp_query LIMIT 10',
    )
    expect(queryMock).toHaveBeenCalledWith('COMMIT')
    expect(result).toEqual({ rows: [{ id: 1 }], rowCount: 1 })
    expect(releaseMock).toHaveBeenCalled()
  })

  it('aplica el límite por defecto cuando no se pasa limit', async () => {
    queryMock.mockResolvedValue({ rows: [], rowCount: 0 })
    await runReadOnlyQuery('select 1')
    expect(queryMock).toHaveBeenCalledWith(expect.stringContaining('LIMIT 500'))
  })

  it('acota el límite al tope máximo (1000) aunque se pida más', async () => {
    queryMock.mockResolvedValue({ rows: [], rowCount: 0 })
    await runReadOnlyQuery('select 1', 999999)
    expect(queryMock).toHaveBeenCalledWith(expect.stringContaining('LIMIT 1000'))
  })

  it('hace ROLLBACK y relanza el error si la consulta falla', async () => {
    queryMock.mockImplementation(async (sql) => {
      if (sql.startsWith('SELECT * FROM')) throw new Error('boom')
      return {}
    })

    await expect(runReadOnlyQuery('select 1')).rejects.toThrow('boom')
    expect(queryMock).toHaveBeenCalledWith('ROLLBACK')
    expect(releaseMock).toHaveBeenCalled()
  })

  it('rechaza sin llamar a la base si el SQL no es un SELECT válido', async () => {
    await expect(runReadOnlyQuery('drop table projects')).rejects.toThrow(/SELECT/)
    expect(connectMock).not.toHaveBeenCalled()
  })
})
