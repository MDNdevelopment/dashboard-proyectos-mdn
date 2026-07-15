import { describe, it, expect } from 'vitest'
import { buildClientGroups } from '../utils/exportClientsToPdf'

const client = (overrides) => ({
  id: overrides.id ?? 'c',
  name: 'Cliente',
  deleted_at: null,
  social_manager_id: null,
  ...overrides,
})

const employee = (overrides) => ({
  user_id: 'u',
  first_name: 'Nombre',
  last_name: 'Apellido',
  ...overrides,
})

describe('buildClientGroups', () => {
  it('agrupa clientes por social_manager_id y resuelve el nombre desde employees', () => {
    const employees = [
      employee({ user_id: 'u1', first_name: 'Daniellys', last_name: 'Pérez' }),
      employee({ user_id: 'u2', first_name: 'Bianca', last_name: 'Gómez' }),
    ]
    const clients = [
      client({ id: '1', name: 'ENCCO', social_manager_id: 'u1' }),
      client({ id: '2', name: 'SuperFina', social_manager_id: 'u1' }),
      client({ id: '3', name: 'Gelarttesano', social_manager_id: 'u2' }),
    ]
    const groups = buildClientGroups(clients, employees)
    expect(groups).toEqual([
      { manager: 'Bianca Gómez', clients: ['Gelarttesano'] },
      { manager: 'Daniellys Pérez', clients: ['ENCCO', 'SuperFina'] },
    ])
  })

  it('excluye clientes archivados (deleted_at)', () => {
    const employees = [employee({ user_id: 'u1', first_name: 'Ana', last_name: 'Ruiz' })]
    const clients = [
      client({ id: '1', name: 'Activo', social_manager_id: 'u1' }),
      client({ id: '2', name: 'Archivado', social_manager_id: 'u1', deleted_at: '2026-01-01T00:00:00Z' }),
    ]
    const groups = buildClientGroups(clients, employees)
    expect(groups).toEqual([{ manager: 'Ana Ruiz', clients: ['Activo'] }])
  })

  it('clientes sin social asignado caen en "Sin social asignado" al final', () => {
    const employees = [employee({ user_id: 'u1', first_name: 'Ana', last_name: 'Ruiz' })]
    const clients = [
      client({ id: '1', name: 'ConSocial', social_manager_id: 'u1' }),
      client({ id: '2', name: 'SinSocial', social_manager_id: null }),
    ]
    const groups = buildClientGroups(clients, employees)
    expect(groups).toEqual([
      { manager: 'Ana Ruiz', clients: ['ConSocial'] },
      { manager: 'Sin social asignado', clients: ['SinSocial'] },
    ])
  })

  it('sin líneas, ordena alfabéticamente las cuentas dentro de cada grupo y los grupos entre sí', () => {
    const employees = [
      employee({ user_id: 'u1', first_name: 'Zulay', last_name: 'Soto' }),
      employee({ user_id: 'u2', first_name: 'Ana', last_name: 'Ruiz' }),
    ]
    const clients = [
      client({ id: '1', name: 'Zurca', social_manager_id: 'u1' }),
      client({ id: '2', name: 'Blu', social_manager_id: 'u1' }),
      client({ id: '3', name: 'Push', social_manager_id: 'u2' }),
    ]
    const groups = buildClientGroups(clients, employees)
    expect(groups).toEqual([
      { manager: 'Ana Ruiz', clients: ['Push'] },
      { manager: 'Zulay Soto', clients: ['Blu', 'Zurca'] },
    ])
  })

  it('pone primero a la jefa de línea y debajo al resto de socials de esa línea', () => {
    const employees = [
      employee({ user_id: 'u1', first_name: 'Bianca', last_name: 'Gómez' }), // jefa
      employee({ user_id: 'u2', first_name: 'Ana', last_name: 'Ruiz' }), // otra social de la misma línea
      employee({ user_id: 'u3', first_name: 'Zulay', last_name: 'Soto' }), // social de otra línea
    ]
    const clients = [
      client({ id: '1', name: 'Gelarttesano', social_manager_id: 'u1' }),
      client({ id: '2', name: 'Blu', social_manager_id: 'u2' }),
      client({ id: '3', name: 'Zurca', social_manager_id: 'u3' }),
    ]
    const lines = [
      { id: 'l1', sort_order: 1, lead_user_id: 'u1', member_user_ids: ['u1', 'u2'] },
      { id: 'l2', sort_order: 2, lead_user_id: 'u3', member_user_ids: ['u3'] },
    ]
    const groups = buildClientGroups(clients, employees, lines)
    expect(groups).toEqual([
      { manager: 'Bianca Gómez', clients: ['Gelarttesano'] },
      { manager: 'Ana Ruiz', clients: ['Blu'] },
      { manager: 'Zulay Soto', clients: ['Zurca'] },
    ])
  })

  it('socials sin línea asociada quedan al final, antes de "Sin social asignado"', () => {
    const employees = [
      employee({ user_id: 'u1', first_name: 'Bianca', last_name: 'Gómez' }),
      employee({ user_id: 'u2', first_name: 'Suelta', last_name: 'Zzz' }),
    ]
    const clients = [
      client({ id: '1', name: 'Gelarttesano', social_manager_id: 'u1' }),
      client({ id: '2', name: 'Independiente', social_manager_id: 'u2' }),
      client({ id: '3', name: 'HuérfanoCliente', social_manager_id: null }),
    ]
    const lines = [{ id: 'l1', sort_order: 1, lead_user_id: 'u1', member_user_ids: ['u1'] }]
    const groups = buildClientGroups(clients, employees, lines)
    expect(groups).toEqual([
      { manager: 'Bianca Gómez', clients: ['Gelarttesano'] },
      { manager: 'Suelta Zzz', clients: ['Independiente'] },
      { manager: 'Sin social asignado', clients: ['HuérfanoCliente'] },
    ])
  })
})
