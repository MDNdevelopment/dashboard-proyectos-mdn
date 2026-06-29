import { describe, it, expect } from 'vitest'
import { fmtDate } from '../utils/formatDate'

describe('fmtDate', () => {
  it('formatea un timestamp ISO a DD/MM/YYYY', () => {
    // 2026-01-15 en UTC
    const result = fmtDate('2026-01-15T10:00:00Z')
    expect(result).toMatch(/15\/01\/2026/)
  })

  it('formatea una fecha YYYY-MM-DD a DD/MM/YYYY', () => {
    const result = fmtDate('2026-06-29')
    expect(result).toMatch(/29\/06\/2026/)
  })

  it('devuelve cadena vacía para valor vacío', () => {
    expect(fmtDate('')).toBe('')
  })

  it('devuelve cadena vacía para null', () => {
    expect(fmtDate(null)).toBe('')
  })

  it('devuelve cadena vacía para undefined', () => {
    expect(fmtDate(undefined)).toBe('')
  })

  it('devuelve cadena vacía para una fecha inválida', () => {
    expect(fmtDate('no-es-una-fecha')).toBe('')
  })
})
