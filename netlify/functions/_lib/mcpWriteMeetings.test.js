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

describe('mcpWriteMeetings', () => {
  let createMeeting, updateMeeting, deleteMeeting, ValidationError

  beforeEach(async () => {
    vi.clearAllMocks()
    queryMock.mockReset()
    runInternalQueryMock.mockReset()
    runInternalQueryMock.mockResolvedValue({ rows: [] })
    process.env.SUPABASE_WRITER_DB_URL = 'postgres://mcp_writer:x@localhost:5432/postgres'
    process.env.MCP_COMPANY_ID = 'company-1'
    vi.resetModules()
    ;({ createMeeting, updateMeeting, deleteMeeting } = await import('./mcpWriteMeetings.js'))
    ;({ ValidationError } = await import('./mcpWrite.js'))
  })

  describe('createMeeting', () => {
    it('rechaza sin title ni starts_at', async () => {
      await expect(createMeeting({ starts_at: '2026-10-01T00:00:00Z' })).rejects.toThrow(
        ValidationError,
      )
      await expect(createMeeting({ title: 'x' })).rejects.toThrow(ValidationError)
      expect(connectMock).not.toHaveBeenCalled()
    })

    it('rechaza una modality inválida', async () => {
      await expect(
        createMeeting({ title: 'x', starts_at: 'y', modality: 'telepatía' }),
      ).rejects.toThrow(ValidationError)
    })

    it('sin client_ids, inserta con snapshot vacío y no consulta metric_clients', async () => {
      queryMock.mockResolvedValue({ rows: [{ id: 'meeting-1' }] })
      await createMeeting({ title: 'Kickoff', starts_at: '2026-10-01T14:00:00Z', created_by: 'w1' })
      expect(runInternalQueryMock).not.toHaveBeenCalled()
      const [, params] = queryMock.mock.calls[0]
      // client_id, client_name, client_ids, client_names, line_id, line_ids → últimos 6
      expect(params.slice(-6)).toEqual([null, null, [], [], null, []])
    })

    it('resuelve el snapshot posicional de clientes preservando el orden de entrada', async () => {
      runInternalQueryMock.mockResolvedValue({
        rows: [
          { id: 'c2', name: 'Marca B', line_id: 'line-2' },
          { id: 'c1', name: 'Marca A', line_id: 'line-1' },
        ],
      })
      queryMock.mockResolvedValue({ rows: [{ id: 'meeting-1' }] })
      await createMeeting({
        title: 'Reunión multi-marca',
        starts_at: '2026-10-01T14:00:00Z',
        client_ids: ['c1', 'c2'],
        created_by: 'w1',
      })
      const [, params] = queryMock.mock.calls[0]
      const [clientId, clientName, clientIds, clientNames, lineId, lineIds] = params.slice(-6)
      expect(clientIds).toEqual(['c1', 'c2'])
      expect(clientNames).toEqual(['Marca A', 'Marca B'])
      expect(lineId).toBe('line-1')
      expect(clientId).toBe('c1')
      expect(clientName).toBe('Marca A')
      expect(lineIds).toEqual(['line-1', 'line-2'])
    })

    it('exclusión mutua de modalidad: presencial solo persiste location', async () => {
      queryMock.mockResolvedValue({ rows: [{ id: 'meeting-1' }] })
      await createMeeting({
        title: 'x',
        starts_at: 'y',
        modality: 'presencial',
        location: 'Oficina',
        meeting_url: 'https://meet.example/should-be-dropped',
        created_by: 'w1',
      })
      const [, params] = queryMock.mock.calls[0]
      // orden: company_id, title, starts_at, ends_at, modality, location, meeting_url, ...
      expect(params[5]).toBe('Oficina')
      expect(params[6]).toBeNull()
    })

    it('company_id sale siempre de env, nunca de los args', async () => {
      queryMock.mockResolvedValue({ rows: [{ id: 'meeting-1' }] })
      await createMeeting({
        title: 'x',
        starts_at: 'y',
        created_by: 'w1',
        company_id: 'otra-empresa',
      })
      const [, params] = queryMock.mock.calls[0]
      expect(params[0]).toBe('company-1')
      expect(releaseMock).toHaveBeenCalled()
    })
  })

  describe('updateMeeting', () => {
    it('rechaza sin id', async () => {
      await expect(updateMeeting({ title: 'x' })).rejects.toThrow(ValidationError)
      expect(connectMock).not.toHaveBeenCalled()
    })

    it('rechaza sin ningún campo para actualizar', async () => {
      await expect(updateMeeting({ id: 'meeting-1' })).rejects.toThrow(ValidationError)
    })

    it('arma el SET solo con las columnas del whitelist presentes en el patch', async () => {
      queryMock.mockResolvedValue({ rows: [{ id: 'meeting-1', status: 'cancelada' }] })
      await updateMeeting({ id: 'meeting-1', status: 'cancelada' })
      const [sql, params] = queryMock.mock.calls[0]
      expect(sql).toContain('status = $1')
      expect(sql).toContain('updated_at = $2')
      expect(sql).toContain('where id = $3 and company_id = $4')
      expect(params).toEqual(['cancelada', expect.any(String), 'meeting-1', 'company-1'])
    })

    it('reagendar (starts_at) una reunión ya realizada, sin status explícito, la vuelve a programada', async () => {
      runInternalQueryMock.mockResolvedValue({ rows: [{ status: 'realizada' }] })
      queryMock.mockResolvedValue({ rows: [{ id: 'meeting-1' }] })
      await updateMeeting({ id: 'meeting-1', starts_at: '2026-11-01T10:00:00Z' })
      expect(runInternalQueryMock).toHaveBeenCalledWith(expect.stringContaining('select status'), [
        'meeting-1',
        'company-1',
      ])
      const [, params] = queryMock.mock.calls[0]
      expect(params).toContain('programada')
    })

    it('reagendar con status explícito no consulta el estado actual ni lo pisa', async () => {
      queryMock.mockResolvedValue({ rows: [{ id: 'meeting-1' }] })
      await updateMeeting({
        id: 'meeting-1',
        starts_at: '2026-11-01T10:00:00Z',
        status: 'realizada',
      })
      expect(runInternalQueryMock).not.toHaveBeenCalled()
      const [, params] = queryMock.mock.calls[0]
      expect(params).toContain('realizada')
    })

    it('client_ids ausente del patch no toca los clientes ni consulta metric_clients', async () => {
      queryMock.mockResolvedValue({ rows: [{ id: 'meeting-1' }] })
      await updateMeeting({ id: 'meeting-1', notes: 'algo' })
      expect(runInternalQueryMock).not.toHaveBeenCalled()
      const [sql] = queryMock.mock.calls[0]
      expect(sql).not.toContain('client_ids')
    })

    it('client_ids = [] en el patch vacía los clientes (client_id escalar a null, arreglos a [])', async () => {
      queryMock.mockResolvedValue({ rows: [{ id: 'meeting-1' }] })
      await updateMeeting({ id: 'meeting-1', client_ids: [] })
      const [sql, params] = queryMock.mock.calls[0]
      expect(sql).toContain('client_ids')
      const clientIdIdx = sql.match(/client_id = \$(\d+)/)[1] - 1
      const clientIdsIdx = sql.match(/client_ids = \$(\d+)/)[1] - 1
      expect(params[clientIdIdx]).toBeNull()
      expect(params[clientIdsIdx]).toEqual([])
      expect(runInternalQueryMock).not.toHaveBeenCalled() // sin ids que resolver, no consulta metric_clients
    })

    it('exclusión mutua: cambiar a videollamada anula location', async () => {
      queryMock.mockResolvedValue({ rows: [{ id: 'meeting-1' }] })
      await updateMeeting({
        id: 'meeting-1',
        modality: 'videollamada',
        meeting_url: 'https://meet.example/x',
        location: 'debería ignorarse',
      })
      const [sql, params] = queryMock.mock.calls[0]
      const modalityIdx = sql.match(/modality = \$(\d+)/)[1] - 1
      const locationIdx = sql.match(/location = \$(\d+)/)[1] - 1
      expect(params[modalityIdx]).toBe('videollamada')
      expect(params[locationIdx]).toBeNull()
    })

    it('propaga "Reunión no encontrada" cuando el UPDATE no afecta filas (otra empresa)', async () => {
      queryMock.mockResolvedValue({ rows: [], rowCount: 0 })
      await expect(updateMeeting({ id: 'meeting-ajena', notes: 'x' })).rejects.toThrow(
        /no encontrada/,
      )
    })
  })

  describe('deleteMeeting', () => {
    it('rechaza sin id', async () => {
      await expect(deleteMeeting({})).rejects.toThrow(ValidationError)
      expect(connectMock).not.toHaveBeenCalled()
    })

    it('hace un DELETE (borrado duro) acotado por company_id', async () => {
      queryMock.mockResolvedValue({ rows: [{ id: 'meeting-1' }], rowCount: 1 })
      const result = await deleteMeeting({ id: 'meeting-1' })
      const [sql, params] = queryMock.mock.calls[0]
      expect(sql).toContain('delete from public.meetings')
      expect(params).toEqual(['meeting-1', 'company-1'])
      expect(result).toEqual({ id: 'meeting-1' })
      expect(releaseMock).toHaveBeenCalled()
    })

    it('lanza si no encuentra la reunión en esa empresa', async () => {
      queryMock.mockResolvedValue({ rows: [], rowCount: 0 })
      await expect(deleteMeeting({ id: 'meeting-ajena' })).rejects.toThrow(/no encontrada/)
    })
  })
})
