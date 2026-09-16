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

const runInternalQueryMock = vi.fn()
vi.mock('./db.js', () => ({
  runInternalQuery: (...args) => runInternalQueryMock(...args),
}))

describe('mcpWriteCnp', () => {
  let createCnp, updateCnp, softDeleteCnp, ValidationError

  beforeEach(async () => {
    vi.clearAllMocks()
    queryMock.mockReset()
    runInternalQueryMock.mockReset()
    process.env.SUPABASE_WRITER_DB_URL = 'postgres://mcp_writer:x@localhost:5432/postgres'
    process.env.MCP_COMPANY_ID = 'company-1'
    vi.resetModules()
    ;({ createCnp, updateCnp, softDeleteCnp } = await import('./mcpWriteCnp.js'))
    ;({ ValidationError } = await import('./mcpWrite.js'))
  })

  describe('createCnp', () => {
    it('rechaza sin client_id ni title', async () => {
      await expect(createCnp({ title: 'x' })).rejects.toThrow(ValidationError)
      await expect(createCnp({ client_id: 'c1' })).rejects.toThrow(ValidationError)
      expect(connectMock).not.toHaveBeenCalled()
    })

    it('nace en Pendiente, is_print default false, company_id siempre de env', async () => {
      queryMock.mockResolvedValue({ rows: [{ id: 'cnp-1', status: 'Pendiente' }] })
      await createCnp({
        client_id: 'client-1',
        title: 'Post urgente',
        created_by: 'w1',
        company_id: 'otra-empresa',
      })
      const [sql, params] = queryMock.mock.calls[0]
      expect(sql).toContain("'Pendiente'")
      expect(params[0]).toBe('company-1')
      expect(params).toContain(false) // is_print
      expect(releaseMock).toHaveBeenCalled()
    })

    it('filtra refs sin url', async () => {
      queryMock.mockResolvedValue({ rows: [{ id: 'cnp-1' }] })
      await createCnp({
        client_id: 'client-1',
        title: 'x',
        refs: [
          { url: 'https://a.com', note: 'ok' },
          { url: '  ', note: 'sin url' },
          { note: 'sin url' },
        ],
        created_by: 'w1',
      })
      const [, params] = queryMock.mock.calls[0]
      const refs = JSON.parse(params.find((p) => typeof p === 'string' && p.startsWith('[')))
      expect(refs).toEqual([{ url: 'https://a.com', note: 'ok' }])
    })
  })

  describe('updateCnp', () => {
    it('rechaza sin id', async () => {
      await expect(updateCnp({ title: 'x' })).rejects.toThrow(ValidationError)
      expect(connectMock).not.toHaveBeenCalled()
    })

    it('rechaza un status fuera del enum', async () => {
      await expect(updateCnp({ id: 'cnp-1', status: 'Volando' })).rejects.toThrow(ValidationError)
    })

    it('nunca acepta team_checked_at/print_approved_at como columnas — no están en el whitelist', async () => {
      queryMock.mockResolvedValue({ rows: [{ id: 'cnp-1' }] })
      await updateCnp({
        id: 'cnp-1',
        notes: 'algo',
        team_checked_at: '2026-01-01T00:00:00Z',
        print_approved_at: '2026-01-01T00:00:00Z',
      })
      const [sql] = queryMock.mock.calls[0]
      const setClause = sql.split(' where ')[0]
      // El RETURNING sí puede leerlos (son visibles); lo que no debe pasar es que
      // aparezcan como columna asignable en el SET.
      expect(setClause).not.toContain('team_checked_at')
      expect(setClause).not.toContain('print_approved_at')
    })

    it('cerrar un CNP is_print sin los dos checks se rechaza con el motivo legible', async () => {
      runInternalQueryMock.mockResolvedValue({
        rows: [{ is_print: true, team_checked_at: null, print_approved_at: null }],
      })
      await expect(updateCnp({ id: 'cnp-1', status: 'Terminado' })).rejects.toThrow(
        /revisión del equipo/,
      )
      expect(connectMock).not.toHaveBeenCalled()
    })

    it('cerrar un CNP is_print con solo el check 1 se rechaza pidiendo la aprobación de impresión', async () => {
      runInternalQueryMock.mockResolvedValue({
        rows: [
          { is_print: true, team_checked_at: '2026-01-01T00:00:00Z', print_approved_at: null },
        ],
      })
      await expect(updateCnp({ id: 'cnp-1', status: 'Terminado' })).rejects.toThrow(/impresión/)
    })

    it('cerrar un CNP is_print con los dos checks sí procede', async () => {
      runInternalQueryMock.mockResolvedValue({
        rows: [
          {
            is_print: true,
            team_checked_at: '2026-01-01T00:00:00Z',
            print_approved_at: '2026-01-02T00:00:00Z',
          },
        ],
      })
      queryMock.mockResolvedValue({ rows: [{ id: 'cnp-1', status: 'Terminado' }] })
      const result = await updateCnp({ id: 'cnp-1', status: 'Terminado' })
      expect(result.status).toBe('Terminado')
    })

    it('cerrar un CNP no impreso no consulta los checks', async () => {
      queryMock.mockResolvedValue({ rows: [{ id: 'cnp-1', status: 'Terminado' }] })
      await updateCnp({ id: 'cnp-1', status: 'Terminado', is_print: false })
      expect(runInternalQueryMock).not.toHaveBeenCalled()
    })

    it('cambiar a is_print:true en el mismo patch que Terminado también dispara el check', async () => {
      runInternalQueryMock.mockResolvedValue({
        rows: [{ is_print: false, team_checked_at: null, print_approved_at: null }],
      })
      await expect(updateCnp({ id: 'cnp-1', status: 'Terminado', is_print: true })).rejects.toThrow(
        /revisión del equipo/,
      )
    })

    it('un patch sin ningún campo se rechaza', async () => {
      await expect(updateCnp({ id: 'cnp-1' })).rejects.toThrow(ValidationError)
    })

    it('scopea el UPDATE por company_id y deleted_at is null', async () => {
      queryMock.mockResolvedValue({ rows: [{ id: 'cnp-1' }] })
      await updateCnp({ id: 'cnp-1', notes: 'algo' })
      const [sql, params] = queryMock.mock.calls[0]
      expect(sql).toContain('deleted_at is null')
      expect(params).toContain('company-1')
    })

    it('lanza si no encuentra el CNP en esa empresa', async () => {
      queryMock.mockResolvedValue({ rows: [], rowCount: 0 })
      await expect(updateCnp({ id: 'cnp-ajeno', notes: 'x' })).rejects.toThrow(/no encontrado/)
    })
  })

  describe('softDeleteCnp', () => {
    it('rechaza sin id', async () => {
      await expect(softDeleteCnp({})).rejects.toThrow(ValidationError)
      expect(connectMock).not.toHaveBeenCalled()
    })

    it('hace un UPDATE de deleted_at, no un DELETE', async () => {
      queryMock.mockResolvedValue({ rows: [{ id: 'cnp-1' }], rowCount: 1 })
      const result = await softDeleteCnp({ id: 'cnp-1' })
      const [sql, params] = queryMock.mock.calls[0]
      expect(sql).toContain('update public.cnp_requests set deleted_at')
      expect(sql).not.toContain('delete from')
      expect(params).toEqual([expect.any(String), 'cnp-1', 'company-1'])
      expect(result).toEqual({ id: 'cnp-1' })
    })

    it('lanza si no encuentra el CNP en esa empresa', async () => {
      queryMock.mockResolvedValue({ rows: [], rowCount: 0 })
      await expect(softDeleteCnp({ id: 'cnp-ajeno' })).rejects.toThrow(/no encontrado/)
    })
  })
})
