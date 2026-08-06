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
})
