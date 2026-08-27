import { describe, it, expect, vi, afterEach } from 'vitest'
import {
  monthGridRange,
  buildEmployeeCalendarEvents,
  groupEventsByDay,
  EVENT_TYPES,
  PROBATION_DAYS,
} from '../utils/employeeCalendar'

function emp(overrides = {}) {
  return {
    user_id: 'u1',
    first_name: 'Ana',
    last_name: 'Pérez',
    avatar_url: null,
    birth_date: null,
    hire_date: null,
    on_probation: false,
    ...overrides,
  }
}

afterEach(() => {
  vi.useRealTimers()
})

describe('monthGridRange', () => {
  it('devuelve el rango de la grilla (lunes a domingo) y fetchStartKey un día antes', () => {
    // Marzo 2026 empieza domingo → la grilla arranca el lunes 23/02/2026.
    const { startKey, endKey, fetchStartKey } = monthGridRange(2026, 3)
    expect(startKey).toBe('2026-02-23')
    expect(fetchStartKey).toBe('2026-02-22')
    expect(endKey >= '2026-03-31').toBe(true)
  })
})

describe('buildEmployeeCalendarEvents — cumpleaños', () => {
  it('proyecta el cumpleaños al mes visible sin desfase de zona horaria', () => {
    const events = buildEmployeeCalendarEvents({
      employees: [emp({ birth_date: '1990-03-01' })],
      vacations: [],
      year: 2026,
      month: 3,
    })
    const bday = events.find((e) => e.type === 'birthday')
    expect(bday.dateKey).toBe('2026-03-01')
    expect(bday.label).toBe('Ana Pérez cumple 36 años')
  })

  it('usa el mensaje genérico sin cantidad cuando no hay birth_date', () => {
    const events = buildEmployeeCalendarEvents({
      employees: [emp({ birth_date: null })],
      vacations: [],
      year: 2026,
      month: 3,
    })
    expect(events.find((e) => e.type === 'birthday')).toBeUndefined()
  })

  it('proyecta 29 de febrero al 28 en un año no bisiesto', () => {
    const events = buildEmployeeCalendarEvents({
      employees: [emp({ birth_date: '1992-02-29' })],
      vacations: [],
      year: 2026, // no bisiesto
      month: 2,
    })
    const bday = events.find((e) => e.type === 'birthday')
    expect(bday.dateKey).toBe('2026-02-28')
    expect(bday.detail).toMatch(/29 de febrero/)
  })

  it('cubre grillas que cruzan de diciembre a enero', () => {
    // Diciembre 2026 termina en jueves; la grilla se extiende hasta principios de enero 2027.
    const events = buildEmployeeCalendarEvents({
      employees: [emp({ birth_date: '1990-01-02' })],
      vacations: [],
      year: 2026,
      month: 12,
    })
    const bday = events.find((e) => e.type === 'birthday')
    expect(bday).toBeTruthy()
    expect(bday.dateKey).toBe('2027-01-02')
  })
})

describe('buildEmployeeCalendarEvents — aniversario', () => {
  it('calcula los años cumplidos y omite el año de contratación', () => {
    const events = buildEmployeeCalendarEvents({
      employees: [emp({ hire_date: '2023-03-15' })],
      vacations: [],
      year: 2026,
      month: 3,
    })
    const anniv = events.find((e) => e.type === 'anniversary')
    expect(anniv.dateKey).toBe('2026-03-15')
    expect(anniv.label).toBe('Ana Pérez cumple 3 años en MDN')
  })

  it('no genera evento en el propio año de contratación', () => {
    const events = buildEmployeeCalendarEvents({
      employees: [emp({ hire_date: '2026-03-15' })],
      vacations: [],
      year: 2026,
      month: 3,
    })
    expect(events.find((e) => e.type === 'anniversary')).toBeUndefined()
  })
})

describe('buildEmployeeCalendarEvents — fin de período de prueba', () => {
  it(`se ubica en hire_date + ${PROBATION_DAYS} días cuando on_probation es true`, () => {
    const events = buildEmployeeCalendarEvents({
      employees: [emp({ hire_date: '2026-03-01', on_probation: true })],
      vacations: [],
      year: 2026,
      month: 3,
    })
    const probation = events.find((e) => e.type === 'probation_end')
    expect(probation.dateKey).toBe('2026-03-31')
  })

  it('no genera evento si on_probation es false', () => {
    const events = buildEmployeeCalendarEvents({
      employees: [emp({ hire_date: '2026-03-01', on_probation: false })],
      vacations: [],
      year: 2026,
      month: 3,
    })
    expect(events.find((e) => e.type === 'probation_end')).toBeUndefined()
  })

  it('marca la prueba como vencida si la fecha derivada ya pasó', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 3, 15)) // 15/04/2026
    const events = buildEmployeeCalendarEvents({
      employees: [emp({ hire_date: '2026-03-01', on_probation: true })],
      vacations: [],
      year: 2026,
      month: 3,
    })
    const probation = events.find((e) => e.type === 'probation_end')
    expect(probation.detail).toBe('Prueba vencida')
  })
})

describe('buildEmployeeCalendarEvents — vacaciones', () => {
  it('genera vacation_start en start_date y vacation_end en end_date + 1', () => {
    const events = buildEmployeeCalendarEvents({
      employees: [emp()],
      vacations: [
        {
          id: 'v1',
          user_id: 'u1',
          start_date: '2026-03-10',
          end_date: '2026-03-20',
          status: 'approved',
        },
      ],
      year: 2026,
      month: 3,
    })
    const start = events.find((e) => e.type === 'vacation_start')
    const end = events.find((e) => e.type === 'vacation_end')
    expect(start.dateKey).toBe('2026-03-10')
    expect(end.dateKey).toBe('2026-03-21')
    expect(start.label).toContain('hasta 20/03')
    expect(end.label).toBe('Ana Pérez regresa a la oficina')
  })

  it('el regreso cruza al mes siguiente cuando end_date es el último día del mes', () => {
    const events = buildEmployeeCalendarEvents({
      employees: [emp()],
      vacations: [
        {
          id: 'v1',
          user_id: 'u1',
          start_date: '2026-03-25',
          end_date: '2026-03-31',
          status: 'completed',
        },
      ],
      year: 2026,
      month: 4,
    })
    const end = events.find((e) => e.type === 'vacation_end')
    expect(end.dateKey).toBe('2026-04-01')
  })

  it('marca tentative las vacaciones sin confirmar y excluye las rechazadas', () => {
    const events = buildEmployeeCalendarEvents({
      employees: [emp()],
      vacations: [
        {
          id: 'v1',
          user_id: 'u1',
          start_date: '2026-03-10',
          end_date: '2026-03-12',
          status: 'tentative',
        },
        {
          id: 'v2',
          user_id: 'u1',
          start_date: '2026-03-15',
          end_date: '2026-03-17',
          status: 'rejected',
        },
      ],
      year: 2026,
      month: 3,
    })
    const starts = events.filter((e) => e.type === 'vacation_start')
    expect(starts).toHaveLength(1)
    expect(starts[0].tentative).toBe(true)
  })

  it('ignora vacaciones de empleados que no están en la lista activa', () => {
    const events = buildEmployeeCalendarEvents({
      employees: [emp({ user_id: 'u1' })],
      vacations: [
        {
          id: 'v1',
          user_id: 'u2',
          start_date: '2026-03-10',
          end_date: '2026-03-12',
          status: 'approved',
        },
      ],
      year: 2026,
      month: 3,
    })
    expect(events).toHaveLength(0)
  })
})

describe('buildEmployeeCalendarEvents — orden e ids', () => {
  it('ordena por fecha, luego por tipo, luego por nombre; ids son deterministas', () => {
    const events = buildEmployeeCalendarEvents({
      employees: [
        emp({
          user_id: 'u1',
          first_name: 'Beto',
          last_name: 'Ruiz',
          birth_date: '1990-03-05',
          hire_date: '2020-03-05',
        }),
        emp({ user_id: 'u2', first_name: 'Ana', last_name: 'Ríos', birth_date: '1990-03-05' }),
      ],
      vacations: [],
      year: 2026,
      month: 3,
    })
    const day = events.filter((e) => e.dateKey === '2026-03-05')
    expect(day.map((e) => e.type)).toEqual(['birthday', 'birthday', 'anniversary'])
    // Empate de fecha+tipo entre los dos cumpleaños: se ordena por nombre.
    expect(day[0].employeeName).toBe('Ana Ríos')
    expect(day[1].employeeName).toBe('Beto Ruiz')
    expect(day[0].id).toBe('birthday:u2:2026-03-05')
  })
})

describe('groupEventsByDay', () => {
  it('agrupa eventos por dateKey', () => {
    const events = buildEmployeeCalendarEvents({
      employees: [emp({ birth_date: '1990-03-05' })],
      vacations: [
        {
          id: 'v1',
          user_id: 'u1',
          start_date: '2026-03-05',
          end_date: '2026-03-05',
          status: 'approved',
        },
      ],
      year: 2026,
      month: 3,
    })
    const grouped = groupEventsByDay(events)
    expect(grouped.get('2026-03-05')).toHaveLength(2)
    expect(grouped.get('2026-03-06')).toHaveLength(1) // vacation_end = end_date + 1
  })
})

describe('EVENT_TYPES', () => {
  it('define los cinco tipos con label/dot/pill/order', () => {
    const keys = Object.keys(EVENT_TYPES)
    expect(keys).toEqual([
      'birthday',
      'anniversary',
      'probation_end',
      'vacation_start',
      'vacation_end',
    ])
    keys.forEach((k) => {
      expect(EVENT_TYPES[k]).toHaveProperty('label')
      expect(EVENT_TYPES[k]).toHaveProperty('dot')
      expect(EVENT_TYPES[k]).toHaveProperty('pill')
      expect(typeof EVENT_TYPES[k].order).toBe('number')
    })
  })
})
