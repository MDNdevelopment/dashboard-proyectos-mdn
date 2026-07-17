import { describe, it, expect } from 'vitest'
import { isReportFrozen } from '../utils/reportPeriod'

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
