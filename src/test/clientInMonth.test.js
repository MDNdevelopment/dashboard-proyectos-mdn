import { describe, it, expect } from 'vitest'
import { clientInMonth } from '../utils/clientInMonth'

const make = (overrides) => ({
  id: 'c1',
  name: 'Test',
  created_at: '2026-01-01T00:00:00Z',
  mdn_since: null,
  deleted_at: null,
  ...overrides,
})

describe('clientInMonth', () => {
  it('cliente activo todo el tiempo aparece en cualquier mes posterior a su alta', () => {
    const c = make({ created_at: '2026-01-01T00:00:00Z', deleted_at: null })
    expect(clientInMonth(c, 2026, 3)).toBe(true)
    expect(clientInMonth(c, 2026, 1)).toBe(true)
  })

  it('cliente dado de alta después del mes no aparece', () => {
    const c = make({ created_at: '2026-03-01T00:00:00Z', deleted_at: null })
    expect(clientInMonth(c, 2026, 2)).toBe(false)
  })

  it('cliente dado de alta en el mismo mes aparece', () => {
    const c = make({ created_at: '2026-03-15T00:00:00Z', deleted_at: null })
    expect(clientInMonth(c, 2026, 3)).toBe(true)
  })

  it('cliente dado de baja antes del mes no aparece', () => {
    const c = make({ created_at: '2026-01-01T00:00:00Z', deleted_at: '2026-02-28T23:59:59Z' })
    expect(clientInMonth(c, 2026, 3)).toBe(false)
  })

  it('cliente dado de baja dentro del mes sí aparece', () => {
    const c = make({ created_at: '2026-01-01T00:00:00Z', deleted_at: '2026-03-15T10:00:00Z' })
    expect(clientInMonth(c, 2026, 3)).toBe(true)
  })

  it('cliente dado de baja al inicio del mes aparece', () => {
    const c = make({ created_at: '2026-01-01T00:00:00Z', deleted_at: '2026-03-01T00:00:00Z' })
    expect(clientInMonth(c, 2026, 3)).toBe(true)
  })

  it('usa mdn_since como fecha de alta cuando está disponible', () => {
    const c = make({
      created_at: '2025-01-01T00:00:00Z',
      mdn_since: '2026-05-01',
      deleted_at: null,
    })
    expect(clientInMonth(c, 2026, 4)).toBe(false)
    expect(clientInMonth(c, 2026, 5)).toBe(true)
  })

  describe('baja_incluye_mes', () => {
    it('default (bandera ausente) conserva el mes de baja — igual que legacy', () => {
      const c = make({ created_at: '2026-01-01T00:00:00Z', deleted_at: '2026-03-15T10:00:00Z' })
      expect(clientInMonth(c, 2026, 3)).toBe(true)
    })

    it('true explícito conserva el mes de baja', () => {
      const c = make({
        created_at: '2026-01-01T00:00:00Z',
        deleted_at: '2026-03-15T10:00:00Z',
        baja_incluye_mes: true,
      })
      expect(clientInMonth(c, 2026, 3)).toBe(true)
    })

    it('false: baja a mitad de mes NO aparece en el mes de baja', () => {
      const c = make({
        created_at: '2026-01-01T00:00:00Z',
        deleted_at: '2026-03-15T10:00:00Z',
        baja_incluye_mes: false,
      })
      expect(clientInMonth(c, 2026, 3)).toBe(false)
    })

    it('false: sigue apareciendo en meses ANTERIORES a la baja (histórico intacto)', () => {
      const c = make({
        created_at: '2026-01-01T00:00:00Z',
        deleted_at: '2026-03-15T10:00:00Z',
        baja_incluye_mes: false,
      })
      expect(clientInMonth(c, 2026, 2)).toBe(true)
      expect(clientInMonth(c, 2026, 1)).toBe(true)
    })

    it('false: no aparece en meses posteriores a la baja', () => {
      const c = make({
        created_at: '2026-01-01T00:00:00Z',
        deleted_at: '2026-03-15T10:00:00Z',
        baja_incluye_mes: false,
      })
      expect(clientInMonth(c, 2026, 4)).toBe(false)
    })
  })

  describe('fin de contrato (contract_end)', () => {
    it('el mes que contiene la fecha de fin cuenta completo; el siguiente ya no', () => {
      const c = make({ created_at: '2026-01-01T00:00:00Z', contract_end: '2026-08-30' })
      expect(clientInMonth(c, 2026, 8)).toBe(true) // agosto: trabajó
      expect(clientInMonth(c, 2026, 9)).toBe(false) // septiembre: sin rastro
    })

    it('contract_end tiene prioridad sobre deleted_at', () => {
      // Archivado en octubre pero contrato terminó en junio → julio ya no aparece.
      const c = make({
        created_at: '2026-01-01T00:00:00Z',
        contract_end: '2026-06-30',
        deleted_at: '2026-10-01T00:00:00Z',
      })
      expect(clientInMonth(c, 2026, 6)).toBe(true)
      expect(clientInMonth(c, 2026, 7)).toBe(false)
    })

    it('contract_end ignora baja_incluye_mes:false (el último mes siempre cuenta completo)', () => {
      const c = make({
        created_at: '2026-01-01T00:00:00Z',
        contract_end: '2026-08-30',
        baja_incluye_mes: false,
      })
      expect(clientInMonth(c, 2026, 8)).toBe(true)
      expect(clientInMonth(c, 2026, 9)).toBe(false)
    })

    it('sin contract_end conserva el comportamiento por deleted_at', () => {
      const c = make({
        created_at: '2026-01-01T00:00:00Z',
        contract_end: null,
        deleted_at: '2026-03-15T10:00:00Z',
      })
      expect(clientInMonth(c, 2026, 3)).toBe(true)
      expect(clientInMonth(c, 2026, 4)).toBe(false)
    })
  })
})
