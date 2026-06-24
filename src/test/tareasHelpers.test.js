import { describe, it, expect } from 'vitest'
import {
  parseD,
  today,
  daysBetween,
  monthIndex,
  currentMonthIndex,
  fmtMonth,
  taskStartMonth,
  taskEndMonth,
  taskInMonth,
  fmtShort,
  isClosed,
  isLate,
  isDragged,
  isBlocked,
  taskLight,
  lightOf,
  teamMonthStats,
} from '../components/tareas/constants'

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

// ─── monthIndex ──────────────────────────────────────────────────────────────
describe('monthIndex', () => {
  it('January 2026 → 2026*12 + 0', () => {
    expect(monthIndex(new Date(2026, 0, 1))).toBe(2026 * 12 + 0)
  })

  it('June 2026 → 2026*12 + 5', () => {
    expect(monthIndex(new Date(2026, 5, 15))).toBe(2026 * 12 + 5)
  })

  it('December 2025 < January 2026 (cross-year comparison works)', () => {
    const dec2025 = monthIndex(new Date(2025, 11, 1))
    const jan2026 = monthIndex(new Date(2026, 0, 1))
    expect(dec2025).toBeLessThan(jan2026)
    expect(jan2026 - dec2025).toBe(1)
  })

  it('currentMonthIndex matches today', () => {
    const now = new Date()
    expect(currentMonthIndex()).toBe(monthIndex(now))
  })
})

// ─── fmtMonth ────────────────────────────────────────────────────────────────
describe('fmtMonth', () => {
  it('returns a non-empty capitalized string', () => {
    const label = fmtMonth(2026 * 12 + 5) // June 2026
    expect(typeof label).toBe('string')
    expect(label.length).toBeGreaterThan(3)
    expect(label[0]).toBe(label[0].toUpperCase())
  })

  it('different months produce different labels', () => {
    const jun = fmtMonth(2026 * 12 + 5)
    const jul = fmtMonth(2026 * 12 + 6)
    expect(jun).not.toBe(jul)
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

// ─── isBlocked ───────────────────────────────────────────────────────────────
describe('isBlocked', () => {
  it('returns true only for Bloqueado status', () => {
    expect(isBlocked({ status: 'Bloqueado' })).toBe(true)
    expect(isBlocked({ status: 'En proceso' })).toBe(false)
    expect(isBlocked({ status: 'Pendiente' })).toBe(false)
  })
})

// ─── isDragged ───────────────────────────────────────────────────────────────
describe('isDragged', () => {
  it('returns false for a closed task', () => {
    expect(isDragged({ status: 'Terminado', request_date: '2020-01-01' })).toBe(false)
  })

  it('returns true when task started in a previous month and is still open', () => {
    // Use a far-past date so it is always in a prior month
    expect(isDragged({ status: 'En proceso', request_date: '2020-01-01' })).toBe(true)
  })

  it('returns false when task started this month', () => {
    const now = new Date()
    const thisMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`
    expect(isDragged({ status: 'En proceso', request_date: thisMonth })).toBe(false)
  })

  it('returns false when request_date is missing', () => {
    expect(isDragged({ status: 'En proceso', request_date: null })).toBe(false)
  })
})

// ─── taskStartMonth / taskEndMonth ───────────────────────────────────────────
describe('taskStartMonth', () => {
  it('returns the month index of request_date', () => {
    expect(taskStartMonth({ request_date: '2026-06-15' })).toBe(2026 * 12 + 5)
  })

  it('returns null when request_date is missing', () => {
    expect(taskStartMonth({ request_date: null })).toBeNull()
    expect(taskStartMonth({ request_date: '' })).toBeNull()
  })
})

describe('taskEndMonth', () => {
  it('returns null for an open task (ongoing)', () => {
    expect(taskEndMonth({ status: 'En proceso', closed_date: null })).toBeNull()
  })

  it('returns the month index of closed_date for a closed task', () => {
    expect(taskEndMonth({ status: 'Terminado', closed_date: '2026-08-10', request_date: '2026-06-01' })).toBe(2026 * 12 + 7)
  })

  it('falls back to start month when closed but closed_date is missing', () => {
    expect(taskEndMonth({ status: 'Terminado', closed_date: null, request_date: '2026-06-01' })).toBe(2026 * 12 + 5)
  })
})

// ─── taskInMonth ─────────────────────────────────────────────────────────────
describe('taskInMonth', () => {
  const JUN = 2026 * 12 + 5  // June 2026
  const JUL = JUN + 1
  const AUG = JUN + 2
  const MAY = JUN - 1

  it('task that started and closed in June appears in June', () => {
    const task = { status: 'Terminado', request_date: '2026-06-01', closed_date: '2026-06-30' }
    expect(taskInMonth(task, JUN)).toBe(true)
  })

  it('task closed in June does NOT appear before it started (May)', () => {
    const task = { status: 'Terminado', request_date: '2026-06-15', closed_date: '2026-06-20' }
    expect(taskInMonth(task, MAY)).toBe(false)
  })

  it('task that started in May and not yet closed appears in May and June (current month)', () => {
    // Uses May (past) → June (current) so currentMonthIndex() boundary is satisfied
    const task = { status: 'En proceso', request_date: '2026-05-01', closed_date: null }
    expect(taskInMonth(task, MAY)).toBe(true)
    expect(taskInMonth(task, JUN)).toBe(true)
  })

  it('open task does NOT appear in a future month beyond current', () => {
    const futureMonth = currentMonthIndex() + 2
    const task = { status: 'En proceso', request_date: '2026-06-01', closed_date: null }
    expect(taskInMonth(task, futureMonth)).toBe(false)
  })

  it('task started in May, closed in August → appears in May, June, July, Aug (all intermediate months)', () => {
    const task = { status: 'Terminado', request_date: '2026-05-01', closed_date: '2026-08-15' }
    expect(taskInMonth(task, MAY)).toBe(true)
    expect(taskInMonth(task, JUN)).toBe(true)
    expect(taskInMonth(task, JUL)).toBe(true)
    expect(taskInMonth(task, AUG)).toBe(true)
  })

  it('task started in July does NOT appear in June', () => {
    const task = { status: 'En proceso', request_date: '2026-07-01', closed_date: null }
    expect(taskInMonth(task, JUN)).toBe(false)
  })

  it('task closed in June does NOT appear in July', () => {
    const task = { status: 'Terminado', request_date: '2026-05-01', closed_date: '2026-06-30' }
    expect(taskInMonth(task, JUL)).toBe(false)
  })

  it('returns false when request_date is missing', () => {
    const task = { status: 'En proceso', request_date: null, closed_date: null }
    expect(taskInMonth(task, JUN)).toBe(false)
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

// ─── taskLight ───────────────────────────────────────────────────────────────
describe('taskLight', () => {
  const future = '2099-12-31'
  const past   = '2020-01-01'

  it('returns red for Bloqueado status', () => {
    expect(taskLight({ status: 'Bloqueado', due_date: future })).toBe('red')
  })

  it('returns red for open task with past due_date (Retrasado), overriding yellow status', () => {
    // Pendiente vencida → rojo gana sobre amarillo
    expect(taskLight({ status: 'Pendiente', due_date: past })).toBe('red')
    // Por revisar vencida → también roja
    expect(taskLight({ status: 'Por revisar', due_date: past })).toBe('red')
    // En proceso vencida → también roja
    expect(taskLight({ status: 'En proceso', due_date: past })).toBe('red')
  })

  it('returns yellow for Pendiente without overdue date', () => {
    expect(taskLight({ status: 'Pendiente', due_date: future })).toBe('yellow')
    expect(taskLight({ status: 'Pendiente', due_date: null })).toBe('yellow')
  })

  it('returns yellow for Por revisar without overdue date', () => {
    expect(taskLight({ status: 'Por revisar', due_date: future })).toBe('yellow')
    expect(taskLight({ status: 'Por revisar', due_date: null })).toBe('yellow')
  })

  it('returns green for En proceso without overdue date', () => {
    expect(taskLight({ status: 'En proceso', due_date: future })).toBe('green')
    expect(taskLight({ status: 'En proceso', due_date: null })).toBe('green')
  })

  it('returns green for Terminado even if due_date is in the past (isClosed → isLate is false)', () => {
    expect(taskLight({ status: 'Terminado', due_date: past })).toBe('green')
    expect(taskLight({ status: 'Terminado', due_date: null })).toBe('green')
  })
})

// ─── teamMonthStats ──────────────────────────────────────────────────────────
describe('teamMonthStats', () => {
  const TEAM_ID = 'team-1'
  const JUN = 2026 * 12 + 5  // June 2026

  // task-1: started and closed in June
  // task-2: started in June, Bloqueado, not closed, with support — also appears in Jun
  // task-3: started in June, En proceso, late due_date — appears in Jun
  // task-4: different team — must not count
  // task-5: started in July — must NOT appear in June
  const tasks = [
    { id: '1', team_id: TEAM_ID, status: 'Terminado',  request_date: '2026-06-01', closed_date: '2026-06-15', due_date: '2099-12-31', support_id: null },
    { id: '2', team_id: TEAM_ID, status: 'Bloqueado',  request_date: '2026-06-10', closed_date: null,          due_date: '2099-12-31', support_id: 'u1' },
    { id: '3', team_id: TEAM_ID, status: 'En proceso', request_date: '2026-06-20', closed_date: null,          due_date: '2020-01-01', support_id: null },
    { id: '4', team_id: 'other', status: 'Terminado',  request_date: '2026-06-01', closed_date: '2026-06-30',  due_date: null,         support_id: null },
    { id: '5', team_id: TEAM_ID, status: 'Pendiente',  request_date: '2026-07-01', closed_date: null,          due_date: '2099-12-31', support_id: null },
  ]

  it('only counts tasks for the given team', () => {
    // team-1 has tasks 1,2,3 in June (task-5 starts in July → not in June)
    expect(teamMonthStats(TEAM_ID, tasks, JUN).total).toBe(3)
  })

  it('cerradas counts Terminado tasks active in the month', () => {
    expect(teamMonthStats(TEAM_ID, tasks, JUN).cerradas).toBe(1)
  })

  it('pct is correct', () => {
    expect(teamMonthStats(TEAM_ID, tasks, JUN).pct).toBe(33)
  })

  it('bloqueados counts Bloqueado across all team tasks (not month-scoped)', () => {
    expect(teamMonthStats(TEAM_ID, tasks, JUN).bloqueados).toBe(1)
  })

  it('retrasados counts tasks with past due_date (not month-scoped)', () => {
    expect(teamMonthStats(TEAM_ID, tasks, JUN).retrasados).toBe(1)
  })

  it('apoyo counts tasks with support_id that are not closed (not month-scoped)', () => {
    expect(teamMonthStats(TEAM_ID, tasks, JUN).apoyo).toBe(1)
  })

  it('returns 0 totals for unknown team', () => {
    const s = teamMonthStats('non-existent', tasks, JUN)
    expect(s.total).toBe(0)
    expect(s.cerradas).toBe(0)
    expect(s.pct).toBe(0)
  })

  it('task starting in July does NOT appear in June stats', () => {
    // In June: tasks 1,2,3 qualify; task-5 (July start) does not
    const s = teamMonthStats(TEAM_ID, tasks, JUN)
    expect(s.total).toBe(3)  // same as the first test — task-5 excluded from June
  })
})
