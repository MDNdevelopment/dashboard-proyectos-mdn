import { describe, it, expect } from 'vitest'
import { buildHomeCalendarEvents, canSeeClientDates, EVENT_TYPES } from '../utils/homeCalendar'

function emp(overrides = {}) {
  return {
    user_id: 'u1',
    first_name: 'Ana',
    last_name: 'Pérez',
    avatar_url: null,
    birth_date: null,
    hire_date: null,
    deleted_at: null,
    ...overrides,
  }
}

function client(overrides = {}) {
  return {
    id: 'c1',
    name: 'Cliente Uno',
    line_id: null,
    deleted_at: null,
    anniversary_date: null,
    mdn_since: null,
    contacts: [],
    ...overrides,
  }
}

const line = (overrides = {}) => ({ id: 'l1', member_user_ids: [], ...overrides })

const DIRECTOR = { user_id: 'x', access_level: 4 }

describe('EVENT_TYPES', () => {
  it('define los 5 tipos con label/dot/pill/iconColor/order', () => {
    const keys = Object.keys(EVENT_TYPES)
    expect(keys).toEqual([
      'birthday',
      'anniversary',
      'client_anniversary',
      'client_mdn_anniversary',
      'client_contact_birthday',
    ])
    keys.forEach((k) => {
      expect(EVENT_TYPES[k]).toHaveProperty('label')
      expect(EVENT_TYPES[k]).toHaveProperty('dot')
      expect(EVENT_TYPES[k]).toHaveProperty('pill')
      expect(EVENT_TYPES[k]).toHaveProperty('iconColor')
      expect(typeof EVENT_TYPES[k].order).toBe('number')
    })
  })
})

describe('canSeeClientDates', () => {
  it('nivel 4+ ve cualquier cliente', () => {
    expect(canSeeClientDates(client({ line_id: 'other' }), [], DIRECTOR)).toBe(true)
  })

  it('admin ve cualquier cliente', () => {
    expect(canSeeClientDates(client({ line_id: 'other' }), [], { user_id: 'x', admin: true })).toBe(
      true,
    )
  })

  it('miembro de la línea del cliente lo ve', () => {
    const lines = [line({ id: 'l1', member_user_ids: ['x'] })]
    expect(
      canSeeClientDates(client({ line_id: 'l1' }), lines, { user_id: 'x', access_level: 1 }),
    ).toBe(true)
  })

  it('usuario fuera de la línea del cliente no lo ve', () => {
    const lines = [line({ id: 'l1', member_user_ids: ['otro'] })]
    expect(
      canSeeClientDates(client({ line_id: 'l1' }), lines, { user_id: 'x', access_level: 1 }),
    ).toBe(false)
  })

  it('cliente sin línea solo lo ve nivel 4+', () => {
    expect(
      canSeeClientDates(client({ line_id: null }), [], { user_id: 'x', access_level: 3 }),
    ).toBe(false)
  })

  it('con hasCapability=true (empresa.calendario.ver_todo) ve cualquier cliente sin ser admin/nivel 4', () => {
    expect(
      canSeeClientDates(
        client({ line_id: 'other' }),
        [],
        { user_id: 'x', access_level: 1, admin: false },
        true,
      ),
    ).toBe(true)
  })

  it('sin hasCapability (default false) mantiene el criterio de línea', () => {
    expect(
      canSeeClientDates(client({ line_id: 'other' }), [], { user_id: 'x', access_level: 1 }),
    ).toBe(false)
  })
})

describe('buildHomeCalendarEvents — equipo', () => {
  it('proyecta cumpleaños y aniversario del equipo dentro del mes visible', () => {
    const events = buildHomeCalendarEvents({
      employees: [
        emp({ birth_date: '1990-03-05' }),
        emp({ user_id: 'u2', hire_date: '2023-03-10' }),
      ],
      clients: [],
      lines: [],
      userProfile: DIRECTOR,
      year: 2026,
      month: 3,
    })
    expect(events.find((e) => e.type === 'birthday').dateKey).toBe('2026-03-05')
    expect(events.find((e) => e.type === 'anniversary').label).toContain('3 años en MDN')
  })

  it('no incluye fin de período de prueba ni vacaciones aunque el empleado esté en prueba', () => {
    const events = buildHomeCalendarEvents({
      employees: [emp({ hire_date: '2026-03-01', on_probation: true })],
      clients: [],
      lines: [],
      userProfile: DIRECTOR,
      year: 2026,
      month: 3,
    })
    expect(events.find((e) => e.type === 'probation_end')).toBeUndefined()
    expect(events.find((e) => e.type === 'vacation_start')).toBeUndefined()
  })

  it('excluye empleados archivados', () => {
    const events = buildHomeCalendarEvents({
      employees: [emp({ birth_date: '1990-03-05', deleted_at: '2026-01-01' })],
      clients: [],
      lines: [],
      userProfile: DIRECTOR,
      year: 2026,
      month: 3,
    })
    expect(events).toHaveLength(0)
  })

  it('proyecta 29/02 a 28/02 en año no bisiesto', () => {
    const events = buildHomeCalendarEvents({
      employees: [emp({ birth_date: '1996-02-29' })],
      clients: [],
      lines: [],
      userProfile: DIRECTOR,
      year: 2026,
      month: 2,
    })
    expect(events.find((e) => e.type === 'birthday').dateKey).toBe('2026-02-28')
  })
})

describe('buildHomeCalendarEvents — clientes', () => {
  it('incluye el aniversario empresa dentro del mes, con años cumplidos', () => {
    const events = buildHomeCalendarEvents({
      employees: [],
      clients: [client({ anniversary_date: '2010-03-15' })],
      lines: [],
      userProfile: DIRECTOR,
      year: 2026,
      month: 3,
    })
    const ev = events.find((e) => e.type === 'client_anniversary')
    expect(ev.dateKey).toBe('2026-03-15')
    expect(ev.label).toContain('16 año')
  })

  it('incluye "cliente MDN desde" dentro del mes, con años como cliente', () => {
    const events = buildHomeCalendarEvents({
      employees: [],
      clients: [client({ mdn_since: '2022-03-20' })],
      lines: [],
      userProfile: DIRECTOR,
      year: 2026,
      month: 3,
    })
    const ev = events.find((e) => e.type === 'client_mdn_anniversary')
    expect(ev.dateKey).toBe('2026-03-20')
    expect(ev.label).toContain('4 año')
    expect(ev.label).toContain('cliente MDN')
  })

  it('incluye cumpleaños de contacto con birth_day/birth_month numéricos', () => {
    const events = buildHomeCalendarEvents({
      employees: [],
      clients: [client({ contacts: [{ name: 'Pedro', birth_day: 12, birth_month: 3 }] })],
      lines: [],
      userProfile: DIRECTOR,
      year: 2026,
      month: 3,
    })
    const ev = events.find((e) => e.type === 'client_contact_birthday')
    expect(ev.dateKey).toBe('2026-03-12')
    expect(ev.label).toContain('Pedro')
  })

  it('ignora contactos con birth_day/birth_month vacíos ("") sin romper', () => {
    const events = buildHomeCalendarEvents({
      employees: [],
      clients: [client({ contacts: [{ name: 'Sin fecha', birth_day: '', birth_month: '' }] })],
      lines: [],
      userProfile: DIRECTOR,
      year: 2026,
      month: 3,
    })
    expect(events).toHaveLength(0)
  })

  it('excluye clientes archivados', () => {
    const events = buildHomeCalendarEvents({
      employees: [],
      clients: [client({ anniversary_date: '2020-03-05', deleted_at: '2026-01-01' })],
      lines: [],
      userProfile: DIRECTOR,
      year: 2026,
      month: 3,
    })
    expect(events).toHaveLength(0)
  })

  it('un usuario sin acceso a la línea del cliente no ve sus fechas', () => {
    const lines = [line({ id: 'l1', member_user_ids: ['otro'] })]
    const events = buildHomeCalendarEvents({
      employees: [],
      clients: [client({ anniversary_date: '2020-03-05', line_id: 'l1' })],
      lines,
      userProfile: { user_id: 'x', access_level: 1 },
      year: 2026,
      month: 3,
    })
    expect(events).toHaveLength(0)
  })
})

describe('buildHomeCalendarEvents — orden', () => {
  it('ordena equipo y clientes juntos por fecha, luego por tipo (order)', () => {
    const events = buildHomeCalendarEvents({
      employees: [emp({ birth_date: '1990-03-05' })],
      clients: [client({ anniversary_date: '2010-03-05' })],
      lines: [],
      userProfile: DIRECTOR,
      year: 2026,
      month: 3,
    })
    const day = events.filter((e) => e.dateKey === '2026-03-05')
    expect(day.map((e) => e.type)).toEqual(['birthday', 'client_anniversary'])
  })
})
