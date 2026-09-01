import { describe, it, expect } from 'vitest'
import {
  CLOSURE_DAY,
  closurePeriod,
  isClosureWindow,
  daysLeftToClose,
  pendingLeadReports,
  shouldShowClosureReminder,
} from '../utils/reportClosure'

describe('reportClosure', () => {
  describe('closurePeriod', () => {
    it('devuelve el mes anterior dentro del mismo año', () => {
      expect(closurePeriod(new Date(Date.UTC(2026, 8, 3)))).toEqual({ year: 2026, month: 8 })
    })

    it('cruza de año cuando hoy es enero', () => {
      expect(closurePeriod(new Date(Date.UTC(2026, 0, 3)))).toEqual({ year: 2025, month: 12 })
    })
  })

  describe('isClosureWindow', () => {
    it('true del día 1 al CLOSURE_DAY', () => {
      expect(isClosureWindow(new Date(Date.UTC(2026, 8, 1)))).toBe(true)
      expect(isClosureWindow(new Date(Date.UTC(2026, 8, CLOSURE_DAY)))).toBe(true)
    })

    it('false fuera de la ventana', () => {
      expect(isClosureWindow(new Date(Date.UTC(2026, 8, CLOSURE_DAY + 1)))).toBe(false)
      expect(isClosureWindow(new Date(Date.UTC(2026, 8, 28)))).toBe(false)
    })
  })

  describe('daysLeftToClose', () => {
    it('día 1 → CLOSURE_DAY - 1', () => {
      expect(daysLeftToClose(new Date(Date.UTC(2026, 8, 1)))).toBe(CLOSURE_DAY - 1)
    })

    it('día del cierre → 0', () => {
      expect(daysLeftToClose(new Date(Date.UTC(2026, 8, CLOSURE_DAY)))).toBe(0)
    })

    it('nunca negativo pasado el día de cierre', () => {
      expect(daysLeftToClose(new Date(Date.UTC(2026, 8, CLOSURE_DAY + 3)))).toBe(0)
    })
  })

  describe('pendingLeadReports', () => {
    const lines = [
      { id: 'l1', name: 'Redes', lead_user_id: 'u1' },
      { id: 'l2', name: 'Diseño', lead_user_id: 'u2' },
      { id: 'l3', name: 'Audiovisual', lead_user_id: 'u1' },
    ]

    it('una línea sin fila de reporte cuenta como pendiente', () => {
      const pending = pendingLeadReports(lines, [], 'u1')
      expect(pending.map((l) => l.id)).toEqual(['l1', 'l3'])
    })

    it('una línea con closed_at ya no está pendiente', () => {
      const reports = [
        { line_id: 'l1', closed_at: '2026-09-05T10:00:00Z' },
        { line_id: 'l3', closed_at: null },
      ]
      const pending = pendingLeadReports(lines, reports, 'u1')
      expect(pending.map((l) => l.id)).toEqual(['l3'])
    })

    it('líneas que el usuario no lidera nunca aparecen', () => {
      expect(pendingLeadReports(lines, [], 'u2')).toEqual([
        { id: 'l2', name: 'Diseño', lead_user_id: 'u2' },
      ])
    })

    it('sin userId devuelve vacío', () => {
      expect(pendingLeadReports(lines, [], null)).toEqual([])
    })
  })

  describe('shouldShowClosureReminder', () => {
    const now = new Date(Date.UTC(2026, 8, 3))
    const pending = [{ id: 'l1' }]

    it('false fuera de la ventana de avisos', () => {
      const outOfWindow = new Date(Date.UTC(2026, 8, 20))
      expect(shouldShowClosureReminder({ pending, seenDate: null, now: outOfWindow })).toBe(false)
    })

    it('false si ya se vio hoy', () => {
      expect(shouldShowClosureReminder({ pending, seenDate: '2026-09-03', now })).toBe(false)
    })

    it('false sin pendientes', () => {
      expect(shouldShowClosureReminder({ pending: [], seenDate: null, now })).toBe(false)
    })

    it('true dentro de la ventana, con pendientes y sin ver hoy', () => {
      expect(shouldShowClosureReminder({ pending, seenDate: '2026-09-02', now })).toBe(true)
      expect(shouldShowClosureReminder({ pending, seenDate: null, now })).toBe(true)
    })
  })
})
