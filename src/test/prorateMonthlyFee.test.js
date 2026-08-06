import { describe, it, expect } from 'vitest'
import { prorateMonthlyFee, daysInMonth, firstOfNextMonthISO } from '../utils/prorateMonthlyFee'

describe('firstOfNextMonthISO', () => {
  it('mes normal → 1° del mes siguiente', () => {
    expect(firstOfNextMonthISO(new Date(2026, 7, 20))).toBe('2026-09-01') // agosto → septiembre
    expect(firstOfNextMonthISO(new Date(2026, 0, 1))).toBe('2026-02-01')
  })
  it('diciembre → enero del año siguiente', () => {
    expect(firstOfNextMonthISO(new Date(2026, 11, 15))).toBe('2027-01-01')
  })
})

describe('daysInMonth', () => {
  it('meses de 31, 30 y 28/29 días', () => {
    expect(daysInMonth(2026, 8)).toBe(31) // agosto
    expect(daysInMonth(2026, 4)).toBe(30) // abril
    expect(daysInMonth(2026, 2)).toBe(28) // febrero no bisiesto
    expect(daysInMonth(2028, 2)).toBe(29) // febrero bisiesto
  })
})

describe('prorateMonthlyFee', () => {
  it('cambio el día 2: casi todo va a la línea nueva', () => {
    // effectiveDay=2 → 1 día vieja, 30 nueva (mes de 31)
    const r = prorateMonthlyFee(1000, 2, 31)
    expect(r.oldDays).toBe(1)
    expect(r.newDays).toBe(30)
    expect(r.oldAmount).toBe(32.26) // 1000 * 1/31
    expect(r.newAmount).toBe(967.74)
    expect(r.oldAmount + r.newAmount).toBe(1000)
  })

  it('cambio el día 29: casi todo se queda en la vieja', () => {
    // effectiveDay=29 → 28 días vieja, 3 nueva (mes de 31)
    const r = prorateMonthlyFee(1000, 29, 31)
    expect(r.oldDays).toBe(28)
    expect(r.newDays).toBe(3)
    expect(r.oldAmount).toBe(903.23) // 1000 * 28/31
    expect(r.newAmount).toBe(96.77)
    expect(r.oldAmount + r.newAmount).toBe(1000)
  })

  it('la suma vieja + nueva SIEMPRE es exactamente el fee (sin drift)', () => {
    for (let day = 1; day <= 32; day++) {
      const r = prorateMonthlyFee(999.99, day, 31)
      expect(r.oldAmount + r.newAmount).toBeCloseTo(999.99, 2)
    }
  })

  it('mes de 28 y 30 días reparten sobre el total correcto', () => {
    const feb = prorateMonthlyFee(280, 15, 28) // 14 días vieja de 28 = mitad
    expect(feb.oldAmount).toBe(140)
    expect(feb.newAmount).toBe(140)

    const abr = prorateMonthlyFee(300, 11, 30) // 10 días vieja de 30
    expect(abr.oldAmount).toBe(100)
    expect(abr.newAmount).toBe(200)
  })

  it('día 1 = todo a la nueva; día > totalDays = todo a la vieja', () => {
    const d1 = prorateMonthlyFee(500, 1, 31)
    expect(d1.oldAmount).toBe(0)
    expect(d1.newAmount).toBe(500)

    const dLate = prorateMonthlyFee(500, 40, 31) // clamp a total+1
    expect(dLate.newAmount).toBe(0)
    expect(dLate.oldAmount).toBe(500)
  })

  it('fee nulo/indefinido → 0 sin romper', () => {
    const r = prorateMonthlyFee(null, 15, 31)
    expect(r.oldAmount).toBe(0)
    expect(r.newAmount).toBe(0)
  })
})
