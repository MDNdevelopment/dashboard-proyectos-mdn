import { describe, it, expect } from 'vitest'
import { buildChatSeed } from '../lib/avWorkloadSeed'
import { MAX_MESSAGE_LENGTH } from '../lib/aiChatHistory'

describe('buildChatSeed', () => {
  it('incluye el resumen y cada hallazgo con persona, detalle y sugerencia', () => {
    const seed = buildChatSeed({
      resumen: 'Ana Pérez tuvo carga alta el 2026-09-02.',
      hallazgos: [
        {
          persona: 'Ana Pérez',
          detalle: 'Fue a 3 pautas el 2 de septiembre.',
          sugerencia: 'Hablar con ella.',
        },
      ],
    })
    expect(seed).toContain('Ana Pérez tuvo carga alta el 2026-09-02.')
    expect(seed).toContain('Ana Pérez')
    expect(seed).toContain('Fue a 3 pautas el 2 de septiembre.')
    expect(seed).toContain('Hablar con ella.')
    expect(seed).toContain('¿Qué quieres saber sobre esto?')
  })

  it('funciona con varios hallazgos', () => {
    const seed = buildChatSeed({
      resumen: 'Dos personas con carga alta.',
      hallazgos: [
        { persona: 'Ana Pérez', detalle: 'd1', sugerencia: 's1' },
        { persona: 'Luis Gómez', detalle: 'd2', sugerencia: 's2' },
      ],
    })
    expect(seed).toContain('Ana Pérez')
    expect(seed).toContain('Luis Gómez')
  })

  it('se recorta a MAX_MESSAGE_LENGTH caracteres', () => {
    const hallazgos = Array.from({ length: 50 }, (_, i) => ({
      persona: `Persona ${i}`,
      detalle: 'x'.repeat(100),
      sugerencia: 'y'.repeat(100),
    }))
    const seed = buildChatSeed({ resumen: 'resumen', hallazgos })
    expect(seed.length).toBeLessThanOrEqual(MAX_MESSAGE_LENGTH)
  })

  it('no revienta si insight es undefined o sin hallazgos', () => {
    expect(() => buildChatSeed(undefined)).not.toThrow()
    expect(buildChatSeed({ resumen: 'todo tranquilo', hallazgos: [] })).toContain('todo tranquilo')
  })
})
