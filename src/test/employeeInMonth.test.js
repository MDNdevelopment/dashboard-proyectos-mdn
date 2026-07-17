import { describe, it, expect } from 'vitest'
import { employeeActiveInMonth } from '../utils/employeeInMonth'

const make = (overrides) => ({
  user_id: 'u1',
  deleted_at: null,
  ...overrides,
})

describe('employeeActiveInMonth', () => {
  it('empleado activo (deleted_at null) aparece en cualquier mes', () => {
    const e = make({ deleted_at: null })
    expect(employeeActiveInMonth(e, 2026, 3)).toBe(true)
    expect(employeeActiveInMonth(e, 2026, 7)).toBe(true)
  })

  it('empleado dado de baja antes del mes no aparece', () => {
    const e = make({ deleted_at: '2026-06-15T00:00:00Z' })
    expect(employeeActiveInMonth(e, 2026, 7)).toBe(false)
  })

  it('empleado dado de baja dentro del mes sí aparece (el mes de la baja cuenta)', () => {
    const e = make({ deleted_at: '2026-07-10T10:00:00Z' })
    expect(employeeActiveInMonth(e, 2026, 7)).toBe(true)
  })

  it('empleado dado de baja al inicio exacto del mes aparece', () => {
    const e = make({ deleted_at: '2026-07-01T00:00:00Z' })
    expect(employeeActiveInMonth(e, 2026, 7)).toBe(true)
  })

  it('empleado dado de baja el mes anterior no aparece en el mes actual', () => {
    const e = make({ deleted_at: '2026-06-30T23:59:59Z' })
    expect(employeeActiveInMonth(e, 2026, 7)).toBe(false)
  })
})
