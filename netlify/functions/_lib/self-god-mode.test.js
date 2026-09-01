import { describe, it, expect, vi, beforeEach } from 'vitest'

const requireUserMock = vi.fn()
const fromMock = vi.fn()

vi.mock('./requireUser.js', () => ({ requireUser: requireUserMock }))
vi.mock('./supabase.js', () => ({
  supabase: { from: (...args) => fromMock(...args) },
}))
vi.mock('../../../src/lib/ceoAnalysisAccess.js', () => ({
  CEO_ANALYSIS_USER_IDS: ['god-1'],
}))

const { handler } = await import('../self-god-mode.js')

function makeEvent(body) {
  return { httpMethod: 'POST', body: JSON.stringify(body) }
}

// Builder para el UPDATE: update().eq().select().maybeSingle()
function updateChain(result) {
  const builder = {
    update: (payload) => {
      builder._payload = payload
      return builder
    },
    eq: () => builder,
    select: () => builder,
    maybeSingle: async () =>
      result ?? { data: { user_id: 'god-1', ...builder._payload }, error: null },
  }
  return builder
}

describe('self-god-mode.js handler', () => {
  beforeEach(() => vi.clearAllMocks())

  it('permite al usuario de CEO_ANALYSIS_USER_IDS cambiar su propio admin/access_level', async () => {
    requireUserMock.mockResolvedValue({ caller: { user_id: 'god-1', company_id: 'c1' } })
    fromMock.mockReturnValueOnce(updateChain())

    const res = await handler(makeEvent({ admin: true, access_level: 4 }))

    expect(res.statusCode).toBe(200)
    const body = JSON.parse(res.body)
    expect(body.admin).toBe(true)
    expect(body.access_level).toBe(4)
  })

  it('rechaza a cualquier usuario que no esté en CEO_ANALYSIS_USER_IDS', async () => {
    requireUserMock.mockResolvedValue({ caller: { user_id: 'someone-else', company_id: 'c1' } })

    const res = await handler(makeEvent({ admin: true }))

    expect(res.statusCode).toBe(403)
    expect(fromMock).not.toHaveBeenCalled()
  })

  it('propaga el error de autenticación de requireUser', async () => {
    const authError = { statusCode: 401, body: JSON.stringify({ error: 'Unauthorized' }) }
    requireUserMock.mockResolvedValue({ error: authError })

    const res = await handler(makeEvent({ admin: true }))

    expect(res).toBe(authError)
  })

  it('devuelve 400 si el body no trae admin ni access_level', async () => {
    requireUserMock.mockResolvedValue({ caller: { user_id: 'god-1', company_id: 'c1' } })

    const res = await handler(makeEvent({}))

    expect(res.statusCode).toBe(400)
  })
})
