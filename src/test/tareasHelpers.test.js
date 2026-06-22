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
    // 2026-06-22 is a Monday — week 26
    expect(isoWeek(new Date(2026, 5, 22))).toBe(26)
  })

  it('returns the same week for all days Mon–Sun', () => {
    // June 22 (Mon) to June 28 (Sun) are all week 26
    const weeks = [22, 23, 24, 25, 26, 27, 28].map(d => isoWeek(new Date(2026, 5, d)))
    expect(new Set(weeks).size).toBe(1)
    expect(weeks[0]).toBe(26)
  })

  it('week 1 for Jan 5, 2026 (first week with majority days in 2026)', () => {
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

  it('returns null for empty string', () => {
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
  it('returns the ISO week of fecha_solicitud', () => {
    const tarea = { fecha_solicitud: '2026-06-22' }
    expect(taskWeek(tarea)).toBe(26)
  })

  it('returns null when fecha_solicitud is missing', () => {
    expect(taskWeek({ fecha_solicitud: null })).toBeNull()
    expect(taskWeek({ fecha_solicitud: '' })).toBeNull()
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
    expect(isClosed({ estatus: 'Terminado' })).toBe(true)
  })

  it('returns false for other statuses', () => {
    for (const s of ['En proceso', 'Por revisar', 'Bloqueado', 'Pendiente']) {
      expect(isClosed({ estatus: s })).toBe(false)
    }
  })
})

// ─── isLate ──────────────────────────────────────────────────────────────────
describe('isLate', () => {
  it('returns false for a closed task regardless of date', () => {
    expect(isLate({ estatus: 'Terminado', fecha_entrega: '2000-01-01' })).toBe(false)
  })

  it('returns true when delivery date is in the past', () => {
    expect(isLate({ estatus: 'En proceso', fecha_entrega: '2020-01-01' })).toBe(true)
  })

  it('returns false when delivery date is in the future', () => {
    expect(isLate({ estatus: 'En proceso', fecha_entrega: '2099-12-31' })).toBe(false)
  })

  it('returns false when no delivery date', () => {
    expect(isLate({ estatus: 'En proceso', fecha_entrega: null })).toBe(false)
  })
})

// ─── isDragged ───────────────────────────────────────────────────────────────
describe('isDragged', () => {
  it('returns false for a closed task', () => {
    expect(isDragged({ estatus: 'Terminado', fecha_solicitud: '2020-01-01' })).toBe(false)
  })

  it('returns true when task was requested more than 7 days ago', () => {
    expect(isDragged({ estatus: 'En proceso', fecha_solicitud: '2020-01-01' })).toBe(true)
  })

  it('returns false when task was requested recently', () => {
    const future = new Date()
    future.setDate(future.getDate() - 3)
    const s = future.toISOString().slice(0, 10)
    expect(isDragged({ estatus: 'En proceso', fecha_solicitud: s })).toBe(false)
  })
})

// ─── isBlocked ───────────────────────────────────────────────────────────────
describe('isBlocked', () => {
  it('returns true only for Bloqueado status', () => {
    expect(isBlocked({ estatus: 'Bloqueado' })).toBe(true)
    expect(isBlocked({ estatus: 'En proceso' })).toBe(false)
    expect(isBlocked({ estatus: 'Pendiente' })).toBe(false)
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

  const tareas = [
    { id: '1', team_id: TEAM_ID, estatus: 'Terminado',   fecha_solicitud: '2026-06-22', fecha_entrega: '2099-12-31', apoyo_id: null },
    { id: '2', team_id: TEAM_ID, estatus: 'Bloqueado',   fecha_solicitud: '2026-06-23', fecha_entrega: '2099-12-31', apoyo_id: 'u1' },
    { id: '3', team_id: TEAM_ID, estatus: 'En proceso',  fecha_solicitud: '2026-06-24', fecha_entrega: '2020-01-01', apoyo_id: null },
    { id: '4', team_id: 'other', estatus: 'Terminado',   fecha_solicitud: '2026-06-22', fecha_entrega: null,         apoyo_id: null },
  ]

  it('only counts tasks for the given team', () => {
    const s = teamWeekStats(TEAM_ID, tareas, WK)
    expect(s.total).toBe(3)   // 3 tasks this week (all 3 are in week 26)
  })

  it('cerradas counts Terminado tasks', () => {
    const s = teamWeekStats(TEAM_ID, tareas, WK)
    expect(s.cerradas).toBe(1)
  })

  it('pct is correct', () => {
    const s = teamWeekStats(TEAM_ID, tareas, WK)
    expect(s.pct).toBe(33)   // 1/3 = 33%
  })

  it('bloqueados counts Bloqueado status (all team tasks, not just week)', () => {
    const s = teamWeekStats(TEAM_ID, tareas, WK)
    expect(s.bloqueados).toBe(1)
  })

  it('retrasados counts late tasks', () => {
    const s = teamWeekStats(TEAM_ID, tareas, WK)
    expect(s.retrasados).toBe(1)   // task 3 has past fecha_entrega
  })

  it('apoyo counts tasks with apoyo_id that are not closed', () => {
    const s = teamWeekStats(TEAM_ID, tareas, WK)
    expect(s.apoyo).toBe(1)   // task 2 has apoyo_id and is not Terminado
  })

  it('returns 0 totals for unknown team', () => {
    const s = teamWeekStats('non-existent', tareas, WK)
    expect(s.total).toBe(0)
    expect(s.cerradas).toBe(0)
    expect(s.pct).toBe(0)
  })
})
