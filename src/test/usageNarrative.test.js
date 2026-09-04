import { describe, it, expect } from 'vitest'
import { buildUsageNarrative } from '../utils/usageNarrative'
import { USAGE_MODULES } from '../utils/aggregateUsageMonitor'

function zeroCounts(overrides = {}) {
  const c = {}
  USAGE_MODULES.forEach((m) => {
    c[m.key] = 0
  })
  return { ...c, ...overrides }
}

function baseLine(overrides = {}) {
  return {
    lineName: 'Team Bianca',
    lead: { userId: 'jefa-1', name: 'Bianca R.' },
    counts: zeroCounts(),
    total: 0,
    prevMonth: zeroCounts(),
    members: [],
    external: [],
    ...overrides,
  }
}

describe('buildUsageNarrative', () => {
  it('dice explícitamente que nadie del equipo registró actividad', () => {
    const text = buildUsageNarrative(
      baseLine({ members: [{ userId: 'm1', name: 'María Vanessa', total: 0 }] }),
      8,
    )
    expect(text).toContain('Ningún miembro del equipo registró actividad este mes.')
  })

  it('nombra al único miembro del equipo con actividad y su aporte exacto', () => {
    const text = buildUsageNarrative(
      baseLine({ members: [{ userId: 'm1', name: 'María Vanessa', total: 6 }] }),
      8,
    )
    expect(text).toContain(
      'María Vanessa es la única del equipo con actividad — aportó 6 acciones adicionales.',
    )
  })

  it('lista los módulos en cero del equipo', () => {
    const text = buildUsageNarrative(
      baseLine({ counts: zeroCounts({ tareas: 0, cnp: 0, pautasAv: 0 }) }),
      8,
    )
    expect(text).toMatch(/cero en/)
    expect(text).toContain('cero en tareas')
    expect(text).toContain('cero en cnp')
    expect(text).toContain('cero en pautas av')
  })

  it('sin ceros, destaca el módulo más fuerte', () => {
    const counts = zeroCounts({ reuniones: 3, tareas: 1, tareasFijas: 2, cnp: 1, pautasAv: 1 })
    const text = buildUsageNarrative(baseLine({ counts }), 8)
    expect(text).toContain('El equipo concentra su uso en reuniones.')
  })

  it('señala una caída mes a mes con las cifras correctas', () => {
    const text = buildUsageNarrative(
      baseLine({
        counts: zeroCounts({ tareas: 0, reuniones: 1, tareasFijas: 1, cnp: 1, pautasAv: 1 }),
        prevMonth: zeroCounts({ tareas: 42 }),
      }),
      7,
    )
    expect(text).toContain('Tareas cayó de 42 en Julio a 0 este mes.')
  })

  it('marca el apoyo externo aparte, sin sumarlo a jefa ni equipo', () => {
    const text = buildUsageNarrative(
      baseLine({ external: [{ userId: 'e1', name: 'Paola G.', total: 3 }] }),
      8,
    )
    expect(text).toContain('Paola G. (3)')
    expect(text).toContain('apoyo externo')
  })

  it('sin jefa asignada, no inventa datos', () => {
    const text = buildUsageNarrative(baseLine({ lead: null }), 8)
    expect(text).toContain('no tiene una jefa de línea asignada')
  })

  it('es determinístico: mismo input produce el mismo texto', () => {
    const input = baseLine({ members: [{ userId: 'm1', name: 'María Vanessa', total: 6 }] })
    expect(buildUsageNarrative(input, 8)).toBe(buildUsageNarrative(input, 8))
  })
})
