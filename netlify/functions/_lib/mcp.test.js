import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('./db.js', () => ({
  runReadOnlyQuery: vi.fn(),
  listTables: vi.fn(),
}))

vi.mock('./mcpWrite.js', () => ({
  createTask: vi.fn(),
}))

vi.mock('./mcpWriteMeetings.js', () => ({
  createMeeting: vi.fn(),
  updateMeeting: vi.fn(),
  deleteMeeting: vi.fn(),
}))

vi.mock('./mcpWriteCnp.js', () => ({
  createCnp: vi.fn(),
  updateCnp: vi.fn(),
  softDeleteCnp: vi.fn(),
}))

process.env.MCP_OAUTH_SIGNING_SECRET = 'test-signing-secret'

const { runReadOnlyQuery, listTables } = await import('./db.js')
const { createTask } = await import('./mcpWrite.js')
const { createMeeting, updateMeeting, deleteMeeting } = await import('./mcpWriteMeetings.js')
const { createCnp, updateCnp, softDeleteCnp } = await import('./mcpWriteCnp.js')
const { handler, checkBearerToken } = await import('../mcp.js')
const { issueToken } = await import('./oauthCrypto.js')

function accessToken(overrides = {}) {
  return issueToken({ type: 'access', exp: Date.now() + 60_000, ...overrides })
}

function writerToken(userId = 'writer-uid-1') {
  return accessToken({ role: 'writer', userId })
}

function makeEvent({ method = 'POST', path = '/mcp', token = accessToken(), body } = {}) {
  return {
    httpMethod: method,
    path,
    headers: token ? { authorization: `Bearer ${token}` } : {},
    body: body === undefined ? undefined : JSON.stringify(body),
  }
}

describe('mcp.js handler', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.MCP_OAUTH_SIGNING_SECRET = 'test-signing-secret'
  })

  it('rechaza métodos que no sean POST', async () => {
    const res = await handler(makeEvent({ method: 'GET' }))
    expect(res.statusCode).toBe(405)
  })

  it('rechaza sin Authorization header, con WWW-Authenticate apuntando al resource metadata', async () => {
    const res = await handler(
      makeEvent({ token: null, body: { jsonrpc: '2.0', id: 1, method: 'ping' } }),
    )
    expect(res.statusCode).toBe(401)
    expect(res.headers['WWW-Authenticate']).toContain('oauth-protected-resource')
  })

  it('rechaza un access_token con firma inválida', async () => {
    const res = await handler(
      makeEvent({ token: 'garbage.token', body: { jsonrpc: '2.0', id: 1, method: 'ping' } }),
    )
    expect(res.statusCode).toBe(401)
  })

  it('rechaza un access_token expirado', async () => {
    const expired = issueToken({ type: 'access', exp: Date.now() - 1 })
    const res = await handler(
      makeEvent({ token: expired, body: { jsonrpc: '2.0', id: 1, method: 'ping' } }),
    )
    expect(res.statusCode).toBe(401)
  })

  it('rechaza un token de otro type (p.ej. un authorization code, no un access token)', async () => {
    const code = issueToken({ type: 'code', exp: Date.now() + 60_000 })
    const res = await handler(
      makeEvent({ token: code, body: { jsonrpc: '2.0', id: 1, method: 'ping' } }),
    )
    expect(res.statusCode).toBe(401)
  })

  it('checkBearerToken acepta un access_token válido', () => {
    const token = accessToken()
    expect(checkBearerToken({ headers: { authorization: `Bearer ${token}` } })).toBe(true)
  })

  it('responde initialize con las capabilities', async () => {
    const res = await handler(makeEvent({ body: { jsonrpc: '2.0', id: 1, method: 'initialize' } }))
    const parsed = JSON.parse(res.body)
    expect(res.statusCode).toBe(200)
    expect(parsed.result.protocolVersion).toBe('2024-11-05')
    expect(parsed.result.capabilities).toEqual({ tools: {} })
  })

  it('responde tools/list con las dos tools de lectura para un token reader', async () => {
    const res = await handler(makeEvent({ body: { jsonrpc: '2.0', id: 2, method: 'tools/list' } }))
    const parsed = JSON.parse(res.body)
    const names = parsed.result.tools.map((t) => t.name)
    expect(names).toEqual(['list_tables', 'query_database'])
  })

  it('responde tools/list con las 7 tools de escritura incluidas para un token writer', async () => {
    const res = await handler(
      makeEvent({ token: writerToken(), body: { jsonrpc: '2.0', id: 2, method: 'tools/list' } }),
    )
    const parsed = JSON.parse(res.body)
    const names = parsed.result.tools.map((t) => t.name)
    expect(names).toEqual([
      'list_tables',
      'query_database',
      'create_task',
      'create_meeting',
      'update_meeting',
      'delete_meeting',
      'create_cnp',
      'update_cnp',
      'delete_cnp',
    ])
  })

  it('tools/call list_tables delega en listTables()', async () => {
    listTables.mockResolvedValue([{ table_name: 'projects', column_name: 'id' }])
    const res = await handler(
      makeEvent({
        body: {
          jsonrpc: '2.0',
          id: 3,
          method: 'tools/call',
          params: { name: 'list_tables', arguments: {} },
        },
      }),
    )
    const parsed = JSON.parse(res.body)
    expect(listTables).toHaveBeenCalled()
    expect(parsed.result.content[0].text).toContain('projects')
  })

  it('tools/call query_database delega en runReadOnlyQuery() con sql y limit', async () => {
    runReadOnlyQuery.mockResolvedValue({ rows: [{ count: 5 }], rowCount: 1 })
    const res = await handler(
      makeEvent({
        body: {
          jsonrpc: '2.0',
          id: 4,
          method: 'tools/call',
          params: {
            name: 'query_database',
            arguments: { sql: 'select count(*) from projects', limit: 10 },
          },
        },
      }),
    )
    const parsed = JSON.parse(res.body)
    expect(runReadOnlyQuery).toHaveBeenCalledWith('select count(*) from projects', 10)
    expect(parsed.result.content[0].text).toContain('count')
  })

  it('tools/call devuelve isError:true (no error de transporte) si la query falla', async () => {
    runReadOnlyQuery.mockRejectedValue(
      new Error('Solo se permiten consultas SELECT o WITH...SELECT'),
    )
    const res = await handler(
      makeEvent({
        body: {
          jsonrpc: '2.0',
          id: 5,
          method: 'tools/call',
          params: { name: 'query_database', arguments: { sql: 'drop table projects' } },
        },
      }),
    )
    const parsed = JSON.parse(res.body)
    expect(res.statusCode).toBe(200)
    expect(parsed.result.isError).toBe(true)
    expect(parsed.result.content[0].text).toMatch(/SELECT/)
  })

  it('tools/call create_task con token writer delega en createTask() con el created_by resuelto del token', async () => {
    createTask.mockResolvedValue({ id: 'task-1', status: 'Pendiente' })
    const args = { team_id: 'team-1', assignee_ids: ['user-1'], description: 'Hacer algo' }
    const res = await handler(
      makeEvent({
        token: writerToken('writer-uid-1'),
        body: {
          jsonrpc: '2.0',
          id: 8,
          method: 'tools/call',
          params: { name: 'create_task', arguments: args },
        },
      }),
    )
    const parsed = JSON.parse(res.body)
    expect(createTask).toHaveBeenCalledWith({ ...args, created_by: 'writer-uid-1' })
    expect(parsed.result.content[0].text).toContain('Pendiente')
  })

  it('tools/call create_task ignora un created_by que venga en los argumentos del modelo, usa el del token', async () => {
    createTask.mockResolvedValue({ id: 'task-1' })
    const args = {
      team_id: 'team-1',
      assignee_ids: ['user-1'],
      description: 'Hacer algo',
      created_by: 'alguien-que-el-modelo-inventó',
    }
    await handler(
      makeEvent({
        token: writerToken('writer-uid-2'),
        body: {
          jsonrpc: '2.0',
          id: 11,
          method: 'tools/call',
          params: { name: 'create_task', arguments: args },
        },
      }),
    )
    expect(createTask).toHaveBeenCalledWith(expect.objectContaining({ created_by: 'writer-uid-2' }))
  })

  it('tools/call create_task con token reader (sin role writer) devuelve isError:true y no llama a createTask', async () => {
    const res = await handler(
      makeEvent({
        body: {
          jsonrpc: '2.0',
          id: 9,
          method: 'tools/call',
          params: {
            name: 'create_task',
            arguments: { team_id: 'x', assignee_ids: ['y'], description: 'z' },
          },
        },
      }),
    )
    const parsed = JSON.parse(res.body)
    expect(createTask).not.toHaveBeenCalled()
    expect(parsed.result.isError).toBe(true)
    expect(parsed.result.content[0].text).toMatch(/escritura/)
  })

  it('tools/call create_task propaga errores de validación como isError:true', async () => {
    createTask.mockRejectedValue(new Error('team_id es requerido'))
    const res = await handler(
      makeEvent({
        token: writerToken(),
        body: {
          jsonrpc: '2.0',
          id: 10,
          method: 'tools/call',
          params: { name: 'create_task', arguments: { assignee_ids: ['y'], description: 'z' } },
        },
      }),
    )
    const parsed = JSON.parse(res.body)
    expect(parsed.result.isError).toBe(true)
    expect(parsed.result.content[0].text).toMatch(/team_id/)
  })

  it('tools/call create_meeting con token writer delega en createMeeting() con el created_by resuelto del token', async () => {
    createMeeting.mockResolvedValue({ id: 'meeting-1', status: 'programada' })
    const args = { title: 'Kickoff', starts_at: '2026-10-01T14:00:00Z' }
    const res = await handler(
      makeEvent({
        token: writerToken('writer-uid-1'),
        body: {
          jsonrpc: '2.0',
          id: 12,
          method: 'tools/call',
          params: { name: 'create_meeting', arguments: args },
        },
      }),
    )
    const parsed = JSON.parse(res.body)
    expect(createMeeting).toHaveBeenCalledWith({ ...args, created_by: 'writer-uid-1' })
    expect(parsed.result.content[0].text).toContain('programada')
  })

  it('tools/call create_meeting con token reader devuelve isError:true y no llama a createMeeting', async () => {
    const res = await handler(
      makeEvent({
        body: {
          jsonrpc: '2.0',
          id: 13,
          method: 'tools/call',
          params: { name: 'create_meeting', arguments: { title: 'x', starts_at: 'y' } },
        },
      }),
    )
    const parsed = JSON.parse(res.body)
    expect(createMeeting).not.toHaveBeenCalled()
    expect(parsed.result.isError).toBe(true)
    expect(parsed.result.content[0].text).toMatch(/escritura/)
  })

  it('tools/call update_meeting delega en updateMeeting() sin inyectar created_by', async () => {
    updateMeeting.mockResolvedValue({ id: 'meeting-1', status: 'cancelada' })
    const args = { id: 'meeting-1', status: 'cancelada' }
    await handler(
      makeEvent({
        token: writerToken('writer-uid-1'),
        body: {
          jsonrpc: '2.0',
          id: 14,
          method: 'tools/call',
          params: { name: 'update_meeting', arguments: args },
        },
      }),
    )
    expect(updateMeeting).toHaveBeenCalledWith(args)
  })

  it('tools/call delete_meeting delega en deleteMeeting()', async () => {
    deleteMeeting.mockResolvedValue({ id: 'meeting-1' })
    await handler(
      makeEvent({
        token: writerToken(),
        body: {
          jsonrpc: '2.0',
          id: 15,
          method: 'tools/call',
          params: { name: 'delete_meeting', arguments: { id: 'meeting-1' } },
        },
      }),
    )
    expect(deleteMeeting).toHaveBeenCalledWith({ id: 'meeting-1' })
  })

  it('tools/call create_cnp con token writer delega en createCnp() con el created_by resuelto del token', async () => {
    createCnp.mockResolvedValue({ id: 'cnp-1', status: 'Pendiente' })
    const args = { client_id: 'client-1', title: 'Post urgente' }
    const res = await handler(
      makeEvent({
        token: writerToken('writer-uid-1'),
        body: {
          jsonrpc: '2.0',
          id: 16,
          method: 'tools/call',
          params: { name: 'create_cnp', arguments: args },
        },
      }),
    )
    const parsed = JSON.parse(res.body)
    expect(createCnp).toHaveBeenCalledWith({ ...args, created_by: 'writer-uid-1' })
    expect(parsed.result.content[0].text).toContain('Pendiente')
  })

  it('tools/call create_cnp con token reader devuelve isError:true y no llama a createCnp', async () => {
    const res = await handler(
      makeEvent({
        body: {
          jsonrpc: '2.0',
          id: 17,
          method: 'tools/call',
          params: { name: 'create_cnp', arguments: { client_id: 'x', title: 'y' } },
        },
      }),
    )
    const parsed = JSON.parse(res.body)
    expect(createCnp).not.toHaveBeenCalled()
    expect(parsed.result.isError).toBe(true)
    expect(parsed.result.content[0].text).toMatch(/escritura/)
  })

  it('tools/call update_cnp propaga como isError:true el rechazo por doble check de impresión pendiente', async () => {
    updateCnp.mockRejectedValue(new Error('Falta la aprobación de impresión'))
    const res = await handler(
      makeEvent({
        token: writerToken(),
        body: {
          jsonrpc: '2.0',
          id: 18,
          method: 'tools/call',
          params: { name: 'update_cnp', arguments: { id: 'cnp-1', status: 'Terminado' } },
        },
      }),
    )
    const parsed = JSON.parse(res.body)
    expect(parsed.result.isError).toBe(true)
    expect(parsed.result.content[0].text).toMatch(/impresión/)
  })

  it('tools/call delete_cnp delega en softDeleteCnp()', async () => {
    softDeleteCnp.mockResolvedValue({ id: 'cnp-1' })
    await handler(
      makeEvent({
        token: writerToken(),
        body: {
          jsonrpc: '2.0',
          id: 19,
          method: 'tools/call',
          params: { name: 'delete_cnp', arguments: { id: 'cnp-1' } },
        },
      }),
    )
    expect(softDeleteCnp).toHaveBeenCalledWith({ id: 'cnp-1' })
  })

  it('tools/call con nombre de tool desconocido devuelve isError:true', async () => {
    const res = await handler(
      makeEvent({
        body: {
          jsonrpc: '2.0',
          id: 6,
          method: 'tools/call',
          params: { name: 'delete_everything', arguments: {} },
        },
      }),
    )
    const parsed = JSON.parse(res.body)
    expect(parsed.result.isError).toBe(true)
  })

  it('responde 202 vacío a notifications/initialized', async () => {
    const res = await handler(
      makeEvent({ body: { jsonrpc: '2.0', method: 'notifications/initialized' } }),
    )
    expect(res.statusCode).toBe(202)
  })

  it('responde error JSON-RPC -32601 para un método desconocido', async () => {
    const res = await handler(
      makeEvent({ body: { jsonrpc: '2.0', id: 7, method: 'not/a/method' } }),
    )
    const parsed = JSON.parse(res.body)
    expect(parsed.error.code).toBe(-32601)
  })

  it('responde error de parseo si el body no es JSON válido', async () => {
    const event = makeEvent({ method: 'POST' })
    event.body = '{not json'
    const res = await handler(event)
    const parsed = JSON.parse(res.body)
    expect(res.statusCode).toBe(400)
    expect(parsed.error.code).toBe(-32700)
  })
})
