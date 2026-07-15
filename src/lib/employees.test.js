import { describe, it, expect } from 'vitest'
import { activeEmployees } from './employees'

describe('activeEmployees', () => {
  it('excluye empleados con deleted_at', () => {
    const list = [
      { user_id: 'u1', deleted_at: null },
      { user_id: 'u2', deleted_at: '2026-07-15T00:00:00.000Z' },
      { user_id: 'u3' }, // sin la propiedad (compat con selects que no la incluyen)
    ]
    expect(activeEmployees(list).map(u => u.user_id)).toEqual(['u1', 'u3'])
  })

  it('devuelve [] para una lista vacía o undefined', () => {
    expect(activeEmployees([])).toEqual([])
    expect(activeEmployees()).toEqual([])
  })
})
