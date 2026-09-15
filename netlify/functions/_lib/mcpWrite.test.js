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

describe('createTask', () => {
  let createTask, TaskValidationError

  beforeEach(async () => {
    vi.clearAllMocks()
    queryMock.mockReset()
    process.env.SUPABASE_WRITER_DB_URL = 'postgres://mcp_writer:x@localhost:5432/postgres'
    process.env.MCP_COMPANY_ID = 'company-1'
    vi.resetModules()
    ;({ createTask, TaskValidationError } = await import('./mcpWrite.js'))
  })

  it('rechaza sin team_id', async () => {
    await expect(
      createTask({ assignee_ids: ['u1'], description: 'x', created_by: 'writer-1' }),
    ).rejects.toThrow(TaskValidationError)
    expect(connectMock).not.toHaveBeenCalled()
  })

  it('rechaza sin description', async () => {
    await expect(
      createTask({ team_id: 't1', assignee_ids: ['u1'], created_by: 'writer-1' }),
    ).rejects.toThrow(TaskValidationError)
  })

  it('rechaza assignee_ids vacío o ausente', async () => {
    await expect(
      createTask({ team_id: 't1', description: 'x', assignee_ids: [], created_by: 'writer-1' }),
    ).rejects.toThrow(TaskValidationError)
    await expect(
      createTask({ team_id: 't1', description: 'x', created_by: 'writer-1' }),
    ).rejects.toThrow(TaskValidationError)
  })

  it('rechaza sin created_by', async () => {
    await expect(
      createTask({ team_id: 't1', assignee_ids: ['u1'], description: 'x' }),
    ).rejects.toThrow(TaskValidationError)
    expect(connectMock).not.toHaveBeenCalled()
  })

  it('acepta cualquier created_by no vacío (la validación de quién puede escribir vive en oauth.js/mcp.js, no aquí)', async () => {
    queryMock.mockResolvedValue({ rows: [{ id: 'task-1' }] })
    await createTask({
      team_id: 't1',
      assignee_ids: ['u1'],
      description: 'x',
      created_by: 'writer-2',
    })
    const [, params] = queryMock.mock.calls[0]
    expect(params[8]).toBe('writer-2')
  })

  it('inserta con company_id fijo desde env var (nunca desde los args) y el created_by recibido', async () => {
    queryMock.mockResolvedValue({ rows: [{ id: 'task-1', status: 'Pendiente' }] })

    await createTask({
      team_id: 'team-1',
      assignee_ids: ['user-1', 'user-2'],
      description: '  Armar propuesta  ',
      client_id: 'client-1',
      client: 'Ecopack',
      due_date: '2026-09-18',
      created_by: 'writer-1',
      // Intento de suplantar company_id — debe ignorarse.
      company_id: 'otra-empresa',
    })

    expect(queryMock).toHaveBeenCalledWith(expect.stringContaining('insert into public.tasks'), [
      'company-1',
      'team-1',
      'client-1',
      'Ecopack',
      ['user-1', 'user-2'],
      'Armar propuesta',
      'MAPPI (voz)',
      '2026-09-18',
      'writer-1',
    ])
    expect(releaseMock).toHaveBeenCalled()
  })

  it('usa el source dado en vez del default cuando se provee', async () => {
    queryMock.mockResolvedValue({ rows: [{ id: 'task-1' }] })
    await createTask({
      team_id: 't1',
      assignee_ids: ['u1'],
      description: 'x',
      created_by: 'writer-1',
      source: 'Pedido por WhatsApp',
    })
    const [, params] = queryMock.mock.calls[0]
    expect(params[6]).toBe('Pedido por WhatsApp')
  })

  it('devuelve la fila creada', async () => {
    const row = { id: 'task-1', status: 'Pendiente' }
    queryMock.mockResolvedValue({ rows: [row] })
    const result = await createTask({
      team_id: 't1',
      assignee_ids: ['u1'],
      description: 'x',
      created_by: 'writer-1',
    })
    expect(result).toEqual(row)
  })
})
