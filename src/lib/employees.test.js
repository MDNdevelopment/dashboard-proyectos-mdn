import { describe, it, expect } from 'vitest'
import { activeEmployees, classifyEmployeeCreation } from './employees'

describe('activeEmployees', () => {
  it('excluye empleados con deleted_at', () => {
    const list = [
      { user_id: 'u1', deleted_at: null },
      { user_id: 'u2', deleted_at: '2026-07-15T00:00:00.000Z' },
      { user_id: 'u3' }, // sin la propiedad (compat con selects que no la incluyen)
    ]
    expect(activeEmployees(list).map((u) => u.user_id)).toEqual(['u1', 'u3'])
  })

  it('devuelve [] para una lista vacía o undefined', () => {
    expect(activeEmployees([])).toEqual([])
    expect(activeEmployees()).toEqual([])
  })
})

describe('classifyEmployeeCreation', () => {
  it('devuelve "new" cuando no hay fila existente', () => {
    expect(classifyEmployeeCreation(null)).toBe('new')
    expect(classifyEmployeeCreation(undefined)).toBe('new')
  })

  it('devuelve "archived" cuando la fila existente tiene deleted_at', () => {
    expect(
      classifyEmployeeCreation({ user_id: 'u1', deleted_at: '2026-07-15T00:00:00.000Z' }),
    ).toBe('archived')
  })

  it('devuelve "active-duplicate" cuando la fila existente no tiene deleted_at', () => {
    expect(classifyEmployeeCreation({ user_id: 'u1', deleted_at: null })).toBe('active-duplicate')
    expect(classifyEmployeeCreation({ user_id: 'u1' })).toBe('active-duplicate')
  })
})
