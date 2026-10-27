import { describe, it, expect } from 'vitest'
import { combineScores, resolveEmployeeNota, notaColor } from '../utils/employeeCombinedScore'

describe('combineScores', () => {
  it('combina 70/30 cuando hay score automático y evaluación del jefe', () => {
    // auto 87/100 → 8.7/10; jefe 9.2/10 → 0.7*8.7 + 0.3*9.2 = 8.85
    const result = combineScores({ score: 87, managerAvg: 9.2 })
    expect(result.fuente).toBe('ambos')
    expect(result.autoSobre10).toBe(8.7)
    expect(result.nota).toBeCloseTo(8.85, 2)
  })

  it('usa solo el score automático si el jefe no evaluó', () => {
    const result = combineScores({ score: 80, managerAvg: null })
    expect(result.fuente).toBe('solo_auto')
    expect(result.nota).toBe(8)
    expect(result.aporteJefe).toBe(0)
  })

  it('usa solo la evaluación del jefe cuando no hay score automático (cargo sin indicadores)', () => {
    const result = combineScores({ score: null, managerAvg: 9 })
    expect(result.fuente).toBe('solo_jefe')
    expect(result.nota).toBe(9)
    expect(result.autoSobre10).toBeNull()
    expect(result.aporteAuto).toBe(0)
  })

  it('devuelve sin_datos si no hay ninguno de los dos', () => {
    const result = combineScores({ score: null, managerAvg: null })
    expect(result.fuente).toBe('sin_datos')
    expect(result.nota).toBeNull()
  })

  it('maneja score = 0 como dato válido, no como ausente', () => {
    const result = combineScores({ score: 0, managerAvg: 6 })
    expect(result.fuente).toBe('ambos')
    expect(result.autoSobre10).toBe(0)
    expect(result.nota).toBe(1.8)
  })
})

describe('resolveEmployeeNota', () => {
  const rating = (score) => ({ items: [{ criterion_id: 'c1', score }] })
  const criteria = [{ id: 'c1', icon: '⭐', name: 'Calidad' }]

  it('combina automático + jefe cuando el cargo tiene criterios y ambos existen', () => {
    const nota = resolveEmployeeNota({
      result: { score: 87 },
      managerRating: rating(9.2),
      criteria,
    })
    expect(nota.hasCriteria).toBe(true)
    expect(nota.fuente).toBe('ambos')
    expect(nota.nota).toBeCloseTo(8.85, 2)
  })

  it('usa solo el automático cuando el cargo no tiene criterios, aunque exista un rating viejo', () => {
    const nota = resolveEmployeeNota({
      result: { score: 80 },
      managerRating: rating(9.2),
      criteria: [],
    })
    expect(nota.hasCriteria).toBe(false)
    expect(nota.nota).toBe(8)
  })

  it('sin score ni jefe devuelve nota null', () => {
    const nota = resolveEmployeeNota({ result: { score: null }, managerRating: null, criteria })
    expect(nota.nota).toBeNull()
    expect(nota.fuente).toBe('sin_datos')
  })

  it('sin result (undefined) no rompe, trata el score como ausente', () => {
    const nota = resolveEmployeeNota({ result: null, managerRating: rating(8), criteria })
    expect(nota.fuente).toBe('solo_jefe')
    expect(nota.nota).toBe(8)
  })
})

describe('notaColor', () => {
  it('null → gris', () => {
    expect(notaColor(null)).toBe('#bbb')
  })

  it('nota alta (>=8) → verde', () => {
    expect(notaColor(9)).toBe('#10B981')
  })

  it('nota baja (<6) → rojo', () => {
    expect(notaColor(4)).toBe('#EF4444')
  })
})
