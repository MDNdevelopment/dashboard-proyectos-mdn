import { describe, it, expect } from 'vitest'
import {
  isoWeek,
  parseD,
  today,
  daysBetween,
  taskWeek,
  fmtShort,
  isClosed,
  isLate,
  isDragged,
  isBlocked,
  lightOf,
  teamWeekStats,
} from '../components/tareas/constants'

// ─── isoWeek ────────────────────────────────────────────────────────────────
describe('isoWeek', () => {
  it('returns correct ISO week for a known Monday', () => {
    expect(isoWeek(new Date(2026, 5, 22))).toBe(26)
  })

  it('returns the same week for all days Mon–Sun', () => {
    const weeks = [22, 23, 24, 25, 26, 27, 28].map(d => isoWeek(new Date(2026, 5, d)))
    expect(new Set(weeks).size).toBe(1)
    expect(weeks[0]).toBe(26)
  })

  it('week 2 for Jan 5, 2026', () => {
    expect(isoWeek(new Date(2026, 0, 5))).toBe(2)
  })
})

// ─── parseD ──────────────────────────────────────────────────────────────────
describe('parseD', () => {
  it('parses YYYY-MM-DD string to local Date', () => {
    const d = parseD('2026-06-15')
    expect(d).toBeInstanceOf(Date)
    expect(d.getFullYear()).toBe(2026)
    expect(d.getMonth()).toBe(5)
    expect(d.getDate()).toBe(15)
  })

  it('returns null for empty/falsy input', () => {
    expect(parseD('')).toBeNull()
    expect(parseD(null)).toBeNull()
    expect(parseD(undefined)).toBeNull()
  })
})

// ─── daysBetween ─────────────────────────────────────────────────────────────
describe('daysBetween', () => {
  it('calculates positive diff correctly', () => {
    const a = new Date(2026, 0, 1)
    const b = new Date(2026, 0, 11)
    expect(daysBetween(a, b)).toBe(10)
  })

  it('returns 0 for same date', () => {
    const d = new Date(2026, 5, 15)
    expect(daysBetween(d, d)).toBe(0)
  })
})

// ─── taskWeek ────────────────────────────────────────────────────────────────
describe('taskWeek', () => {
  it('returns the ISO week of request_date', () => {
    expect(taskWeek({ request_date: '2026-06-22' })).toBe(26)
  })

  it('returns null when request_date is missing', () => {
    expect(taskWeek({ request_date: null })).toBeNull()
    expect(taskWeek({ request_date: '' })).toBeNull()
  })
})

// ─── fmtShort ────────────────────────────────────────────────────────────────
describe('fmtShort', () => {
  it('returns "—" for null/empty', () => {
    expect(fmtShort(null)).toBe('—')
    expect(fmtShort('')).toBe('—')
  })

  it('returns a formatted date string for a valid date', () => {
    const result = fmtShort('2026-06-15')
    expect(typeof result).toBe('string')
    expect(result.length).toBeGreaterThan(2)
    expect(result).not.toBe('—')
  })
})

// ─── isClosed ────────────────────────────────────────────────────────────────
describe('isClosed', () => {
  it('returns true for Terminado', () => {
    expect(isClosed({ status: 'Terminado' })).toBe(true)
  })

  it('returns false for other statuses', () => {
    for (const s of ['En proceso', 'Por revisar', 'Bloqueado', 'Pendiente']) {
      expect(isClosed({ status: s })).toBe(false)
    }
  })
})

// ─── isLate ──────────────────────────────────────────────────────────────────
describe('isLate', () => {
  it('returns false for a closed task regardless of date', () => {
    expect(isLate({ status: 'Terminado', due_date: '2000-01-01' })).toBe(false)
  })

  it('returns true when due_date is in the past', () => {
    expect(isLate({ status: 'En proceso', due_date: '2020-01-01' })).toBe(true)
  })

  it('returns false when due_date is in the future', () => {
    expect(isLate({ status: 'En proceso', due_date: '2099-12-31' })).toBe(false)
  })

  it('returns false when no due_date', () => {
    expect(isLate({ status: 'En proceso', due_date: null })).toBe(false)
  })
})

// ─── isDragged ───────────────────────────────────────────────────────────────
describe('isDragged', () => {
  it('returns false for a closed task', () => {
    expect(isDragged({ status: 'Terminado', request_date: '2020-01-01' })).toBe(false)
  })

  it('returns true when task was requested more than 7 days ago', () => {
    expect(isDragged({ status: 'En proceso', request_date: '2020-01-01' })).toBe(true)
  })

  it('returns false when task was requested recently', () => {
    const recent = new Date()
    recent.setDate(recent.getDate() - 3)
    const s = recent.toISOString().slice(0, 10)
    expect(isDragged({ status: 'En proceso', request_date: s })).toBe(false)
  })
})

// ─── isBlocked ───────────────────────────────────────────────────────────────
describe('isBlocked', () => {
  it('returns true only for Bloqueado status', () => {
    expect(isBlocked({ status: 'Bloqueado' })).toBe(true)
    expect(isBlocked({ status: 'En proceso' })).toBe(false)
    expect(isBlocked({ status: 'Pendiente' })).toBe(false)
  })
})

// ─── lightOf ─────────────────────────────────────────────────────────────────
describe('lightOf', () => {
  it('returns none when total is 0', () => {
    expect(lightOf(0, 0).cls).toBe('none')
    expect(lightOf(100, 0).cls).toBe('none')
  })

  it('returns green when pct >= 90', () => {
    expect(lightOf(90, 10).cls).toBe('green')
    expect(lightOf(100, 10).cls).toBe('green')
  })

  it('returns yellow when 70 <= pct < 90', () => {
    expect(lightOf(70, 10).cls).toBe('yellow')
    expect(lightOf(89, 10).cls).toBe('yellow')
  })

  it('returns red when pct < 70', () => {
    expect(lightOf(0, 10).cls).toBe('red')
    expect(lightOf(69, 10).cls).toBe('red')
  })
})

// ─── teamWeekStats ───────────────────────────────────────────────────────────
describe('teamWeekStats', () => {
  const TEAM_ID = 'team-1'
  const WK = 26  // week of 2026-06-22

  const tasks = [
    { id: '1', team_id: TEAM_ID, status: 'Terminado',  request_date: '2026-06-22', due_date: '2099-12-31', support_id: null },
    { id: '2', team_id: TEAM_ID, status: 'Bloqueado',  request_date: '2026-06-23', due_date: '2099-12-31', support_id: 'u1' },
    { id: '3', team_id: TEAM_ID, status: 'En proceso', request_date: '2026-06-24', due_date: '2020-01-01', support_id: null },
    { id: '4', team_id: 'other', status: 'Terminado',  request_date: '2026-06-22', due_date: null,         support_id: null },
  ]

  it('only counts tasks for the given team', () => {
    expect(teamWeekStats(TEAM_ID, tasks, WK).total).toBe(3)
  })

  it('cerradas counts Terminado tasks this week', () => {
    expect(teamWeekStats(TEAM_ID, tasks, WK).cerradas).toBe(1)
  })

  it('pct is correct', () => {
    expect(teamWeekStats(TEAM_ID, tasks, WK).pct).toBe(33)
  })

  it('bloqueados counts Bloqueado across all team tasks', () => {
    expect(teamWeekStats(TEAM_ID, tasks, WK).bloqueados).toBe(1)
  })

  it('retrasados counts tasks with past due_date', () => {
    expect(teamWeekStats(TEAM_ID, tasks, WK).retrasados).toBe(1)
  })

  it('apoyo counts tasks with support_id that are not closed', () => {
    expect(teamWeekStats(TEAM_ID, tasks, WK).apoyo).toBe(1)
  })

  it('returns 0 totals for unknown team', () => {
    const s = teamWeekStats('non-existent', tasks, WK)
    expect(s.total).toBe(0)
    expect(s.cerradas).toBe(0)
    expect(s.pct).toBe(0)
  })
})
