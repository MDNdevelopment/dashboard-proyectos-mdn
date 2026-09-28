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

  describe('bandera baja_incluye_mes', () => {
    it('baja_incluye_mes: true se comporta igual que ausente (el mes de baja cuenta)', () => {
      const e = make({ deleted_at: '2026-08-04T19:34:04Z', baja_incluye_mes: true })
      expect(employeeActiveInMonth(e, 2026, 8)).toBe(true)
    })

    it('baja_incluye_mes: false excluye el mes de la baja', () => {
      // Caso real: Andrés Barboza, archivado el 4 de agosto tras 3 días trabajados.
      const e = make({ deleted_at: '2026-08-04T19:34:04Z', baja_incluye_mes: false })
      expect(employeeActiveInMonth(e, 2026, 8)).toBe(false)
    })

    it('baja_incluye_mes: false conserva los meses ANTERIORES a la baja', () => {
      const e = make({ deleted_at: '2026-08-04T19:34:04Z', baja_incluye_mes: false })
      expect(employeeActiveInMonth(e, 2026, 7)).toBe(true)
      expect(employeeActiveInMonth(e, 2026, 6)).toBe(true)
    })

    it('baja_incluye_mes: false excluye también los meses posteriores', () => {
      const e = make({ deleted_at: '2026-08-04T19:34:04Z', baja_incluye_mes: false })
      expect(employeeActiveInMonth(e, 2026, 9)).toBe(false)
    })

    it('la baja el último día del mes con incluye_mes false excluye ese mes', () => {
      const e = make({ deleted_at: '2026-08-31T13:31:12Z', baja_incluye_mes: false })
      expect(employeeActiveInMonth(e, 2026, 8)).toBe(false)
      expect(employeeActiveInMonth(e, 2026, 7)).toBe(true)
    })
  })
})
