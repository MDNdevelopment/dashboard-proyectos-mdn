import { describe, it, expect, vi, beforeEach } from 'vitest'

const getUserMock = vi.fn()
const fromMock = vi.fn()

vi.mock('./supabase.js', () => ({
  supabase: {
    auth: { getUser: (...args) => getUserMock(...args) },
    from: (...args) => fromMock(...args),
  },
}))

const { requireCapability } = await import('./requireCapability.js')

// Builder encadenable mínimo: soporta select().eq().single() (perfil de usuario) y
// select().eq().eq().maybeSingle() (fila de module_permissions).
function chain(result) {
  const builder = {
    select: () => builder,
    eq: () => builder,
    single: async () => result,
    maybeSingle: async () => result,
  }
  return builder
}

function makeEvent(token = 'valid-token') {
  return { headers: token ? { authorization: `Bearer ${token}` } : {} }
}

const PROFILE_BASE = {
  user_id: 'u1',
  access_level: 2,
  department_id: 8,
  position_id: 62,
  company_id: 'c1',
  deleted_at: null,
}

describe('requireCapability', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getUserMock.mockResolvedValue({ data: { user: { id: 'u1' } }, error: null })
  })

  it('rechaza sin token (401)', async () => {
    const { error, caller } = await requireCapability(makeEvent(null), 'empresa.empleados.manage')
    expect(error.statusCode).toBe(401)
    expect(caller).toBeUndefined()
    expect(getUserMock).not.toHaveBeenCalled()
  })

  it('rechaza un JWT inválido (401)', async () => {
    getUserMock.mockResolvedValue({ data: { user: null }, error: { message: 'bad token' } })
    const { error } = await requireCapability(makeEvent(), 'empresa.empleados.manage')
    expect(error.statusCode).toBe(401)
  })

  it('rechaza un usuario archivado (401)', async () => {
    fromMock.mockReturnValueOnce(
      chain({ data: { ...PROFILE_BASE, deleted_at: '2026-01-01' }, error: null }),
    )
    const { error } = await requireCapability(makeEvent(), 'empresa.empleados.manage')
    expect(error.statusCode).toBe(401)
  })

  it('admin siempre pasa, sin consultar module_permissions', async () => {
    fromMock.mockReturnValueOnce(chain({ data: { ...PROFILE_BASE, admin: true }, error: null }))
    const { error, caller } = await requireCapability(makeEvent(), 'empresa.empleados.manage')
    expect(error).toBeUndefined()
    expect(caller.admin).toBe(true)
    expect(fromMock).toHaveBeenCalledTimes(1) // solo el perfil, no module_permissions
  })

  it('usuario con grant por user_id en module_permissions pasa (403 sin él)', async () => {
    fromMock
      .mockReturnValueOnce(chain({ data: { ...PROFILE_BASE, admin: false }, error: null }))
      .mockReturnValueOnce(
        chain({
          data: {
            rules: {
              deny: [],
              rules: [{ all: [{ type: 'user', ids: ['u1'] }] }],
            },
          },
          error: null,
        }),
      )
    const { error, caller } = await requireCapability(makeEvent(), 'empresa.empleados.manage')
    expect(error).toBeUndefined()
    expect(caller.user_id).toBe('u1')
  })

  it('usuario sin grant y sin fila de module_permissions (capacidad abierta) pasa', async () => {
    fromMock
      .mockReturnValueOnce(chain({ data: { ...PROFILE_BASE, admin: false }, error: null }))
      .mockReturnValueOnce(chain({ data: null, error: null }))
    const { error } = await requireCapability(makeEvent(), 'empresa.empleados.manage')
    expect(error).toBeUndefined()
  })

  it('usuario sin grant y regla configurada devuelve 403', async () => {
    fromMock
      .mockReturnValueOnce(chain({ data: { ...PROFILE_BASE, admin: false }, error: null }))
      .mockReturnValueOnce(
        chain({
          data: {
            rules: {
              deny: [],
              rules: [{ all: [{ type: 'min_level', value: 4 }] }],
            },
          },
          error: null,
        }),
      )
    const { error, caller } = await requireCapability(makeEvent(), 'empresa.empleados.manage')
    expect(error.statusCode).toBe(403)
    expect(caller).toBeUndefined()
  })
})
