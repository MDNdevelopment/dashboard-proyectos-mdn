import { describe, it, expect, vi, beforeEach } from 'vitest'

const requireCapabilityMock = vi.fn()
const inviteUserByEmailMock = vi.fn()
const fromMock = vi.fn()

vi.mock('./requireCapability.js', () => ({ requireCapability: requireCapabilityMock }))
vi.mock('./supabase.js', () => ({
  supabase: {
    auth: { admin: { inviteUserByEmail: (...args) => inviteUserByEmailMock(...args) } },
    from: (...args) => fromMock(...args),
  },
}))

const { handler } = await import('../create-employee.js')

function makeEvent(body) {
  return { httpMethod: 'POST', body: JSON.stringify(body) }
}

// Builder para el SELECT de duplicados: select().eq().ilike().maybeSingle()
function selectChain(result) {
  const builder = {
    select: () => builder,
    eq: () => builder,
    ilike: () => builder,
    maybeSingle: async () => result,
  }
  return builder
}

// Builder para el INSERT: refleja el payload recibido en vez de uno fijo, para poder
// verificar que el clamp de admin/access_level realmente afectó lo que se insertó.
function insertChain() {
  const builder = {
    insert: (payload) => {
      builder._payload = payload
      return builder
    },
    select: () => builder,
    single: async () => ({
      data: { user_id: 'new-user-id', ...builder._payload },
      error: null,
    }),
  }
  return builder
}

const BODY = {
  email: 'nueva@mdnpublicidad.com',
  first_name: 'Nueva',
  last_name: 'Persona',
  access_level: 4,
  admin: true, // intento de escalada
}

describe('create-employee.js handler — anti-escalada', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    inviteUserByEmailMock.mockResolvedValue({
      data: { user: { id: 'new-user-id' } },
      error: null,
    })
  })

  it('propaga el error de requireCapability (403 sin la capacidad)', async () => {
    requireCapabilityMock.mockResolvedValue({
      error: { statusCode: 403, body: '{"error":"Forbidden"}' },
    })
    const res = await handler(makeEvent(BODY))
    expect(res.statusCode).toBe(403)
    expect(inviteUserByEmailMock).not.toHaveBeenCalled()
  })

  it('un caller no-admin (con empresa.empleados.manage) no puede otorgar admin ni nivel alto: quedan clampeados', async () => {
    requireCapabilityMock.mockResolvedValue({
      caller: { user_id: 'rrhh-1', admin: false, company_id: 'c1' },
    })
    fromMock
      .mockReturnValueOnce(selectChain({ data: null, error: null })) // check de duplicado
      .mockReturnValueOnce(insertChain()) // insert

    const res = await handler(makeEvent(BODY))

    expect(res.statusCode).toBe(201)
    const created = JSON.parse(res.body)
    expect(created.admin).toBe(false)
    expect(created.access_level).toBe(3) // clamp: min(4, 3)
  })

  it('un caller admin sí puede otorgar admin y cualquier nivel', async () => {
    requireCapabilityMock.mockResolvedValue({
      caller: { user_id: 'admin-1', admin: true, company_id: 'c1' },
    })
    fromMock
      .mockReturnValueOnce(selectChain({ data: null, error: null }))
      .mockReturnValueOnce(insertChain())

    const res = await handler(makeEvent(BODY))

    expect(res.statusCode).toBe(201)
    const created = JSON.parse(res.body)
    expect(created.admin).toBe(true)
    expect(created.access_level).toBe(4)
  })
})
