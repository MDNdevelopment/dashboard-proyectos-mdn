import { getTicketAgeHours, getSlaThresholdHours, getSlaStatusKey } from '../components/tickets/slaUtils'

const NOW = new Date('2026-05-21T12:00:00Z').getTime()

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(NOW)
})

afterEach(() => {
  vi.useRealTimers()
})

describe('getTicketAgeHours', () => {
  it('calcula horas desde created_at hasta ahora para tickets abiertos', () => {
    const ticket = { created_at: '2026-05-21T10:00:00Z', status: 'abierto' }
    expect(getTicketAgeHours(ticket)).toBeCloseTo(2)
  })

  it('usa resolved_at si el ticket esta resuelto', () => {
    const ticket = {
      created_at: '2026-05-21T10:00:00Z',
      resolved_at: '2026-05-21T14:00:00Z',
      status: 'resuelto',
    }
    expect(getTicketAgeHours(ticket)).toBeCloseTo(4)
  })
})

describe('getSlaThresholdHours', () => {
  it('urgente=4h', () => expect(getSlaThresholdHours('urgente')).toBe(4))
  it('alta=12h', () => expect(getSlaThresholdHours('alta')).toBe(12))
  it('media=24h', () => expect(getSlaThresholdHours('media')).toBe(24))
  it('baja=48h', () => expect(getSlaThresholdHours('baja')).toBe(48))
  it('prioridad desconocida retorna 24h por defecto', () => {
    expect(getSlaThresholdHours('desconocida')).toBe(24)
  })
})

describe('getSlaStatusKey', () => {
  it('retorna null para tickets resueltos', () => {
    const ticket = { created_at: '2026-05-21T10:00:00Z', status: 'resuelto', priority: 'alta' }
    expect(getSlaStatusKey(ticket)).toBeNull()
  })

  it('retorna overdue cuando se supero el umbral SLA', () => {
    // urgente=4h, ticket de hace 5h
    const ticket = { created_at: '2026-05-21T07:00:00Z', status: 'abierto', priority: 'urgente' }
    expect(getSlaStatusKey(ticket)).toBe('overdue')
  })

  it('retorna warning cuando supera el 75% del umbral', () => {
    // urgente=4h, 75% = 3h. Ticket de hace 3.5h (en zona warning)
    const ticket = { created_at: '2026-05-21T08:30:00Z', status: 'abierto', priority: 'urgente' }
    expect(getSlaStatusKey(ticket)).toBe('warning')
  })

  it('retorna on_track cuando esta dentro del umbral', () => {
    // urgente=4h, ticket de hace 1h
    const ticket = { created_at: '2026-05-21T11:00:00Z', status: 'abierto', priority: 'urgente' }
    expect(getSlaStatusKey(ticket)).toBe('on_track')
  })

  it('aplica correctamente el umbral de prioridad baja (48h)', () => {
    // baja=48h, ticket de hace 24h => on_track
    const ticket = { created_at: '2026-05-20T12:00:00Z', status: 'en_progreso', priority: 'baja' }
    expect(getSlaStatusKey(ticket)).toBe('on_track')
  })
})
