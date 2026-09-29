import { describe, it, expect } from 'vitest'
import { canAccessModule, canViewEmployeeFicha } from '../lib/permissions'

describe('canViewEmployeeFicha', () => {
  it('admin puede ver la ficha de cualquier otro empleado', () => {
    const userProfile = { user_id: 'u-1', admin: true, access_level: 1 }
    expect(canViewEmployeeFicha(userProfile, 'u-2')).toBe(true)
  })

  it('nivel 3 puede ver la ficha de cualquier otro empleado', () => {
    const userProfile = { user_id: 'u-1', admin: false, access_level: 3 }
    expect(canViewEmployeeFicha(userProfile, 'u-2')).toBe(true)
  })

  it('nivel 4 puede ver la ficha de cualquier otro empleado', () => {
    const userProfile = { user_id: 'u-1', admin: false, access_level: 4 }
    expect(canViewEmployeeFicha(userProfile, 'u-2')).toBe(true)
  })

  it('nivel 2 NO puede ver la ficha de otro empleado', () => {
    const userProfile = { user_id: 'u-1', admin: false, access_level: 2 }
    expect(canViewEmployeeFicha(userProfile, 'u-2')).toBe(false)
  })

  it('nivel 1 NO puede ver la ficha de otro empleado', () => {
    const userProfile = { user_id: 'u-1', admin: false, access_level: 1 }
    expect(canViewEmployeeFicha(userProfile, 'u-2')).toBe(false)
  })

  it('nivel 1-2 SÍ puede ver su propia ficha', () => {
    const userProfile = { user_id: 'u-1', admin: false, access_level: 1 }
    expect(canViewEmployeeFicha(userProfile, 'u-1')).toBe(true)
  })

  it('userProfile null → false', () => {
    expect(canViewEmployeeFicha(null, 'u-2')).toBe(false)
  })

  it('sin targetUserId → false para nivel bajo', () => {
    const userProfile = { user_id: 'u-1', admin: false, access_level: 1 }
    expect(canViewEmployeeFicha(userProfile, undefined)).toBe(false)
  })
})

// Regla de `empresa.clientes.manage` tras la migración
// 20260928170000_empresa_clientes_manage_or_lizdania.sql: dos grupos en OR (nivel ≥ 3, o
// estar en la lista de usuarios). Antes era un solo grupo `all` con ambas condiciones, lo
// que la hacía imposible de cumplir para cualquier no-admin.
describe('canAccessModule — empresa.clientes.manage (OR de nivel y usuarios)', () => {
  const NAIRIM = 'be1b5087-bd15-4da3-96ff-1b7b31c9d8e4'
  const LIZDANIA = '967bedeb-54fa-4da1-b975-bfc4745989d9'
  const config = {
    'empresa.clientes.manage': {
      deny: [],
      rules: [
        { all: [{ ids: [], type: 'min_level', value: 3 }] },
        { all: [{ ids: [NAIRIM, LIZDANIA], type: 'user', value: 1 }] },
      ],
    },
  }
  const can = (userProfile) => canAccessModule('empresa.clientes.manage', userProfile, config)

  it('dirección (nivel 3) pasa por el grupo de nivel', () => {
    expect(can({ user_id: 'otro', admin: false, access_level: 3 })).toBe(true)
  })

  it('Lizdania (nivel 2) pasa por el grupo de usuarios — puede asignar el audiovisual de una marca', () => {
    expect(can({ user_id: LIZDANIA, admin: false, access_level: 2 })).toBe(true)
  })

  it('Nairim (nivel 2) pasa por el grupo de usuarios', () => {
    expect(can({ user_id: NAIRIM, admin: false, access_level: 2 })).toBe(true)
  })

  it('un empleado cualquiera de nivel 2 sigue sin poder editar clientes', () => {
    expect(can({ user_id: 'u-otro', admin: false, access_level: 2 })).toBe(false)
  })
})
