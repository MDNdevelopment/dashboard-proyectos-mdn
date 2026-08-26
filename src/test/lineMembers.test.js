import { describe, it, expect } from 'vitest'
import {
  lineOfMember,
  assignMemberToLine,
  removeMemberFromLine,
  visibleLinesForUser,
  userViewsAllLines,
  withDerivedGeneralMembers,
} from '../utils/lineMembers'

const LINES = [
  { id: 'line-1', name: 'Georgina', member_user_ids: ['u-a', 'u-b'] },
  { id: 'line-2', name: 'Daniellys', member_user_ids: ['u-c'] },
  { id: 'line-3', name: 'Sabrina', member_user_ids: [] },
]

describe('lineOfMember', () => {
  it('devuelve la línea que contiene al usuario', () => {
    expect(lineOfMember(LINES, 'u-a')?.id).toBe('line-1')
    expect(lineOfMember(LINES, 'u-c')?.id).toBe('line-2')
  })

  it('devuelve null si el usuario no está en ninguna línea', () => {
    expect(lineOfMember(LINES, 'u-x')).toBeNull()
  })

  it('devuelve null para línea vacía', () => {
    expect(lineOfMember(LINES, undefined)).toBeNull()
  })
})

describe('assignMemberToLine', () => {
  it('añade usuario a la línea destino', () => {
    const { updated, changedIds } = assignMemberToLine(LINES, 'line-3', 'u-nuevo')
    const target = updated.find((l) => l.id === 'line-3')
    expect(target.member_user_ids).toContain('u-nuevo')
    expect(changedIds).toContain('line-3')
  })

  it('quita el usuario de la línea original al mover', () => {
    const { updated, changedIds } = assignMemberToLine(LINES, 'line-2', 'u-a')
    const origin = updated.find((l) => l.id === 'line-1')
    const dest = updated.find((l) => l.id === 'line-2')
    expect(origin.member_user_ids).not.toContain('u-a')
    expect(dest.member_user_ids).toContain('u-a')
    expect(changedIds).toContain('line-1')
    expect(changedIds).toContain('line-2')
  })

  it('no modifica líneas que no cambian', () => {
    const { updated, changedIds } = assignMemberToLine(LINES, 'line-3', 'u-nuevo')
    expect(changedIds).not.toContain('line-1')
    expect(changedIds).not.toContain('line-2')
    // line-1 debe ser el mismo objeto referencia
    expect(updated.find((l) => l.id === 'line-1')).toBe(LINES[0])
  })

  it('no cambia nada si el usuario ya está en la línea destino', () => {
    const { updated, changedIds } = assignMemberToLine(LINES, 'line-1', 'u-a')
    expect(changedIds).toHaveLength(0)
    expect(updated.find((l) => l.id === 'line-1').member_user_ids).toEqual(['u-a', 'u-b'])
  })

  it('maneja líneas sin member_user_ids (undefined)', () => {
    const lines = [
      { id: 'l1', member_user_ids: undefined },
      { id: 'l2', member_user_ids: undefined },
    ]
    const { updated, changedIds } = assignMemberToLine(lines, 'l1', 'u-1')
    expect(updated[0].member_user_ids).toContain('u-1')
    expect(changedIds).toEqual(['l1'])
  })

  it('al mover a la jefa de línea a otra línea, se le quita el liderazgo (no viaja con ella)', () => {
    const lines = [
      { id: 'line-1', member_user_ids: ['u-a'], lead_user_id: 'u-a' },
      { id: 'line-2', member_user_ids: [], lead_user_id: null },
    ]
    const { updated } = assignMemberToLine(lines, 'line-2', 'u-a')
    expect(updated.find((l) => l.id === 'line-1').lead_user_id).toBeNull()
    expect(updated.find((l) => l.id === 'line-2').lead_user_id).toBeNull()
  })

  it('mover a un miembro que NO es jefa no afecta el lead_user_id de la línea origen', () => {
    const lines = [
      { id: 'line-1', member_user_ids: ['u-a', 'u-b'], lead_user_id: 'u-a' },
      { id: 'line-2', member_user_ids: [], lead_user_id: null },
    ]
    const { updated } = assignMemberToLine(lines, 'line-2', 'u-b')
    expect(updated.find((l) => l.id === 'line-1').lead_user_id).toBe('u-a')
  })
})

describe('visibleLinesForUser', () => {
  it('nivel 4 ve todas las líneas', () => {
    const profile = { access_level: 4, admin: false, tasks_view_all: false, user_id: 'u-x' }
    expect(visibleLinesForUser(LINES, profile)).toEqual(LINES)
  })

  it('admin ve todas las líneas independientemente del nivel', () => {
    const profile = { access_level: 1, admin: true, tasks_view_all: false, user_id: 'u-x' }
    expect(visibleLinesForUser(LINES, profile)).toEqual(LINES)
  })

  it('tasks_view_all=true en nivel 3 ve todas las líneas', () => {
    const profile = { access_level: 3, admin: false, tasks_view_all: true, user_id: 'u-x' }
    expect(visibleLinesForUser(LINES, profile)).toEqual(LINES)
  })

  it('nivel 3 sin tasks_view_all y sin membresías no ve ninguna línea', () => {
    const profile = { access_level: 3, admin: false, tasks_view_all: false, user_id: 'u-x' }
    expect(visibleLinesForUser(LINES, profile)).toEqual([])
  })

  it('nivel 3 sin tasks_view_all ve solo sus líneas', () => {
    const profile = { access_level: 3, admin: false, tasks_view_all: false, user_id: 'u-a' }
    const result = visibleLinesForUser(LINES, profile)
    expect(result).toHaveLength(1)
    expect(result[0].id).toBe('line-1')
  })

  it('devuelve [] si lines es null', () => {
    const profile = { access_level: 4, admin: false, tasks_view_all: false, user_id: 'u-a' }
    expect(visibleLinesForUser(null, profile)).toEqual([])
  })

  it('devuelve [] si userProfile es null', () => {
    expect(visibleLinesForUser(LINES, null)).toEqual([])
  })

  it('extraViewAll=true ve todas las líneas aunque sea nivel bajo y sin membresías (p. ej. audiovisual.ver_todo)', () => {
    const profile = { access_level: 2, admin: false, tasks_view_all: false, user_id: 'u-x' }
    expect(visibleLinesForUser(LINES, profile, { extraViewAll: true })).toEqual(LINES)
  })

  it('sin extraViewAll (u omitido) mantiene el comportamiento anterior por membresía', () => {
    const profile = { access_level: 2, admin: false, tasks_view_all: false, user_id: 'u-a' }
    const result = visibleLinesForUser(LINES, profile, { extraViewAll: false })
    expect(result).toHaveLength(1)
    expect(result[0].id).toBe('line-1')
  })
})

describe('userViewsAllLines — extraViewAll', () => {
  it('extraViewAll=true hace ver todo aunque el resto de flags sea false', () => {
    expect(
      userViewsAllLines(
        { access_level: 1, admin: false, tasks_view_all: false },
        { extraViewAll: true },
      ),
    ).toBe(true)
  })

  it('sin opts se comporta igual que antes (false para nivel bajo)', () => {
    expect(userViewsAllLines({ access_level: 1, admin: false, tasks_view_all: false })).toBe(false)
  })
})

describe('removeMemberFromLine', () => {
  it('quita el usuario de la línea especificada', () => {
    const { updated, changedIds } = removeMemberFromLine(LINES, 'line-1', 'u-a')
    expect(updated.find((l) => l.id === 'line-1').member_user_ids).toEqual(['u-b'])
    expect(changedIds).toContain('line-1')
  })

  it('no modifica otras líneas', () => {
    const { updated } = removeMemberFromLine(LINES, 'line-1', 'u-a')
    expect(updated.find((l) => l.id === 'line-2')).toBe(LINES[1])
  })

  it('no cambia nada si el usuario no está en la línea', () => {
    const { updated, changedIds } = removeMemberFromLine(LINES, 'line-1', 'u-x')
    expect(changedIds).toHaveLength(0)
    expect(updated[0]).toBe(LINES[0])
  })

  it('no cambia nada si la línea no existe', () => {
    const { updated, changedIds } = removeMemberFromLine(LINES, 'no-existe', 'u-a')
    expect(changedIds).toHaveLength(0)
    expect(updated).toEqual(LINES)
  })

  it('al quitar a la jefa de línea, se limpia lead_user_id', () => {
    const lines = [{ id: 'line-1', member_user_ids: ['u-a', 'u-b'], lead_user_id: 'u-a' }]
    const { updated } = removeMemberFromLine(lines, 'line-1', 'u-a')
    expect(updated.find((l) => l.id === 'line-1').lead_user_id).toBeNull()
  })

  it('quitar a un miembro que no es jefa no toca lead_user_id', () => {
    const lines = [{ id: 'line-1', member_user_ids: ['u-a', 'u-b'], lead_user_id: 'u-a' }]
    const { updated } = removeMemberFromLine(lines, 'line-1', 'u-b')
    expect(updated.find((l) => l.id === 'line-1').lead_user_id).toBe('u-a')
  })
})

describe('withDerivedGeneralMembers', () => {
  const USERS = [
    { user_id: 'u-a' }, // en line-1
    { user_id: 'u-b' }, // en line-1
    { user_id: 'u-c' }, // en line-2
    { user_id: 'u-x' }, // sin línea → Independientes
    { user_id: 'u-y' }, // sin línea → Independientes
    { user_id: 'u-del', deleted_at: '2026-01-01' }, // sin línea pero desactivado
  ]

  it('asigna a la línea general los empleados que no están en ninguna línea real', () => {
    const lines = [
      ...LINES,
      { id: 'line-general', name: 'Independientes', is_general: true, member_user_ids: [] },
    ]
    const result = withDerivedGeneralMembers(lines, USERS)
    const general = result.find((l) => l.id === 'line-general')
    expect(general.member_user_ids).toEqual(expect.arrayContaining(['u-x', 'u-y']))
    expect(general.member_user_ids).toHaveLength(2)
  })

  it('excluye empleados desactivados (deleted_at) de la línea general', () => {
    const lines = [...LINES, { id: 'line-general', is_general: true, member_user_ids: [] }]
    const result = withDerivedGeneralMembers(lines, USERS)
    const general = result.find((l) => l.id === 'line-general')
    expect(general.member_user_ids).not.toContain('u-del')
  })

  it('no toca member_user_ids de las líneas reales', () => {
    const lines = [...LINES, { id: 'line-general', is_general: true, member_user_ids: [] }]
    const result = withDerivedGeneralMembers(lines, USERS)
    expect(result.find((l) => l.id === 'line-1').member_user_ids).toEqual(['u-a', 'u-b'])
    expect(result.find((l) => l.id === 'line-2').member_user_ids).toEqual(['u-c'])
  })

  it('devuelve las líneas sin cambios si no hay fila is_general', () => {
    const result = withDerivedGeneralMembers(LINES, USERS)
    expect(result).toEqual(LINES)
  })

  it('un empleado que se mueve a una línea real ya no aparece en la general', () => {
    const linesAntes = [...LINES, { id: 'line-general', is_general: true, member_user_ids: [] }]
    const linesDespues = [
      { id: 'line-1', member_user_ids: ['u-a', 'u-b', 'u-x'] },
      { id: 'line-2', member_user_ids: ['u-c'] },
      { id: 'line-3', member_user_ids: [] },
      { id: 'line-general', is_general: true, member_user_ids: [] },
    ]
    const antes = withDerivedGeneralMembers(linesAntes, USERS)
    const despues = withDerivedGeneralMembers(linesDespues, USERS)
    expect(antes.find((l) => l.id === 'line-general').member_user_ids).toContain('u-x')
    expect(despues.find((l) => l.id === 'line-general').member_user_ids).not.toContain('u-x')
  })
})
