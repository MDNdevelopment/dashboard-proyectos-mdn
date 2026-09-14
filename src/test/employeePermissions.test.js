/**
 * Lógica pura del reporte de "Permisos" (RRHH). Sin mocks: solo strings 'yyyy-MM-dd' y
 * objetos planos, como el resto de la familia aggregate-utils / employeeCalendar.
 */
import {
  monthBounds,
  permissionInMonth,
  permissionDaysInMonth,
  aggregatePermissionsByMonth,
} from '../utils/employeePermissions'

describe('monthBounds', () => {
  it('devuelve el primer y último día del mes', () => {
    expect(monthBounds(2026, 2)).toEqual({ first: '2026-02-01', last: '2026-02-28' })
    expect(monthBounds(2028, 2)).toEqual({ first: '2028-02-01', last: '2028-02-29' }) // bisiesto
    expect(monthBounds(2026, 9)).toEqual({ first: '2026-09-01', last: '2026-09-30' })
  })
})

describe('permissionInMonth', () => {
  it('incluye un registro que cruza el borde del mes', () => {
    const row = { start_date: '2026-09-28', end_date: '2026-10-03' }
    expect(permissionInMonth(row, 2026, 9)).toBe(true)
    expect(permissionInMonth(row, 2026, 10)).toBe(true)
  })

  it('excluye un registro fuera del mes', () => {
    const row = { start_date: '2026-08-01', end_date: '2026-08-05' }
    expect(permissionInMonth(row, 2026, 9)).toBe(false)
  })

  it('incluye un registro de un solo día dentro del mes', () => {
    // Caso anti-UTC−4: '2026-03-01' no debe interpretarse como 28/02.
    const row = { start_date: '2026-03-01', end_date: '2026-03-01' }
    expect(permissionInMonth(row, 2026, 3)).toBe(true)
    expect(permissionInMonth(row, 2026, 2)).toBe(false)
  })
})

describe('permissionDaysInMonth', () => {
  it('recorta un registro que cruza el borde del mes a los días de cada mes', () => {
    const row = { start_date: '2026-09-28', end_date: '2026-10-03' }
    expect(permissionDaysInMonth(row, 2026, 9)).toBe(3) // 28, 29, 30
    expect(permissionDaysInMonth(row, 2026, 10)).toBe(3) // 1, 2, 3
  })

  it('un registro de un solo día cuenta 1', () => {
    const row = { start_date: '2026-03-01', end_date: '2026-03-01' }
    expect(permissionDaysInMonth(row, 2026, 3)).toBe(1)
  })

  it('un registro totalmente dentro del mes cuenta sus días completos', () => {
    const row = { start_date: '2026-09-10', end_date: '2026-09-12' }
    expect(permissionDaysInMonth(row, 2026, 9)).toBe(3)
  })

  it('devuelve 0 si el registro no toca el mes', () => {
    const row = { start_date: '2026-01-01', end_date: '2026-01-05' }
    expect(permissionDaysInMonth(row, 2026, 9)).toBe(0)
  })
})

describe('aggregatePermissionsByMonth', () => {
  const employees = [
    { user_id: 'u1', first_name: 'Ana', last_name: 'Pérez' },
    { user_id: 'u2', first_name: 'Luis', last_name: 'Gómez' },
    { user_id: 'u3', first_name: 'Carla', last_name: 'Ruiz' },
  ]

  it('cuenta por tipo y suma los días recortados al mes', () => {
    const rows = [
      { user_id: 'u1', type: 'permiso', start_date: '2026-09-01', end_date: '2026-09-02' },
      { user_id: 'u1', type: 'permiso', start_date: '2026-09-10', end_date: '2026-09-10' },
      { user_id: 'u2', type: 'ausencia', start_date: '2026-09-05', end_date: '2026-09-05' },
      { user_id: 'u3', type: 'reposo', start_date: '2026-08-30', end_date: '2026-09-01' },
    ]
    const { rows: agg, totals } = aggregatePermissionsByMonth(rows, employees, 2026, 9)

    const ana = agg.find((r) => r.userId === 'u1')
    expect(ana).toMatchObject({ permiso: 2, ausencia: 0, reposo: 0, dias: 3 })

    const luis = agg.find((r) => r.userId === 'u2')
    expect(luis).toMatchObject({ ausencia: 1, dias: 1 })

    const carla = agg.find((r) => r.userId === 'u3')
    expect(carla).toMatchObject({ reposo: 1, dias: 1 }) // solo el 01/09 cuenta en septiembre

    expect(totals).toMatchObject({ permiso: 2, ausencia: 1, reposo: 1, dias: 5 })
  })

  it('incluye en cero a los empleados sin registros en el mes', () => {
    const { rows: agg } = aggregatePermissionsByMonth([], employees, 2026, 9)
    expect(agg).toHaveLength(3)
    expect(
      agg.every((r) => r.permiso === 0 && r.ausencia === 0 && r.reposo === 0 && r.dias === 0),
    ).toBe(true)
  })

  it('ordena las filas por nombre', () => {
    const { rows: agg } = aggregatePermissionsByMonth([], employees, 2026, 9)
    expect(agg.map((r) => r.name)).toEqual(['Ana Pérez', 'Carla Ruiz', 'Luis Gómez'])
  })

  it('ignora registros de usuarios fuera del roster recibido', () => {
    const rows = [
      { user_id: 'ghost', type: 'permiso', start_date: '2026-09-01', end_date: '2026-09-01' },
    ]
    const { rows: agg, totals } = aggregatePermissionsByMonth(rows, employees, 2026, 9)
    expect(agg.every((r) => r.permiso === 0)).toBe(true)
    expect(totals.permiso).toBe(0)
  })

  it('no se desfasa un día por UTC−4: un registro del 01/09 al 01/09 cae en septiembre, no agosto', () => {
    const rows = [
      { user_id: 'u1', type: 'permiso', start_date: '2026-09-01', end_date: '2026-09-01' },
    ]
    const { rows: aggSept } = aggregatePermissionsByMonth(rows, employees, 2026, 9)
    const { rows: aggAug } = aggregatePermissionsByMonth(rows, employees, 2026, 8)
    expect(aggSept.find((r) => r.userId === 'u1')).toMatchObject({ permiso: 1, dias: 1 })
    expect(aggAug.find((r) => r.userId === 'u1')).toMatchObject({ permiso: 0, dias: 0 })
  })

  it('cuenta llegadas tarde y salidas temprano, pero NO restan de "días" (día sí trabajado)', () => {
    const rows = [
      { user_id: 'u1', type: 'llegada_tarde', start_date: '2026-09-05', end_date: '2026-09-05' },
      { user_id: 'u1', type: 'salida_temprana', start_date: '2026-09-06', end_date: '2026-09-06' },
      { user_id: 'u1', type: 'permiso', start_date: '2026-09-10', end_date: '2026-09-10' },
    ]
    const { rows: agg, totals } = aggregatePermissionsByMonth(rows, employees, 2026, 9)
    const ana = agg.find((r) => r.userId === 'u1')
    expect(ana).toMatchObject({ llegada_tarde: 1, salida_temprana: 1, permiso: 1, dias: 1 })
    expect(totals).toMatchObject({ llegada_tarde: 1, salida_temprana: 1, dias: 1 })
  })
})
