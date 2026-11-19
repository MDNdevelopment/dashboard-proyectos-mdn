import { describe, it, expect } from 'vitest'
import { isReportFrozen, isDerivationFrozen } from '../utils/reportPeriod'

const NOW = new Date('2026-07-17T12:00:00Z')

describe('isReportFrozen', () => {
  it('un mes de un año anterior está congelado', () => {
    expect(isReportFrozen(2025, 12, false, NOW)).toBe(true)
  })

  it('un mes estrictamente anterior en el mismo año está congelado', () => {
    expect(isReportFrozen(2026, 6, false, NOW)).toBe(true)
  })

  it('el mes en curso NO está congelado (mientras no esté cerrado)', () => {
    expect(isReportFrozen(2026, 7, false, NOW)).toBe(false)
  })

  it('un mes futuro NO está congelado', () => {
    expect(isReportFrozen(2026, 8, false, NOW)).toBe(false)
    expect(isReportFrozen(2027, 1, false, NOW)).toBe(false)
  })

  it('un reporte cerrado está congelado sin importar el mes', () => {
    expect(isReportFrozen(2026, 7, true, NOW)).toBe(true)
    expect(isReportFrozen(2026, 8, true, NOW)).toBe(true)
  })
})

describe('isDerivationFrozen', () => {
  it('un reporte cerrado está congelado para derivar', () => {
    expect(isDerivationFrozen({ closed_at: '2026-10-05T00:00:00Z', reopened_at: null })).toBe(true)
  })

  it('un reporte desbloqueado por un admin también: se edita a mano pero no se recalcula solo', () => {
    expect(isDerivationFrozen({ closed_at: null, reopened_at: '2026-11-19T12:00:00Z' })).toBe(true)
  })

  it('un reporte abierto que nunca se desbloqueó no lo está', () => {
    expect(isDerivationFrozen({ closed_at: null, reopened_at: null })).toBe(false)
    expect(isDerivationFrozen({})).toBe(false)
  })

  it('tolera null y undefined (reporte que aún no existe)', () => {
    expect(isDerivationFrozen(null)).toBe(false)
    expect(isDerivationFrozen(undefined)).toBe(false)
  })

  it('al volver a cerrarlo sigue congelado (closed_at lleno y reopened_at limpio)', () => {
    expect(isDerivationFrozen({ closed_at: '2026-11-20T00:00:00Z', reopened_at: null })).toBe(true)
  })
})
