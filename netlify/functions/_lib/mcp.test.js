import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('./db.js', () => ({
  runReadOnlyQuery: vi.fn(),
  listTables: vi.fn(),
}))

process.env.MCP_OAUTH_SIGNING_SECRET = 'test-signing-secret'

const { runReadOnlyQuery, listTables } = await import('./db.js')
const { handler, checkBearerToken } = await import('../mcp.js')
const { issueToken } = await import('./oauthCrypto.js')

function accessToken(overrides = {}) {
  return issueToken({ type: 'access', exp: Date.now() + 60_000, ...overrides })
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

  it('responde tools/list con las dos tools', async () => {
    const res = await handler(makeEvent({ body: { jsonrpc: '2.0', id: 2, method: 'tools/list' } }))
    const parsed = JSON.parse(res.body)
    const names = parsed.result.tools.map((t) => t.name)
    expect(names).toEqual(['list_tables', 'query_database'])
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
