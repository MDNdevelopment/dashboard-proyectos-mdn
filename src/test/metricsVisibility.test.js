import { describe, it, expect } from 'vitest'
import { visibleLinesForUser } from '../utils/lineMembers'

// ─── Datos de prueba ──────────────────────────────────────────────────────────

const LINES = [
  { id: 'line-g', name: 'Georgina',  member_user_ids: ['u-georgia', 'u-extra'] },
  { id: 'line-d', name: 'Daniellys', member_user_ids: ['u-daniellys'] },
  { id: 'line-b', name: 'Bianca',    member_user_ids: [] },
  { id: 'line-s', name: 'Sabrina',   member_user_ids: ['u-sabrina'] },
]

// ─── visibleLinesForUser ──────────────────────────────────────────────────────

describe('visibleLinesForUser', () => {
  // Nivel 4 ve todo
  it('nivel 4 ve todas las líneas', () => {
    const user = { user_id: 'u-x', access_level: 4, admin: false }
    expect(visibleLinesForUser(LINES, user)).toHaveLength(4)
  })

  // Admin ve todo
  it('admin ve todas las líneas independientemente del access_level', () => {
    const user = { user_id: 'u-x', access_level: 1, admin: true }
    expect(visibleLinesForUser(LINES, user)).toHaveLength(4)
  })

  it('admin con nivel 3 ve todas las líneas', () => {
    const user = { user_id: 'u-x', access_level: 3, admin: true }
    expect(visibleLinesForUser(LINES, user)).toHaveLength(4)
  })

  // Nivel 3 solo ve su línea
  it('nivel 3 ve solo la línea donde está como miembro', () => {
    const user = { user_id: 'u-georgia', access_level: 3, admin: false }
    const visible = visibleLinesForUser(LINES, user)
    expect(visible).toHaveLength(1)
    expect(visible[0].id).toBe('line-g')
  })

  it('nivel 3 sin línea asignada no ve ninguna línea', () => {
    const user = { user_id: 'u-sin-linea', access_level: 3, admin: false }
    expect(visibleLinesForUser(LINES, user)).toHaveLength(0)
  })

  it('nivel 3 miembro de una línea sin otros miembros ve solo esa', () => {
    const user = { user_id: 'u-sabrina', access_level: 3, admin: false }
    const visible = visibleLinesForUser(LINES, user)
    expect(visible).toHaveLength(1)
    expect(visible[0].name).toBe('Sabrina')
  })

  // Niveles 1 y 2 no deberían llegar a esta función (el gate del módulo los bloquea),
  // pero si por alguna razón lo hacen, no verían ninguna línea (a menos que estuvieran en member_user_ids).
  it('nivel 2 sin membresía no ve ninguna línea', () => {
    const user = { user_id: 'u-nivel2', access_level: 2, admin: false }
    expect(visibleLinesForUser(LINES, user)).toHaveLength(0)
  })

  it('nivel 2 que sí está en member_user_ids ve su línea', () => {
    const user = { user_id: 'u-daniellys', access_level: 2, admin: false }
    const visible = visibleLinesForUser(LINES, user)
    expect(visible).toHaveLength(1)
    expect(visible[0].id).toBe('line-d')
  })

  // Edge cases
  it('devuelve [] cuando lines es null o undefined', () => {
    const user = { user_id: 'u-x', access_level: 4, admin: false }
    expect(visibleLinesForUser(null, user)).toEqual([])
    expect(visibleLinesForUser(undefined, user)).toEqual([])
  })

  it('devuelve [] cuando userProfile es null', () => {
    expect(visibleLinesForUser(LINES, null)).toEqual([])
  })

  it('maneja líneas con member_user_ids undefined', () => {
    const lines = [
      { id: 'l1', name: 'Sin campo', member_user_ids: undefined },
    ]
    const user = { user_id: 'u-x', access_level: 3, admin: false }
    expect(visibleLinesForUser(lines, user)).toHaveLength(0)
  })
})

// ─── Gate de acceso al módulo ─────────────────────────────────────────────────
// Verifica la lógica de canView y viewAll que usa MetricasPage.

describe('gate de acceso al módulo Métricas', () => {
  const canView  = (p) => (p?.access_level ?? 1) >= 3 || p?.admin === true
  const viewAll  = (p) => (p?.access_level ?? 1) >= 4 || p?.admin === true
  const canWrite = (p) => canView(p) // nivel 3 también puede editar su propio team

  const profiles = [
    { label: 'nivel 1', p: { access_level: 1, admin: false }, cv: false, va: false },
    { label: 'nivel 2', p: { access_level: 2, admin: false }, cv: false, va: false },
    { label: 'nivel 3', p: { access_level: 3, admin: false }, cv: true,  va: false },
    { label: 'nivel 4', p: { access_level: 4, admin: false }, cv: true,  va: true  },
    { label: 'admin',   p: { access_level: 1, admin: true  }, cv: true,  va: true  },
  ]

  profiles.forEach(({ label, p, cv, va }) => {
    it(`${label}: canView=${cv}, viewAll=${va}`, () => {
      expect(canView(p)).toBe(cv)
      expect(viewAll(p)).toBe(va)
    })
  })

  it('nivel 3 puede ver y editar (canWrite = canView)', () => {
    const p = { access_level: 3, admin: false }
    expect(canView(p)).toBe(true)
    expect(canWrite(p)).toBe(true)
  })

  it('null profile no tiene acceso', () => {
    expect(canView(null)).toBe(false)
    expect(viewAll(null)).toBe(false)
  })
})
