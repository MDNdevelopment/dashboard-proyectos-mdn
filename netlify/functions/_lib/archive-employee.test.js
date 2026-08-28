import { describe, it, expect, vi, beforeEach } from 'vitest'

const requireCapabilityMock = vi.fn()
const updateUserByIdMock = vi.fn()
const fromMock = vi.fn()

vi.mock('./requireCapability.js', () => ({ requireCapability: requireCapabilityMock }))
vi.mock('./supabase.js', () => ({
  supabase: {
    auth: { admin: { updateUserById: (...args) => updateUserByIdMock(...args) } },
    from: (...args) => fromMock(...args),
  },
}))

const { handler } = await import('../archive-employee.js')

function makeEvent(body) {
  return { httpMethod: 'POST', body: JSON.stringify(body) }
}

// Builder para el SELECT del empleado objetivo: select().eq().single()
function targetChain(result) {
  const builder = {
    select: () => builder,
    eq: () => builder,
    single: async () => result,
  }
  return builder
}

// Builder para el UPDATE de deleted_at: select().eq().update().eq().select().maybeSingle()
function updateChain(result) {
  const builder = {
    update: (payload) => {
      builder._payload = payload
      return builder
    },
    eq: () => builder,
    select: () => builder,
    maybeSingle: async () =>
      result ?? {
        data: { user_id: 'u1', ...builder._payload },
        error: null,
      },
  }
  return builder
}

const BODY = { user_id: 'u1', action: 'archive' }

describe('archive-employee.js handler', () => {
  beforeEach(() => vi.clearAllMocks())

  it('archiva correctamente: banea en auth y marca deleted_at en users', async () => {
    requireCapabilityMock.mockResolvedValue({
      caller: { user_id: 'rrhh-1', admin: false, access_level: 2, company_id: 'c1' },
    })
    fromMock
      .mockReturnValueOnce(targetChain({ data: { user_id: 'u1', company_id: 'c1' }, error: null }))
      .mockReturnValueOnce(updateChain())
    updateUserByIdMock.mockResolvedValue({ error: null })

    const res = await handler(makeEvent(BODY))

    expect(res.statusCode).toBe(200)
    expect(updateUserByIdMock).toHaveBeenCalledWith('u1', { ban_duration: '876000h' })
  })

  // Este es el bug real: el trigger prevent_users_privilege_escalation evaluaba
  // is_company_admin() con auth.uid() = NULL (service_role) => false => abortaba
  // CUALQUIER UPDATE que tocara deleted_at, que es justo lo que escribe siempre este
  // endpoint. La migración 20260908000000 exime a service_role del trigger; aquí solo
  // verificamos que, si el UPDATE no devuelve fila, no explota con el error crudo de
  // PostgREST sino con un mensaje en español.
  it('si el UPDATE no devuelve fila (bloqueado por un trigger), responde 500 en español', async () => {
    requireCapabilityMock.mockResolvedValue({
      caller: { user_id: 'admin-1', admin: true, access_level: 4, company_id: 'c1' },
    })
    fromMock
      .mockReturnValueOnce(targetChain({ data: { user_id: 'u1', company_id: 'c1' }, error: null }))
      .mockReturnValueOnce(updateChain({ data: null, error: null }))
    updateUserByIdMock.mockResolvedValue({ error: null })

    const res = await handler(makeEvent(BODY))

    expect(res.statusCode).toBe(500)
    const body = JSON.parse(res.body)
    expect(body.error).not.toMatch(/JSON object requested/i)
    expect(body.error).toMatch(/no se pudo/i)
  })

  it('rechaza archivar la propia cuenta', async () => {
    requireCapabilityMock.mockResolvedValue({
      caller: { user_id: 'u1', admin: false, access_level: 2, company_id: 'c1' },
    })
    const res = await handler(makeEvent({ user_id: 'u1', action: 'archive' }))
    expect(res.statusCode).toBe(400)
    expect(fromMock).not.toHaveBeenCalled()
  })

  it('rechaza editar un empleado de otra empresa (403)', async () => {
    requireCapabilityMock.mockResolvedValue({
      caller: { user_id: 'rrhh-1', admin: false, access_level: 2, company_id: 'c1' },
    })
    fromMock.mockReturnValueOnce(
      targetChain({ data: { user_id: 'u1', company_id: 'otra-empresa' }, error: null }),
    )
    const res = await handler(makeEvent(BODY))
    expect(res.statusCode).toBe(403)
  })
})
