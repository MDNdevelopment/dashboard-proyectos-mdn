import { describe, it, expect } from 'vitest'
import {
  daysSince,
  checkStatus,
  formatCheckDate,
  CONTENT_TYPES,
  CONTENT_LABELS,
  contentTypeApplies,
  computePlataformasProductividad,
} from '../utils/chequeo'

describe('daysSince', () => {
  it('cuenta días de calendario entre la fecha y hoy', () => {
    expect(daysSince('2026-08-13', new Date('2026-08-19T15:00:00'))).toBe(6)
    expect(daysSince('2026-08-19', new Date('2026-08-19T00:00:00'))).toBe(0)
  })

  it('devuelve null sin fecha o con fecha inválida', () => {
    expect(daysSince(null, new Date('2026-08-19'))).toBeNull()
    expect(daysSince('no-es-fecha', new Date('2026-08-19'))).toBeNull()
  })
})

describe('checkStatus', () => {
  const today = new Date('2026-08-19T12:00:00')

  it('sin fecha registrada → vacio', () => {
    expect(checkStatus(null, today)).toBe('vacio')
  })

  it('0-5 días → normal', () => {
    expect(checkStatus('2026-08-19', today)).toBe('normal') // 0 días
    expect(checkStatus('2026-08-14', today)).toBe('normal') // 5 días
  })

  it('6-11 días → naranja (fronteras)', () => {
    expect(checkStatus('2026-08-13', today)).toBe('naranja') // 6 días
    expect(checkStatus('2026-08-08', today)).toBe('naranja') // 11 días
  })

  it('12+ días → rojo (frontera)', () => {
    expect(checkStatus('2026-08-07', today)).toBe('rojo') // 12 días
    expect(checkStatus('2026-07-01', today)).toBe('rojo')
  })

  it('caso del enunciado: fecha de julio evaluada en agosto sigue en rojo', () => {
    // "post 18 jul" sin publicaciones nuevas, evaluado el 19 de agosto → 32 días.
    expect(checkStatus('2026-07-18', new Date('2026-08-19'))).toBe('rojo')
  })

  it('Mailchimp nunca entra en naranja/rojo, sin importar cuán vieja sea la fecha', () => {
    expect(checkStatus('2026-01-01', today, 'Mailchimp')).toBe('normal')
    expect(checkStatus('2020-01-01', today, 'Mailchimp')).toBe('normal')
    expect(checkStatus(today.toISOString().slice(0, 10), today, 'Mailchimp')).toBe('normal')
  })

  it('Mailchimp sin fecha sigue mostrando vacio', () => {
    expect(checkStatus(null, today, 'Mailchimp')).toBe('vacio')
  })

  it('YouTube (horizontal) nunca pasa por naranja: normal hasta el día 29, rojo al mes', () => {
    expect(checkStatus('2026-08-13', today, 'YouTube')).toBe('normal') // 6 días — sería naranja en el default
    expect(checkStatus('2026-08-07', today, 'YouTube')).toBe('normal') // 12 días — sería rojo en el default
    expect(checkStatus('2026-07-21', today, 'YouTube')).toBe('normal') // 29 días
    expect(checkStatus('2026-07-20', today, 'YouTube')).toBe('rojo') // 30 días
    expect(checkStatus('2026-01-01', today, 'YouTube')).toBe('rojo')
  })

  it('YouTube Shorts usa el default (igual que Instagram u otra red), no la regla de YouTube horizontal', () => {
    expect(checkStatus('2026-08-13', today, 'YouTube Shorts')).toBe('naranja') // 6 días
    expect(checkStatus('2026-08-07', today, 'YouTube Shorts')).toBe('rojo') // 12 días
  })
})

describe('formatCheckDate', () => {
  it('formatea como "18 jul"', () => {
    expect(formatCheckDate('2026-07-18')).toBe('18 jul')
  })

  it('sin fecha → null', () => {
    expect(formatCheckDate(null)).toBeNull()
    expect(formatCheckDate('')).toBeNull()
  })
})

describe('CONTENT_TYPES / CONTENT_LABELS', () => {
  it('expone los 3 tipos de contenido con su label', () => {
    expect(CONTENT_TYPES).toEqual(['publicaciones', 'reels', 'highlights'])
    CONTENT_TYPES.forEach((ct) => expect(CONTENT_LABELS[ct]).toBeTruthy())
  })
})

describe('contentTypeApplies', () => {
  it('publicaciones aplica a cualquier red', () => {
    expect(contentTypeApplies('Facebook', 'publicaciones')).toBe(true)
    expect(contentTypeApplies('Instagram', 'publicaciones')).toBe(true)
  })

  it('reels e highlights solo aplican a Instagram', () => {
    expect(contentTypeApplies('Instagram', 'reels')).toBe(true)
    expect(contentTypeApplies('Instagram', 'highlights')).toBe(true)
    expect(contentTypeApplies('Facebook', 'reels')).toBe(false)
    expect(contentTypeApplies('TikTok', 'highlights')).toBe(false)
  })
})

// ─── computePlataformasProductividad ───────────────────────────────────────────────

function client(overrides = {}) {
  return { id: 'c1', name: 'Cliente 1', fixed_tasks: null, social_links: [], ...overrides }
}

function clientNets(reds, overrides = {}) {
  return client({ social_links: reds.map((red) => ({ red, link: '' })), ...overrides })
}

function event(overrides = {}) {
  return {
    client_id: 'c1',
    network: 'Instagram',
    content_type: 'publicaciones',
    published_at: '2026-08-05',
    ...overrides,
  }
}

describe('computePlataformasProductividad', () => {
  it('meta = celdas aplicables × 4 (cadencia semanal)', () => {
    // Instagram: publicaciones + reels + highlights aplican (3 celdas); Facebook: solo
    // publicaciones (1 celda) → 4 celdas × 4 = 16.
    const clients = [clientNets(['Instagram', 'Facebook'])]
    const row = computePlataformasProductividad([], clients)
    expect(row.nombre).toBe('Actualización de Plataformas')
    expect(row.meta).toBe(16)
    expect(row.realizado).toBe(0)
  })

  it('real cuenta los eventos del mes por celda, topado en 4', () => {
    const clients = [clientNets(['Instagram'])]
    const events = [
      event({ published_at: '2026-08-05' }),
      event({ published_at: '2026-08-12' }),
      event({ published_at: '2026-08-19' }),
      event({ published_at: '2026-08-20' }),
      event({ published_at: '2026-08-21' }), // 5.ª: no suma más allá del tope
    ]
    const row = computePlataformasProductividad(events, clients)
    // 3 celdas de Instagram (publicaciones/reels/highlights) × 4 = 12 de meta.
    // Solo la celda "publicaciones" tiene eventos: 5 eventos, topados en 4.
    expect(row.meta).toBe(12)
    expect(row.realizado).toBe(4)
  })

  it('no cuenta eventos de otra celda (network/content_type distintos)', () => {
    const clients = [clientNets(['Instagram'])]
    const events = [event({ content_type: 'reels' }), event({ network: 'Facebook' })]
    const row = computePlataformasProductividad(events, clients)
    // El evento de reels sí cuenta (Instagram aplica a reels); el de Facebook no
    // (Facebook no está en las redes del cliente).
    expect(row.realizado).toBe(1)
  })

  it('cliente sin redes aporta 0 a la meta', () => {
    const row = computePlataformasProductividad([], [clientNets([])])
    expect(row.meta).toBe(0)
    expect(row.realizado).toBe(0)
  })

  it('social_links ausente se trata como sin redes', () => {
    const row = computePlataformasProductividad([], [client({ social_links: undefined })])
    expect(row.meta).toBe(0)
  })

  it('fixed_tasks.plataformas=false excluye la cuenta y todas sus redes', () => {
    const clients = [clientNets(['Instagram'], { fixed_tasks: { plataformas: false } })]
    const events = [event()]
    const row = computePlataformasProductividad(events, clients)
    expect(row.meta).toBe(0)
    expect(row.realizado).toBe(0)
  })
})
