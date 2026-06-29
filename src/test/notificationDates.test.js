/**
 * Tests for date-matching logic used in enqueue_date_notifications() SQL function.
 * We mirror the SQL logic in pure JS helpers so we can unit-test edge cases
 * (year-end rollover, missing data, line_id null → level-4 only, etc.)
 * without a live database.
 */
import { describe, it, expect } from 'vitest'

// ── JS mirrors of the SQL date-matching logic ────────────────────────────────

/**
 * Returns true if the stored date's month+day matches the target date.
 * Ignores the year (annual recurrence).
 * @param {string|null} storedDate - ISO date string (YYYY-MM-DD)
 * @param {Date} targetDate
 * @returns {boolean}
 */
function matchesYearlyDate(storedDate, targetDate) {
  if (!storedDate) return false
  const d = new Date(storedDate + 'T00:00:00Z')
  if (isNaN(d.getTime())) return false
  return (
    d.getUTCMonth() + 1 === targetDate.getUTCMonth() + 1 &&
    d.getUTCDate() === targetDate.getUTCDate()
  )
}

/**
 * Returns true if a contact's birthday (stored as birth_day + birth_month integers)
 * matches the target date's month+day.
 * @param {{ birth_day: number|null, birth_month: number|null }} contact
 * @param {Date} targetDate
 * @returns {boolean}
 */
function contactBirthdayMatches(contact, targetDate) {
  if (!contact || contact.birth_day == null || contact.birth_month == null) return false
  return (
    contact.birth_month === targetDate.getUTCMonth() + 1 &&
    contact.birth_day === targetDate.getUTCDate()
  )
}

/**
 * Simulates the recipient computation for a client date notification.
 * - If line_id is provided: include line members + level-4 employees
 * - If line_id is null: include only level-4 employees
 *
 * @param {{ user_id: string, access_level: number }[]} allUsers
 * @param {string[]|null} lineMembers  - user_ids from metric_lines.member_user_ids
 * @param {string|null} lineId
 * @returns {string[]} distinct user_ids
 */
function computeClientRecipients(allUsers, lineMembers, lineId) {
  const level4Ids = allUsers.filter(u => u.access_level >= 4).map(u => u.user_id)
  if (!lineId) return [...new Set(level4Ids)]
  const combined = [...(lineMembers ?? []), ...level4Ids]
  return [...new Set(combined)]
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('matchesYearlyDate', () => {
  const july3 = new Date('2026-07-03T00:00:00Z')

  it('matches when month and day are equal (year irrelevant)', () => {
    expect(matchesYearlyDate('1990-07-03', july3)).toBe(true)
    expect(matchesYearlyDate('2025-07-03', july3)).toBe(true)
  })

  it('does not match different month', () => {
    expect(matchesYearlyDate('2026-06-03', july3)).toBe(false)
  })

  it('does not match different day', () => {
    expect(matchesYearlyDate('2026-07-04', july3)).toBe(false)
  })

  it('returns false for null', () => {
    expect(matchesYearlyDate(null, july3)).toBe(false)
  })

  it('returns false for undefined', () => {
    expect(matchesYearlyDate(undefined, july3)).toBe(false)
  })

  it('returns false for invalid date string', () => {
    expect(matchesYearlyDate('not-a-date', july3)).toBe(false)
  })

  it('handles year-end boundary: Dec 31 matches Dec 31 target', () => {
    const dec31 = new Date('2026-12-31T00:00:00Z')
    expect(matchesYearlyDate('2000-12-31', dec31)).toBe(true)
    expect(matchesYearlyDate('2000-12-30', dec31)).toBe(false)
  })

  it('handles Jan 1 (new year) correctly', () => {
    const jan1 = new Date('2026-01-01T00:00:00Z')
    expect(matchesYearlyDate('2000-01-01', jan1)).toBe(true)
    expect(matchesYearlyDate('2000-01-02', jan1)).toBe(false)
  })
})

describe('contactBirthdayMatches', () => {
  const july3 = new Date('2026-07-03T00:00:00Z')

  it('matches when birth_month and birth_day align with target', () => {
    expect(contactBirthdayMatches({ birth_day: 3, birth_month: 7 }, july3)).toBe(true)
  })

  it('does not match different day', () => {
    expect(contactBirthdayMatches({ birth_day: 4, birth_month: 7 }, july3)).toBe(false)
  })

  it('does not match different month', () => {
    expect(contactBirthdayMatches({ birth_day: 3, birth_month: 6 }, july3)).toBe(false)
  })

  it('returns false when birth_day is null', () => {
    expect(contactBirthdayMatches({ birth_day: null, birth_month: 7 }, july3)).toBe(false)
  })

  it('returns false when birth_month is null', () => {
    expect(contactBirthdayMatches({ birth_day: 3, birth_month: null }, july3)).toBe(false)
  })

  it('returns false for null contact', () => {
    expect(contactBirthdayMatches(null, july3)).toBe(false)
  })

  it('returns false for empty contact object', () => {
    expect(contactBirthdayMatches({}, july3)).toBe(false)
  })

  it('handles year-end: Dec 31', () => {
    const dec31 = new Date('2026-12-31T00:00:00Z')
    expect(contactBirthdayMatches({ birth_day: 31, birth_month: 12 }, dec31)).toBe(true)
    expect(contactBirthdayMatches({ birth_day: 1, birth_month: 1 }, dec31)).toBe(false)
  })
})

describe('computeClientRecipients', () => {
  const users = [
    { user_id: 'u1', access_level: 1 },
    { user_id: 'u2', access_level: 2 },
    { user_id: 'u3', access_level: 3 },
    { user_id: 'u4', access_level: 4 },
    { user_id: 'u5', access_level: 4 },
  ]
  const lineMembers = ['u1', 'u2', 'u6'] // u6 is a line member not in users (orphan)

  it('when line_id is provided: returns union of line members + level-4 users (deduplicated)', () => {
    const recipients = computeClientRecipients(users, lineMembers, 'line-abc')
    expect(recipients).toContain('u1')   // line member
    expect(recipients).toContain('u2')   // line member
    expect(recipients).toContain('u6')   // line member (orphan, still included)
    expect(recipients).toContain('u4')   // level-4
    expect(recipients).toContain('u5')   // level-4
    expect(recipients).not.toContain('u3') // level-3, not in line
    // All distinct
    expect(new Set(recipients).size).toBe(recipients.length)
  })

  it('when line_id is null: returns only level-4 users', () => {
    const recipients = computeClientRecipients(users, null, null)
    expect(recipients).toContain('u4')
    expect(recipients).toContain('u5')
    expect(recipients).not.toContain('u1')
    expect(recipients).not.toContain('u2')
    expect(recipients).not.toContain('u3')
  })

  it('when line_id is null and lineMembers is non-null: still only level-4', () => {
    // lineMembers is ignored when lineId is null (client has no assigned line)
    const recipients = computeClientRecipients(users, lineMembers, null)
    expect(recipients).toContain('u4')
    expect(recipients).toContain('u5')
    expect(recipients).not.toContain('u1')
  })

  it('returns empty array when no level-4 users and no line members', () => {
    const noLevel4Users = [{ user_id: 'a', access_level: 1 }]
    expect(computeClientRecipients(noLevel4Users, [], 'line-1')).toEqual([])
  })

  it('deduplicates when a level-4 user is also a line member', () => {
    const lineWithLevel4 = ['u4', 'u1']
    const recipients = computeClientRecipients(users, lineWithLevel4, 'line-x')
    const u4Count = recipients.filter(id => id === 'u4').length
    expect(u4Count).toBe(1)
  })
})

describe('3-day-before matching integration', () => {
  it('today+3 target correctly identifies upcoming dates', () => {
    const today = new Date('2026-07-01T00:00:00Z')
    const today3 = new Date('2026-07-04T00:00:00Z')

    // A client with anniversary on July 4th should fire on today+3 (July 1 → target July 4)
    expect(matchesYearlyDate('2010-07-04', today3)).toBe(true)
    // But NOT on today
    expect(matchesYearlyDate('2010-07-04', today)).toBe(false)
  })

  it('year-end rollover: Dec 29 → today+3 target is Jan 1', () => {
    const dec29 = new Date('2026-12-29T00:00:00Z')
    const jan1  = new Date('2027-01-01T00:00:00Z')
    expect(matchesYearlyDate('2000-01-01', jan1)).toBe(true)
    expect(matchesYearlyDate('2000-01-01', dec29)).toBe(false)
  })
})
