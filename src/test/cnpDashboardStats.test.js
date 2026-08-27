import { describe, it, expect } from 'vitest'
import {
  cnpInMonth,
  cnpMonthStats,
  cnpPieceCount,
  cnpPiecesDelivered,
} from '../components/cnp/constants'
import { currentMonthIndex } from '../components/tareas/constants'

const THIS_MONTH = currentMonthIndex()

function makeCnp(overrides = {}) {
  return {
    id: 'c1',
    status: 'Pendiente',
    is_print: false,
    print_approved_at: null,
    due_date: null,
    created_at: new Date().toISOString(),
    ...overrides,
  }
}

describe('cnpInMonth', () => {
  it('returns false without created_at', () => {
    expect(cnpInMonth({}, THIS_MONTH)).toBe(false)
  })

  it('matches the calendar month of created_at', () => {
    const cnp = makeCnp({ created_at: new Date(2026, 0, 15).toISOString() })
    expect(cnpInMonth(cnp, 0 + 2026 * 12)).toBe(true)
    expect(cnpInMonth(cnp, 1 + 2026 * 12)).toBe(false)
  })
})

describe('cnpMonthStats', () => {
  it('counts total/closed/pct scoped to the active month only', () => {
    const cnps = [
      makeCnp({ id: 'a', status: 'Terminado' }),
      makeCnp({ id: 'b', status: 'Pendiente' }),
      // fuera del mes activo: no debe contar en total/closed/pct
      makeCnp({ id: 'c', status: 'Terminado', created_at: new Date(2000, 0, 1).toISOString() }),
    ]
    const stats = cnpMonthStats(cnps, THIS_MONTH)
    expect(stats.total).toBe(2)
    expect(stats.closed).toBe(1)
    expect(stats.pct).toBe(50)
    expect(stats.inMonth).toHaveLength(2)
  })

  it('returns 0% with no movement in the month', () => {
    const stats = cnpMonthStats([], THIS_MONTH)
    expect(stats).toMatchObject({
      total: 0,
      closed: 0,
      pct: 0,
      blocked: 0,
      late: 0,
      printPending: 0,
    })
  })

  it('counts blocked and late across the whole scope, not just the active month', () => {
    const cnps = [
      makeCnp({
        id: 'blocked-old',
        status: 'Paralizado',
        created_at: new Date(2000, 0, 1).toISOString(),
      }),
      makeCnp({
        id: 'late-old',
        status: 'Pendiente',
        due_date: '2000-01-01',
        created_at: new Date(2000, 0, 1).toISOString(),
      }),
    ]
    const stats = cnpMonthStats(cnps, THIS_MONTH)
    expect(stats.blocked).toBe(1)
    expect(stats.late).toBe(1)
    // no forman parte del mes activo
    expect(stats.total).toBe(0)
  })

  it('counts print-pending regardless of the team check, only requiring the print approval', () => {
    const cnps = [
      makeCnp({ id: 'no-team-check', is_print: true }),
      makeCnp({ id: 'approved', is_print: true, print_approved_at: new Date().toISOString() }),
      makeCnp({ id: 'not-printed', is_print: false }),
    ]
    const stats = cnpMonthStats(cnps, THIS_MONTH)
    expect(stats.printPending).toBe(1)
  })

  it('counts piezas/piezasEntregadas scoped to the active month', () => {
    const cnps = [
      // sin pieces -> 1 pieza, no entregada (no cerrado)
      makeCnp({ id: 'single' }),
      // 3 piezas, 1 entregada
      makeCnp({
        id: 'multi',
        pieces: [
          { id: 'p1', label: 'p1', done: true },
          { id: 'p2', label: 'p2', done: false },
          { id: 'p3', label: 'p3', done: false },
        ],
      }),
      // fuera del mes activo: no debe contar
      makeCnp({
        id: 'old',
        pieces: [{ id: 'p1', label: 'p1', done: false }],
        created_at: new Date(2000, 0, 1).toISOString(),
      }),
    ]
    const stats = cnpMonthStats(cnps, THIS_MONTH)
    expect(stats.piezas).toBe(4)
    expect(stats.piezasEntregadas).toBe(1)
  })
})

describe('cnpPieceCount', () => {
  it('returns 1 when pieces is missing or empty', () => {
    expect(cnpPieceCount({})).toBe(1)
    expect(cnpPieceCount({ pieces: [] })).toBe(1)
  })

  it('returns the list length when pieces has items', () => {
    expect(cnpPieceCount({ pieces: [{ id: '1' }, { id: '2' }] })).toBe(2)
  })
})

describe('cnpPiecesDelivered', () => {
  it('counts only the checked pieces while the CNP is open', () => {
    const cnp = {
      status: 'En proceso',
      pieces: [
        { id: '1', done: true },
        { id: '2', done: false },
      ],
    }
    expect(cnpPiecesDelivered(cnp)).toBe(1)
  })

  it('returns 0 for a single-piece CNP that is still open', () => {
    expect(cnpPiecesDelivered({ status: 'Pendiente' })).toBe(0)
  })

  it('counts every piece as delivered once the CNP is Terminado, even unchecked ones', () => {
    const cnp = {
      status: 'Terminado',
      pieces: [
        { id: '1', done: false },
        { id: '2', done: false },
        { id: '3', done: false },
      ],
    }
    expect(cnpPiecesDelivered(cnp)).toBe(3)
  })
})
