/**
 * Tests para teamMemberUsers en src/utils/lineFilters.js
 * Verifica:
 * - Solo devuelve usuarios que son miembros del team.
 * - Incluye el usuario actualmente seleccionado aunque no sea miembro (edición de tarea legacy).
 * - Maneja member_user_ids undefined/null (team nuevo sin miembros).
 * - Devuelve vacío si team es null.
 */
import { describe, it, expect } from 'vitest'
import { teamMemberUsers } from '../utils/lineFilters'

const USERS = [
  { user_id: 'u-a', first_name: 'Ana',    last_name: 'García' },
  { user_id: 'u-b', first_name: 'Bruno',  last_name: 'López' },
  { user_id: 'u-c', first_name: 'Carlos', last_name: 'Pérez' },
  { user_id: 'u-d', first_name: 'Diana',  last_name: 'Ruiz' },
]

const TEAM = { id: 'line-1', name: 'Georgina', member_user_ids: ['u-a', 'u-c'] }

describe('teamMemberUsers', () => {
  it('devuelve solo los miembros del team', () => {
    const result = teamMemberUsers(USERS, TEAM)
    expect(result.map(u => u.user_id)).toEqual(expect.arrayContaining(['u-a', 'u-c']))
    expect(result).toHaveLength(2)
  })

  it('excluye usuarios que no son miembros', () => {
    const result = teamMemberUsers(USERS, TEAM)
    expect(result.find(u => u.user_id === 'u-b')).toBeUndefined()
    expect(result.find(u => u.user_id === 'u-d')).toBeUndefined()
  })

  it('incluye el usuario actual aunque no sea miembro (edición legacy)', () => {
    const result = teamMemberUsers(USERS, TEAM, 'u-b')
    expect(result.map(u => u.user_id)).toEqual(expect.arrayContaining(['u-a', 'u-b', 'u-c']))
    expect(result).toHaveLength(3)
  })

  it('no duplica el usuario actual si ya es miembro', () => {
    const result = teamMemberUsers(USERS, TEAM, 'u-a')
    const ids = result.map(u => u.user_id)
    expect(ids.filter(id => id === 'u-a')).toHaveLength(1)
  })

  it('devuelve vacío cuando team es null', () => {
    expect(teamMemberUsers(USERS, null)).toEqual([])
  })

  it('devuelve vacío cuando el team no tiene miembros (member_user_ids vacío)', () => {
    const emptyTeam = { id: 'line-2', name: 'Daniellys', member_user_ids: [] }
    expect(teamMemberUsers(USERS, emptyTeam)).toEqual([])
  })

  it('maneja member_user_ids undefined (team recién creado sin backfill)', () => {
    const teamSinMiembros = { id: 'line-3', name: 'Nueva' }
    expect(teamMemberUsers(USERS, teamSinMiembros)).toEqual([])
  })

  it('incluye usuario actual incluso cuando member_user_ids es undefined', () => {
    const teamSinMiembros = { id: 'line-3', name: 'Nueva' }
    const result = teamMemberUsers(USERS, teamSinMiembros, 'u-d')
    expect(result).toHaveLength(1)
    expect(result[0].user_id).toBe('u-d')
  })
})
