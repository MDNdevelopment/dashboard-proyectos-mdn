import { describe, it, expect } from 'vitest'
import {
  lineOfMember,
  assignMemberToLine,
  removeMemberFromLine,
  visibleLinesForUser,
} from '../utils/lineMembers'

const LINES = [
  { id: 'line-1', name: 'Georgina',  member_user_ids: ['u-a', 'u-b'] },
  { id: 'line-2', name: 'Daniellys', member_user_ids: ['u-c'] },
  { id: 'line-3', name: 'Sabrina',   member_user_ids: [] },
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
    const target = updated.find(l => l.id === 'line-3')
    expect(target.member_user_ids).toContain('u-nuevo')
    expect(changedIds).toContain('line-3')
  })

  it('quita el usuario de la línea original al mover', () => {
    const { updated, changedIds } = assignMemberToLine(LINES, 'line-2', 'u-a')
    const origin = updated.find(l => l.id === 'line-1')
    const dest   = updated.find(l => l.id === 'line-2')
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
    expect(updated.find(l => l.id === 'line-1')).toBe(LINES[0])
  })

  it('no cambia nada si el usuario ya está en la línea destino', () => {
    const { updated, changedIds } = assignMemberToLine(LINES, 'line-1', 'u-a')
    expect(changedIds).toHaveLength(0)
    expect(updated.find(l => l.id === 'line-1').member_user_ids).toEqual(['u-a', 'u-b'])
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
})

describe('removeMemberFromLine', () => {
  it('quita el usuario de la línea especificada', () => {
    const { updated, changedIds } = removeMemberFromLine(LINES, 'line-1', 'u-a')
    expect(updated.find(l => l.id === 'line-1').member_user_ids).toEqual(['u-b'])
    expect(changedIds).toContain('line-1')
  })

  it('no modifica otras líneas', () => {
    const { updated } = removeMemberFromLine(LINES, 'line-1', 'u-a')
    expect(updated.find(l => l.id === 'line-2')).toBe(LINES[1])
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
})
