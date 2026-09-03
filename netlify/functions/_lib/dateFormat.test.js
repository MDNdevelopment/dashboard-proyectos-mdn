import { describe, it, expect } from 'vitest'
import { normalizeDatesToDDMMYYYY } from './dateFormat.js'

describe('normalizeDatesToDDMMYYYY', () => {
  it('convierte fechas ISO (YYYY-MM-DD) a dd/mm/aaaa', () => {
    expect(normalizeDatesToDDMMYYYY('El 2026-09-02 fue a 3 pautas.')).toBe(
      'El 02/09/2026 fue a 3 pautas.',
    )
  })

  it('convierte fechas dd-mm-aaaa (guiones) a dd/mm/aaaa (barras)', () => {
    expect(normalizeDatesToDDMMYYYY('El 02-09-2026 fue a 3 pautas.')).toBe(
      'El 02/09/2026 fue a 3 pautas.',
    )
  })

  it('deja intactas las fechas que ya vienen en dd/mm/aaaa', () => {
    expect(normalizeDatesToDDMMYYYY('El 02/09/2026 fue a 3 pautas.')).toBe(
      'El 02/09/2026 fue a 3 pautas.',
    )
  })

  it('convierte varias fechas en el mismo texto', () => {
    expect(normalizeDatesToDDMMYYYY('Entre 2026-08-30 y 2026-09-05.')).toBe(
      'Entre 30/08/2026 y 05/09/2026.',
    )
  })

  it('no toca texto sin fechas', () => {
    expect(normalizeDatesToDDMMYYYY('Ana Pérez tuvo carga alta.')).toBe(
      'Ana Pérez tuvo carga alta.',
    )
  })

  it('devuelve el input tal cual si es null/undefined/vacío', () => {
    expect(normalizeDatesToDDMMYYYY(null)).toBeNull()
    expect(normalizeDatesToDDMMYYYY(undefined)).toBeUndefined()
    expect(normalizeDatesToDDMMYYYY('')).toBe('')
  })
})
