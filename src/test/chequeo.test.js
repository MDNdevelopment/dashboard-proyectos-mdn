import { describe, it, expect } from 'vitest'
import {
  currentFixedWeekN,
  mostRecentCheck,
  daysSince,
  recentCheckStatus,
  formatCheckDate,
  CONTENT_TYPES,
  CONTENT_LABELS,
  contentTypeApplies,
  WEEKLY_EXEMPT_NETWORKS,
  computePlataformasProductividad,
  MONTHLY_TARGET_PER_NETWORK,
} from '../utils/chequeo'
import { buildFixedWeeks } from '../utils/fixedTasks'

// Agosto 2026: miércoles 4, 11, 18, 25 → 4 semanas. S3 = monIni 16 ago, dom 22 ago.
const WEEKS = buildFixedWeeks(2026, 8)
const S3 = WEEKS.find((w) => w.n === 3)

describe('currentFixedWeekN', () => {
  it('devuelve la semana cuyo rango [monIni, dom] contiene la fecha', () => {
    expect(currentFixedWeekN(WEEKS, new Date(2026, 7, 20))).toBe(3)
    expect(currentFixedWeekN(WEEKS, S3.monIni)).toBe(3)
    expect(currentFixedWeekN(WEEKS, S3.dom)).toBe(3)
  })

  it('null si la fecha cae fuera de todas las semanas del mes', () => {
    expect(currentFixedWeekN(WEEKS, new Date('2026-09-15'))).toBeNull()
  })
})

describe('mostRecentCheck', () => {
  function check(overrides = {}) {
    return {
      client_id: 'c1',
      network: 'Instagram',
      content_type: 'publicaciones',
      last_published_at: '2026-08-05',
      period_week: 1,
      ...overrides,
    }
  }

  it('devuelve la celda con la fecha más reciente entre varias semanas', () => {
    const checks = [
      check({ period_week: 1, last_published_at: '2026-08-05' }),
      check({ period_week: 3, last_published_at: '2026-08-19' }),
      check({ period_week: 2, last_published_at: '2026-08-12' }),
    ]
    const result = mostRecentCheck(checks, 'c1', 'Instagram', 'publicaciones')
    expect(result.last_published_at).toBe('2026-08-19')
    expect(result.period_week).toBe(3)
  })

  it('ignora celdas de otro cliente/red/tipo de contenido', () => {
    const checks = [
      check({ client_id: 'c2', last_published_at: '2026-08-30' }),
      check({ network: 'Facebook', last_published_at: '2026-08-30' }),
      check({ content_type: 'reels', last_published_at: '2026-08-30' }),
      check({ last_published_at: '2026-08-05' }),
    ]
    expect(mostRecentCheck(checks, 'c1', 'Instagram', 'publicaciones').last_published_at).toBe(
      '2026-08-05',
    )
  })

  it('ignora filas sin fecha registrada', () => {
    const checks = [check({ last_published_at: null }), check({ last_published_at: '' })]
    expect(mostRecentCheck(checks, 'c1', 'Instagram', 'publicaciones')).toBeNull()
  })

  it('sin ninguna coincidencia → null', () => {
    expect(mostRecentCheck([], 'c1', 'Instagram', 'publicaciones')).toBeNull()
  })
})

describe('daysSince', () => {
  it('calcula días de calendario entre dos fechas', () => {
    expect(daysSince('2026-08-01', new Date(2026, 7, 13))).toBe(12)
    expect(daysSince('2026-08-13', new Date(2026, 7, 13))).toBe(0)
  })

  it('sin fecha → null', () => {
    expect(daysSince(null)).toBeNull()
  })
})

describe('recentCheckStatus', () => {
  it('sin fecha → vacio', () => {
    expect(recentCheckStatus(null, 'Instagram')).toBe('vacio')
  })

  it('0-5 días → normal, 6-11 → naranja, 12+ → rojo', () => {
    const today = new Date(2026, 7, 20)
    expect(recentCheckStatus('2026-08-16', 'Instagram', today)).toBe('normal') // 4 días
    expect(recentCheckStatus('2026-08-12', 'Instagram', today)).toBe('naranja') // 8 días
    expect(recentCheckStatus('2026-08-01', 'Instagram', today)).toBe('rojo') // 19 días
  })

  it('Mailchimp con fecha siempre es normal, sin importar cuán vieja', () => {
    expect(recentCheckStatus('2020-01-01', 'Mailchimp', new Date(2026, 7, 20))).toBe('normal')
  })

  it('YouTube (horizontal) solo pasa a rojo a los 30 días, nunca naranja', () => {
    const today = new Date(2026, 7, 20)
    expect(recentCheckStatus('2026-08-12', 'YouTube', today)).toBe('normal') // 8 días, no naranja
    expect(recentCheckStatus('2026-07-01', 'YouTube', today)).toBe('rojo') // 50 días
  })

  it('YouTube Shorts no está exento: usa el default 6/12 días', () => {
    expect(recentCheckStatus('2026-08-12', 'YouTube Shorts', new Date(2026, 7, 20))).toBe('naranja')
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

describe('WEEKLY_EXEMPT_NETWORKS', () => {
  it('incluye YouTube y Mailchimp, no YouTube Shorts', () => {
    expect(WEEKLY_EXEMPT_NETWORKS).toContain('YouTube')
    expect(WEEKLY_EXEMPT_NETWORKS).toContain('Mailchimp')
    expect(WEEKLY_EXEMPT_NETWORKS).not.toContain('YouTube Shorts')
  })
})

// ─── computePlataformasProductividad ───────────────────────────────────────────────

function client(overrides = {}) {
  return { id: 'c1', name: 'Cliente 1', fixed_tasks: null, social_links: [], ...overrides }
}

function clientNets(reds, overrides = {}) {
  return client({ social_links: reds.map((red) => ({ red, link: '' })), ...overrides })
}

function check(overrides = {}) {
  return {
    client_id: 'c1',
    network: 'Instagram',
    content_type: 'publicaciones',
    last_published_at: '2026-08-05',
    period_week: 1,
    ...overrides,
  }
}

describe('computePlataformasProductividad', () => {
  it('meta = celdas aplicables × MONTHLY_TARGET_PER_NETWORK (4), fija sin importar las semanas del mes', () => {
    // Instagram: publicaciones + reels + highlights aplican (3 celdas); Facebook: solo
    // publicaciones (1 celda) → 4 celdas × 4 = 16.
    const clients = [clientNets(['Instagram', 'Facebook'])]
    const row = computePlataformasProductividad([], clients)
    expect(row.nombre).toBe('Actualización de Plataformas')
    expect(MONTHLY_TARGET_PER_NETWORK).toBe(4)
    expect(row.meta).toBe(16)
    expect(row.realizado).toBe(0)
  })

  it('real cuenta las semanas (casillas) distintas con fecha registrada por celda, topado en 4', () => {
    const clients = [clientNets(['Instagram'])]
    const checks = [
      check({ period_week: 1 }),
      check({ period_week: 2 }),
      check({ period_week: 3 }),
      check({ period_week: 4 }),
    ]
    const row = computePlataformasProductividad(checks, clients)
    // 3 celdas de Instagram (publicaciones/reels/highlights) × 4 = 12 de meta.
    // Solo la celda "publicaciones" tiene registros: las 4 casillas del mes.
    expect(row.meta).toBe(12)
    expect(row.realizado).toBe(4)
  })

  it('en un mes de 5 semanas, 5 casillas registradas topan el real en 4 (no pasa del 100%)', () => {
    // Agosto 2026 solo tiene 4 miércoles; se simula un mes de 5 semanas con checks en
    // period_week 1-5 para una sola celda (Instagram/publicaciones).
    const clients = [clientNets(['Instagram'])]
    const checks = [1, 2, 3, 4, 5].map((week) => check({ period_week: week }))
    const row = computePlataformasProductividad(checks, clients)
    expect(row.realizado).toBe(4)
  })

  it('no cuenta registros de otra celda (network/content_type distintos)', () => {
    const clients = [clientNets(['Instagram'])]
    const checks = [check({ content_type: 'reels' }), check({ network: 'Facebook' })]
    const row = computePlataformasProductividad(checks, clients)
    // El registro de reels sí cuenta (Instagram aplica a reels); el de Facebook no
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
    const checks = [check()]
    const row = computePlataformasProductividad(checks, clients)
    expect(row.meta).toBe(0)
    expect(row.realizado).toBe(0)
  })

  it('redes exentas (YouTube/Mailchimp) tienen meta 1/mes, no 4/mes', () => {
    const clients = [clientNets(['YouTube'])]
    const row = computePlataformasProductividad([], clients)
    expect(row.meta).toBe(1)
  })

  it('redes exentas: basta un registro en cualquier semana del mes para cumplir', () => {
    const clients = [clientNets(['YouTube'])]
    const checks = [check({ network: 'YouTube', period_week: 2 })]
    const row = computePlataformasProductividad(checks, clients)
    expect(row.meta).toBe(1)
    expect(row.realizado).toBe(1)
  })
})
