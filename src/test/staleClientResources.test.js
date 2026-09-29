/**
 * Tests de la detección de recursos obsoletos (empleados archivados que siguen
 * asignados como equipo de una cuenta). Ver utils/staleClientResources.js.
 */
import { describe, it, expect } from 'vitest'
import {
  RESOURCE_FIELDS,
  archivedUserIds,
  resolvedValue,
  staleResourceClients,
  staleResourceCount,
} from '../utils/staleClientResources'

const JEFA = 'u-jefa'

const lines = [
  { id: 'line-1', name: 'Team Bianca', color: '#FFB800', lead_user_id: JEFA },
  { id: 'line-2', name: 'Team Georgina', color: '#4F46E5', lead_user_id: 'u-otra' },
]

const employees = [
  { user_id: JEFA, first_name: 'Bianca', last_name: 'Rodríguez', deleted_at: null },
  { user_id: 'u-activo', first_name: 'Ana', last_name: 'Pérez', deleted_at: null },
  {
    user_id: 'u-osnel',
    first_name: 'Osnel',
    last_name: 'Pacheco',
    deleted_at: '2026-08-01T00:00:00Z',
  },
  {
    user_id: 'u-paula',
    first_name: 'Paula',
    last_name: 'Viloria',
    deleted_at: '2026-09-01T00:00:00Z',
  },
]

function client(overrides = {}) {
  return {
    id: 'c-1',
    name: 'Agrolago',
    line_id: 'line-1',
    deleted_at: null,
    social_manager_id: null,
    designer_id: null,
    audiovisual_ids: [],
    apoyo_ids: [],
    ...overrides,
  }
}

describe('archivedUserIds', () => {
  it('devuelve solo los empleados con deleted_at', () => {
    const ids = archivedUserIds(employees)
    expect([...ids].sort()).toEqual(['u-osnel', 'u-paula'])
  })

  it('tolera lista vacía o nula', () => {
    expect(archivedUserIds().size).toBe(0)
    expect(archivedUserIds([]).size).toBe(0)
  })
})

describe('staleResourceClients', () => {
  it('detecta un social archivado y resuelve su nombre', () => {
    const items = staleResourceClients(
      [client({ social_manager_id: 'u-paula' })],
      employees,
      lines,
      JEFA,
    )
    expect(items).toHaveLength(1)
    expect(items[0].client.name).toBe('Agrolago')
    expect(items[0].line.name).toBe('Team Bianca')
    expect(items[0].stale).toHaveLength(1)
    expect(items[0].stale[0]).toMatchObject({
      field: 'social_manager_id',
      label: 'Social',
      multi: false,
      departmentId: 1,
      keepIds: [],
    })
    expect(items[0].stale[0].archived[0].first_name).toBe('Paula')
  })

  it('ignora un recurso asignado a alguien activo', () => {
    const items = staleResourceClients(
      [client({ social_manager_id: 'u-activo', designer_id: 'u-activo' })],
      employees,
      lines,
      JEFA,
    )
    expect(items).toEqual([])
  })

  it('detecta varios recursos archivados en la misma cuenta', () => {
    const items = staleResourceClients(
      [client({ social_manager_id: 'u-paula', designer_id: 'u-osnel' })],
      employees,
      lines,
      JEFA,
    )
    expect(items[0].stale.map((s) => s.field)).toEqual(['social_manager_id', 'designer_id'])
  })

  it('en campos múltiples devuelve keepIds sin los archivados', () => {
    const items = staleResourceClients(
      [client({ audiovisual_ids: ['u-activo', 'u-osnel'], apoyo_ids: ['u-paula'] })],
      employees,
      lines,
      JEFA,
    )
    const av = items[0].stale.find((s) => s.field === 'audiovisual_ids')
    expect(av.multi).toBe(true)
    expect(av.keepIds).toEqual(['u-activo'])
    expect(av.archived.map((u) => u.user_id)).toEqual(['u-osnel'])

    const apoyo = items[0].stale.find((s) => s.field === 'apoyo_ids')
    expect(apoyo.keepIds).toEqual([])
    expect(apoyo.departmentId).toBeNull()
  })

  it('no devuelve cuentas de líneas que el usuario no lidera', () => {
    const items = staleResourceClients(
      [client({ id: 'c-2', line_id: 'line-2', social_manager_id: 'u-paula' })],
      employees,
      lines,
      JEFA,
    )
    expect(items).toEqual([])
  })

  it('ignora cuentas dadas de baja', () => {
    const items = staleResourceClients(
      [client({ deleted_at: '2026-09-01T00:00:00Z', social_manager_id: 'u-paula' })],
      employees,
      lines,
      JEFA,
    )
    expect(items).toEqual([])
  })

  it('ignora cuentas sin línea (Independientes): no tienen jefa', () => {
    const items = staleResourceClients(
      [client({ line_id: null, social_manager_id: 'u-paula' })],
      employees,
      lines,
      JEFA,
    )
    expect(items).toEqual([])
  })

  it('devuelve [] sin userId o si el usuario no lidera ninguna línea', () => {
    const rows = [client({ social_manager_id: 'u-paula' })]
    expect(staleResourceClients(rows, employees, lines, null)).toEqual([])
    expect(staleResourceClients(rows, employees, lines, 'u-random')).toEqual([])
  })

  it('devuelve [] si no hay ningún empleado archivado', () => {
    const activos = employees.filter((e) => !e.deleted_at)
    expect(
      staleResourceClients([client({ social_manager_id: 'u-paula' })], activos, lines, JEFA),
    ).toEqual([])
  })

  it('conserva la fila aunque el id archivado no exista en employees', () => {
    const items = staleResourceClients(
      [client({ social_manager_id: 'u-osnel' })],
      employees
        .filter((e) => e.user_id !== 'u-osnel')
        .concat({ user_id: 'u-osnel', deleted_at: 'x' }),
      lines,
      JEFA,
    )
    expect(items[0].stale[0].archived[0].user_id).toBe('u-osnel')
  })

  it('ordena las cuentas por nombre', () => {
    const items = staleResourceClients(
      [
        client({ id: 'c-z', name: 'Zurca', social_manager_id: 'u-paula' }),
        client({ id: 'c-a', name: 'Alpitech', social_manager_id: 'u-paula' }),
      ],
      employees,
      lines,
      JEFA,
    )
    expect(items.map((i) => i.client.name)).toEqual(['Alpitech', 'Zurca'])
  })

  it('tolera entradas nulas', () => {
    expect(staleResourceClients(null, null, null, JEFA)).toEqual([])
  })
})

describe('resolvedValue', () => {
  it('campo simple: devuelve el id elegido o null', () => {
    expect(resolvedValue({ multi: false }, 'u-activo')).toBe('u-activo')
    expect(resolvedValue({ multi: false }, null)).toBeNull()
    expect(resolvedValue({ multi: false }, '')).toBeNull()
  })

  it('campo múltiple: devuelve el array del picker tal cual', () => {
    expect(resolvedValue({ multi: true }, ['a', 'b'])).toEqual(['a', 'b'])
    expect(resolvedValue({ multi: true }, null)).toEqual([])
  })
})

describe('staleResourceCount', () => {
  it('suma los recursos obsoletos de todas las cuentas', () => {
    const items = staleResourceClients(
      [
        client({ id: 'c-1', social_manager_id: 'u-paula', designer_id: 'u-osnel' }),
        client({ id: 'c-2', name: 'Otra', designer_id: 'u-osnel' }),
      ],
      employees,
      lines,
      JEFA,
    )
    expect(staleResourceCount(items)).toBe(3)
    expect(staleResourceCount()).toBe(0)
  })
})

describe('RESOURCE_FIELDS', () => {
  it('cubre los cuatro campos de equipo de metric_clients', () => {
    expect(RESOURCE_FIELDS.map((f) => f.key)).toEqual([
      'social_manager_id',
      'designer_id',
      'audiovisual_ids',
      'apoyo_ids',
    ])
  })
})
