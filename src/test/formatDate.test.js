import { describe, it, expect } from 'vitest'
import { fmtDate, fmtTime12 } from '../utils/formatDate'

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

describe('fmtTime12', () => {
  it('formatea la mañana con A.M.', () => {
    expect(fmtTime12('2026-07-15T09:05:00')).toBe('9:05 A.M.')
  })

  it('formatea la tarde con P.M.', () => {
    expect(fmtTime12('2026-07-15T14:30:00')).toBe('2:30 P.M.')
  })

  it('mediodía (12:00) es 12:00 P.M.', () => {
    expect(fmtTime12('2026-07-15T12:00:00')).toBe('12:00 P.M.')
  })

  it('medianoche (00:00) es 12:00 A.M.', () => {
    expect(fmtTime12('2026-07-15T00:00:00')).toBe('12:00 A.M.')
  })

  it('devuelve cadena vacía para valor vacío', () => {
    expect(fmtTime12('')).toBe('')
    expect(fmtTime12(null)).toBe('')
    expect(fmtTime12(undefined)).toBe('')
  })

  it('devuelve cadena vacía para una fecha inválida', () => {
    expect(fmtTime12('no-es-una-fecha')).toBe('')
  })

  it('acepta un objeto Date directamente', () => {
    expect(fmtTime12(new Date(2026, 6, 15, 8, 5))).toBe('8:05 A.M.')
  })
})
