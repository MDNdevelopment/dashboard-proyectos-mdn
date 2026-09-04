import { describe, it, expect } from 'vitest'
import { clientsPerMonth } from '../utils/clientsPerMonth'

const make = (overrides) => ({
  id: 'c1',
  name: 'Test',
  created_at: '2026-01-01T00:00:00Z',
  mdn_since: null,
  deleted_at: null,
  contract_end: null,
  contract_end_reason: null,
  ...overrides,
})

describe('clientsPerMonth', () => {
  it('año sin clientes devuelve 12 meses en cero', () => {
    const rows = clientsPerMonth([], 2026)
    expect(rows).toHaveLength(12)
    expect(rows.every((r) => r.activos === 0 && r.altas === 0 && r.bajas === 0)).toBe(true)
  })

  it('cliente activo todo el año cuenta como activo en cada mes, sin alta ni baja en ese año', () => {
    const c = make({ created_at: '2024-01-01T00:00:00Z' })
    const rows = clientsPerMonth([c], 2026)
    expect(rows.every((r) => r.activos === 1)).toBe(true)
    expect(rows.every((r) => r.altas === 0 && r.bajas === 0)).toBe(true)
  })

  it('alta a mitad de año: cuenta como alta ese mes y activo desde ahí', () => {
    const c = make({ mdn_since: '2026-05-10' })
    const rows = clientsPerMonth([c], 2026)
    expect(rows[3].altas).toBe(0) // abril
    expect(rows[3].activos).toBe(0)
    expect(rows[4].altas).toBe(1) // mayo
    expect(rows[4].activos).toBe(1)
    expect(rows[5].activos).toBe(1) // junio sigue activo
  })

  it('baja por contract_end: cuenta como baja en su mes (que cuenta completo)', () => {
    const c = make({ created_at: '2025-01-01T00:00:00Z', contract_end: '2026-08-30' })
    const rows = clientsPerMonth([c], 2026)
    expect(rows[7].activos).toBe(1) // agosto: trabajó todo el mes
    expect(rows[7].bajas).toBe(1)
    expect(rows[7].bajasDetalle).toEqual([{ id: 'c1', name: 'Test', reason: null }])
    expect(rows[8].activos).toBe(0) // septiembre: ya no
    expect(rows[8].bajas).toBe(0)
  })

  it('baja por deleted_at con baja_incluye_mes:false: la baja efectiva cae en el mes siguiente', () => {
    const c = make({
      created_at: '2025-01-01T00:00:00Z',
      deleted_at: '2026-03-15T10:00:00Z',
      baja_incluye_mes: false,
    })
    const rows = clientsPerMonth([c], 2026)
    expect(rows[1].activos).toBe(1) // febrero: sigue activo
    expect(rows[2].activos).toBe(0) // marzo: se excluye también ese mes
    expect(rows[2].bajas).toBe(0) // la baja "cuenta" para abril, no marzo
    expect(rows[3].bajas).toBe(1) // abril: mes calendario siguiente al de deleted_at
  })

  it('baja por deleted_at con baja_incluye_mes true (default): cuenta como baja en su propio mes', () => {
    const c = make({ created_at: '2025-01-01T00:00:00Z', deleted_at: '2026-03-15T10:00:00Z' })
    const rows = clientsPerMonth([c], 2026)
    expect(rows[2].activos).toBe(1) // marzo cuenta completo
    expect(rows[2].bajas).toBe(1)
  })

  it('contract_end tiene prioridad sobre deleted_at para la baja', () => {
    const c = make({
      created_at: '2025-01-01T00:00:00Z',
      contract_end: '2026-06-30',
      deleted_at: '2026-10-01T00:00:00Z',
    })
    const rows = clientsPerMonth([c], 2026)
    expect(rows[5].bajas).toBe(1) // junio, no octubre
    expect(rows[9].bajas).toBe(0) // octubre: no cuenta, contract_end manda
  })

  it('bajasDetalle incluye el motivo cuando está presente', () => {
    const c = make({
      created_at: '2025-01-01T00:00:00Z',
      contract_end: '2026-06-30',
      contract_end_reason: 'Cierre de operaciones',
    })
    const rows = clientsPerMonth([c], 2026)
    expect(rows[5].bajasDetalle[0].reason).toBe('Cierre de operaciones')
  })

  it('netos = altas - bajas', () => {
    const alta = make({ id: 'c1', mdn_since: '2026-05-01' })
    const baja = make({ id: 'c2', created_at: '2025-01-01T00:00:00Z', contract_end: '2026-05-31' })
    const rows = clientsPerMonth([alta, baja], 2026)
    expect(rows[4].altas).toBe(1)
    expect(rows[4].bajas).toBe(1)
    expect(rows[4].netos).toBe(0)
  })
})
