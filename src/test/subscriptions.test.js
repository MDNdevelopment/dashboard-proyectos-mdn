import {
  nextBillingDate,
  missingInfo,
  daysUntil,
  monthlyEquivalent,
  totalsByCurrency,
  formatAmount,
} from '../utils/subscriptions'

const sub = (over = {}) => ({
  status: 'activa',
  frequency: 'mensual',
  billing_day: 15,
  billing_month: null,
  amount: 12,
  currency: 'USD',
  ...over,
})

describe('nextBillingDate', () => {
  it('mensual: este mes si el día aún no pasó', () => {
    expect(nextBillingDate(sub(), '2026-10-10')).toBe('2026-10-15')
  })

  it('mensual: cobra hoy si el día es hoy', () => {
    expect(nextBillingDate(sub(), '2026-10-15')).toBe('2026-10-15')
  })

  it('mensual: pasa al mes siguiente si el día ya pasó', () => {
    expect(nextBillingDate(sub(), '2026-10-16')).toBe('2026-11-15')
  })

  it('mensual: cruza de año', () => {
    expect(nextBillingDate(sub(), '2026-12-20')).toBe('2027-01-15')
  })

  it('día 31 cae en el último día de meses cortos', () => {
    expect(nextBillingDate(sub({ billing_day: 31 }), '2026-02-10')).toBe('2026-02-28')
    expect(nextBillingDate(sub({ billing_day: 31 }), '2026-04-10')).toBe('2026-04-30')
  })

  it('día 29-31 en febrero bisiesto', () => {
    expect(nextBillingDate(sub({ billing_day: 30 }), '2028-02-10')).toBe('2028-02-29')
  })

  it('trimestral: sigue la rejilla de 3 meses desde el mes ancla', () => {
    const s = sub({ frequency: 'trimestral', billing_month: 2 }) // feb, may, ago, nov
    expect(nextBillingDate(s, '2026-10-01')).toBe('2026-11-15')
    expect(nextBillingDate(s, '2026-11-16')).toBe('2027-02-15')
  })

  it('anual: espera al mes de cobro del año siguiente', () => {
    const s = sub({ frequency: 'anual', billing_month: 3 })
    expect(nextBillingDate(s, '2026-10-01')).toBe('2027-03-15')
    expect(nextBillingDate(s, '2026-03-01')).toBe('2026-03-15')
  })

  it('sin día de cobro (fecha por confirmar) no hay próximo cobro', () => {
    expect(nextBillingDate(sub({ billing_day: null }), '2026-10-10')).toBeNull()
  })

  it('pausada o cancelada no tiene próximo cobro', () => {
    expect(nextBillingDate(sub({ status: 'pausada' }), '2026-10-10')).toBeNull()
    expect(nextBillingDate(sub({ status: 'cancelada' }), '2026-10-10')).toBeNull()
  })
})

describe('missingInfo', () => {
  it('lista lo que falta en una suscripción abierta', () => {
    expect(missingInfo(sub({ card_last4: null }))).toEqual(['tarjeta'])
    expect(missingInfo(sub({ card_last4: '1234', billing_day: null }))).toEqual(['fecha de cobro'])
    expect(missingInfo(sub({ card_last4: null, billing_day: null }))).toEqual([
      'tarjeta',
      'fecha de cobro',
    ])
    expect(missingInfo(sub({ card_last4: '1234' }))).toEqual([])
  })

  it('una cancelada ya no necesita datos', () => {
    expect(missingInfo(sub({ status: 'cancelada', card_last4: null }))).toEqual([])
  })
})

describe('daysUntil', () => {
  it('cuenta días calendario, también entre meses', () => {
    expect(daysUntil('2026-10-15', '2026-10-15')).toBe(0)
    expect(daysUntil('2026-11-02', '2026-10-30')).toBe(3)
  })
})

describe('monthlyEquivalent / totalsByCurrency', () => {
  it('prorratea trimestral y anual', () => {
    expect(monthlyEquivalent(sub({ amount: 30, frequency: 'trimestral' }))).toBe(10)
    expect(monthlyEquivalent(sub({ amount: 120, frequency: 'anual' }))).toBe(10)
  })

  it('suma por moneda y solo activas', () => {
    const totals = totalsByCurrency([
      sub({ amount: 10 }),
      sub({ amount: 120, frequency: 'anual' }),
      sub({ amount: 500, currency: 'Bs' }),
      sub({ amount: 99, status: 'cancelada' }),
    ])
    expect(totals).toEqual({ USD: 20, Bs: 500 })
  })
})

describe('formatAmount', () => {
  it('antepone el símbolo según la moneda', () => {
    expect(formatAmount(5, 'USD').startsWith('$')).toBe(true)
    expect(formatAmount(5, 'EUR').startsWith('€')).toBe(true)
    expect(formatAmount(5, 'Bs').startsWith('Bs ')).toBe(true)
  })
})
