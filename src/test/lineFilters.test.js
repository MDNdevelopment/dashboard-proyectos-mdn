/**
 * Tests para teamMemberUsers en src/utils/lineFilters.js
 * Verifica:
 * - Solo devuelve usuarios que son miembros del team.
 * - Incluye el usuario actualmente seleccionado aunque no sea miembro (edición de tarea legacy).
 * - Maneja member_user_ids undefined/null (team nuevo sin miembros).
 * - Devuelve vacío si team es null.
 */
import { describe, it, expect } from 'vitest'
import {
  teamMemberUsers,
  crossLineUserIds,
  assignableUsers,
  flattenAssignable,
} from '../utils/lineFilters'

const USERS = [
  { user_id: 'u-a', first_name: 'Ana', last_name: 'García' },
  { user_id: 'u-b', first_name: 'Bruno', last_name: 'López' },
  { user_id: 'u-c', first_name: 'Carlos', last_name: 'Pérez' },
  { user_id: 'u-d', first_name: 'Diana', last_name: 'Ruiz' },
]

const TEAM = { id: 'line-1', name: 'Georgina', member_user_ids: ['u-a', 'u-c'] }

describe('teamMemberUsers', () => {
  it('devuelve solo los miembros del team', () => {
    const result = teamMemberUsers(USERS, TEAM)
    expect(result.map((u) => u.user_id)).toEqual(expect.arrayContaining(['u-a', 'u-c']))
    expect(result).toHaveLength(2)
  })

  it('excluye usuarios que no son miembros', () => {
    const result = teamMemberUsers(USERS, TEAM)
    expect(result.find((u) => u.user_id === 'u-b')).toBeUndefined()
    expect(result.find((u) => u.user_id === 'u-d')).toBeUndefined()
  })

  it('incluye el usuario actual aunque no sea miembro (edición legacy)', () => {
    const result = teamMemberUsers(USERS, TEAM, 'u-b')
    expect(result.map((u) => u.user_id)).toEqual(expect.arrayContaining(['u-a', 'u-b', 'u-c']))
    expect(result).toHaveLength(3)
  })

  it('no duplica el usuario actual si ya es miembro', () => {
    const result = teamMemberUsers(USERS, TEAM, 'u-a')
    const ids = result.map((u) => u.user_id)
    expect(ids.filter((id) => id === 'u-a')).toHaveLength(1)
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

describe('crossLineUserIds', () => {
  const LINE_1 = { id: 'line-1', name: 'Georgina', member_user_ids: ['u-a', 'u-c'] }
  const LINE_2 = { id: 'line-2', name: 'Sabrina', member_user_ids: ['u-b'] }
  const GENERAL = {
    id: 'line-general',
    name: 'Independientes',
    is_general: true,
    member_user_ids: ['u-d'],
  }

  it('excluye a quien está en una línea real', () => {
    const ids = crossLineUserIds(USERS, [LINE_1, LINE_2])
    expect(ids).not.toContain('u-a')
    expect(ids).not.toContain('u-b')
    expect(ids).not.toContain('u-c')
  })

  it('incluye a quien no está en ninguna línea real', () => {
    const ids = crossLineUserIds(USERS, [LINE_1, LINE_2])
    expect(ids).toContain('u-d')
  })

  it('ignora la fila is_general al calcular el pool (no se auto-alimenta)', () => {
    // Si se contaran los miembros de GENERAL como "asignados", u-d desaparecería del pool.
    const ids = crossLineUserIds(USERS, [LINE_1, LINE_2, GENERAL])
    expect(ids).toContain('u-d')
  })

  it('excluye empleados dados de baja (deleted_at)', () => {
    const usersConBaja = [...USERS, { user_id: 'u-e', deleted_at: '2026-01-01' }]
    const ids = crossLineUserIds(usersConBaja, [LINE_1, LINE_2])
    expect(ids).not.toContain('u-e')
  })

  it('regresión: con una lista de líneas incompleta, no se "traga" a miembros de líneas ausentes', () => {
    // Si a crossLineUserIds solo se le pasan las líneas VISIBLES para un usuario (no todas
    // las de la empresa), un miembro de una línea que ese usuario no ve parecería "sin línea".
    // Este test documenta el contrato: el caller SIEMPRE debe pasar la lista completa.
    const soloLineaVisible = [LINE_1] // LINE_2 (con u-b) no está en la lista
    const ids = crossLineUserIds(USERS, soloLineaVisible)
    // u-b termina en el pool porque, desde esta llamada, no hay forma de saber que
    // pertenece a line-2 — de ahí la exigencia documentada en el JSDoc de la función.
    expect(ids).toContain('u-b')
  })
})

describe('assignableUsers', () => {
  const LINE_1 = { id: 'line-1', name: 'Georgina', member_user_ids: ['u-a', 'u-c'] }
  const LINE_2 = { id: 'line-2', name: 'Sabrina', member_user_ids: ['u-b'] }
  const ALL_LINES = [LINE_1, LINE_2]

  it('devuelve los miembros de la línea seleccionada', () => {
    const { members } = assignableUsers(USERS, LINE_1, ALL_LINES)
    expect(members.map((u) => u.user_id)).toEqual(expect.arrayContaining(['u-a', 'u-c']))
  })

  it('incluye el pool transversal (sin línea) por separado', () => {
    const { crossLine } = assignableUsers(USERS, LINE_1, ALL_LINES)
    expect(crossLine.map((u) => u.user_id)).toEqual(['u-d'])
  })

  it('no duplica a alguien que sea miembro y a la vez del pool', () => {
    // u-d no tiene línea real, así que member_user_ids de LINE_1 no lo incluye;
    // si por error apareciera en ambas listas, esto lo detecta.
    const { members, crossLine } = assignableUsers(USERS, LINE_1, ALL_LINES)
    const memberIds = new Set(members.map((u) => u.user_id))
    crossLine.forEach((u) => expect(memberIds.has(u.user_id)).toBe(false))
  })

  it('preserva currentUserId aunque no sea miembro ni del pool', () => {
    // u-b es miembro de LINE_2, no de LINE_1 ni del pool "sin línea".
    const { members, crossLine } = assignableUsers(USERS, LINE_1, ALL_LINES, 'u-b')
    const allIds = [...members, ...crossLine].map((u) => u.user_id)
    expect(allIds).toContain('u-b')
  })

  it('no duplica currentUserId si ya está en el pool', () => {
    const { members, crossLine } = assignableUsers(USERS, LINE_1, ALL_LINES, 'u-d')
    const allIds = [...members, ...crossLine].map((u) => u.user_id)
    expect(allIds.filter((id) => id === 'u-d')).toHaveLength(1)
  })
})

describe('flattenAssignable', () => {
  it('concatena miembros y pool en una sola lista', () => {
    const flat = flattenAssignable({
      members: [{ user_id: 'u-a' }],
      crossLine: [{ user_id: 'u-d' }],
    })
    expect(flat.map((u) => u.user_id)).toEqual(['u-a', 'u-d'])
  })

  it('anota "Independiente" en el puesto de los usuarios del pool', () => {
    const flat = flattenAssignable({
      members: [{ user_id: 'u-a', position: { position_name: 'Diseñador' } }],
      crossLine: [{ user_id: 'u-d', position: { position_name: 'Coord. de Diseño' } }],
    })
    expect(flat.find((u) => u.user_id === 'u-a').position.position_name).toBe('Diseñador')
    expect(flat.find((u) => u.user_id === 'u-d').position.position_name).toBe(
      'Coord. de Diseño · Independiente',
    )
  })

  it('usa "Independiente" a secas si el usuario del pool no tiene puesto', () => {
    const flat = flattenAssignable({ members: [], crossLine: [{ user_id: 'u-d' }] })
    expect(flat[0].position.position_name).toBe('Independiente')
  })
})
