import { describe, it, expect, vi, beforeEach } from 'vitest'

const requireCapabilityMock = vi.fn()
const fromMock = vi.fn()

vi.mock('./requireCapability.js', () => ({ requireCapability: requireCapabilityMock }))
vi.mock('./supabase.js', () => ({
  supabase: { from: (...args) => fromMock(...args) },
}))

const { handler } = await import('../update-employee.js')

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

// Builder para el SELECT de module_permissions (empresa.empleados.sensible):
// select().eq().eq().maybeSingle()
function permRowChain(result) {
  const builder = {
    select: () => builder,
    eq: () => builder,
    maybeSingle: async () => result,
  }
  return builder
}

// Builder para el UPDATE: refleja el payload recibido para poder verificar
// que el clamp de admin/access_level/monthly_salary realmente lo afectó.
function updateChain() {
  const builder = {
    update: (payload) => {
      builder._payload = payload
      return builder
    },
    eq: () => builder,
    select: () => builder,
    single: async () => ({
      data: { user_id: 'u1', ...builder._payload },
      error: null,
    }),
  }
  return builder
}

const BODY = {
  user_id: 'u1',
  first_name: 'Luisa',
  last_name: 'Ramírez',
  access_level: 4,
  admin: true, // intento de escalada
  monthly_salary: 5000, // intento de escritura de sueldo sin privilegio
}

describe('update-employee.js handler — anti-escalada', () => {
  beforeEach(() => vi.clearAllMocks())

  it('propaga el error de requireCapability (403 sin la capacidad)', async () => {
    requireCapabilityMock.mockResolvedValue({
      error: { statusCode: 403, body: '{"error":"Forbidden"}' },
    })
    const res = await handler(makeEvent(BODY))
    expect(res.statusCode).toBe(403)
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

  it('un caller no-admin (empresa.empleados.manage, nivel 2) no puede otorgar admin, subir nivel por encima de 3, ni escribir sueldo', async () => {
    requireCapabilityMock.mockResolvedValue({
      caller: { user_id: 'rrhh-1', admin: false, access_level: 2, company_id: 'c1' },
    })
    fromMock
      .mockReturnValueOnce(targetChain({ data: { user_id: 'u1', company_id: 'c1' }, error: null }))
      .mockReturnValueOnce(
        // empresa.empleados.sensible configurada en prod como min_level 4 (+ excepción
        // individual): un nivel 2 sin esa capability no puede ver/escribir el sueldo.
        permRowChain({
          data: {
            rules: { deny: [], rules: [{ all: [{ type: 'min_level', value: 4, ids: [] }] }] },
          },
          error: null,
        }),
      )
      .mockReturnValueOnce(updateChain())

    const res = await handler(makeEvent(BODY))

    expect(res.statusCode).toBe(200)
    const updated = JSON.parse(res.body)
    expect(updated.admin).toBe(false)
    expect(updated.access_level).toBe(3) // clamp: min(4, 3)
    expect(updated).not.toHaveProperty('monthly_salary')
  })

  it('un caller admin sí puede otorgar admin, cualquier nivel y sueldo', async () => {
    requireCapabilityMock.mockResolvedValue({
      caller: { user_id: 'admin-1', admin: true, access_level: 4, company_id: 'c1' },
    })
    fromMock
      .mockReturnValueOnce(targetChain({ data: { user_id: 'u1', company_id: 'c1' }, error: null }))
      .mockReturnValueOnce(updateChain())

    const res = await handler(makeEvent(BODY))

    expect(res.statusCode).toBe(200)
    const updated = JSON.parse(res.body)
    expect(updated.admin).toBe(true)
    expect(updated.access_level).toBe(4)
    expect(updated.monthly_salary).toBe(5000)
  })
})
