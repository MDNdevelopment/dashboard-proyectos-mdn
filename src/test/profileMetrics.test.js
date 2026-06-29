import { describe, it, expect } from 'vitest'
import { aggregateProfileMetrics } from '../utils/aggregateProfileMetrics'
import { aggregateGroupAverages } from '../utils/aggregateGroupAverages'
import { representScore, formatScore, scoreColor } from '../utils/scoreScale'

// Helpers
function makeSession({ score = 3, period = '2025-01-01', responses = [], comments = [], manager = null } = {}) {
  return {
    id: Math.random().toString(36).slice(2),
    total_score: score,
    period,
    evaluation_responses: responses,
    evaluation_comments: comments,
    manager,
  }
}

function makeResponse(questionId, response, text = `Pregunta ${questionId}`) {
  return { id: `r-${questionId}`, question_id: questionId, response, question: { text } }
}

function makeGroupSession(score, userId, companyId, departmentId) {
  return {
    total_score: score,
    employee: { user_id: userId, company_id: companyId, department_id: departmentId },
  }
}

// ─── aggregateProfileMetrics ──────────────────────────────────────────────────

describe('aggregateProfileMetrics', () => {
  it('returns empty metrics for empty/null/undefined input', () => {
    for (const input of [[], null, undefined]) {
      const m = aggregateProfileMetrics(input)
      expect(m.evaluationCount).toBe(0)
      expect(m.avgAllTime).toBeNull()
      expect(m.chartData).toEqual([])
      expect(m.perQuestion).toEqual([])
      expect(m.comments).toEqual([])
    }
  })

  it('single session: evaluationCount = 1, avgAllTime = total_score', () => {
    const m = aggregateProfileMetrics([makeSession({ score: 4, period: '2025-01-01' })])
    expect(m.evaluationCount).toBe(1)
    expect(m.avgAllTime).toBeCloseTo(4, 5)
    expect(m.avgCurrentPeriod).toBeCloseTo(4, 5)
  })

  it('multiple sessions: avgAllTime is the mean of total_score', () => {
    const sessions = [
      makeSession({ score: 4, period: '2025-03-01' }),
      makeSession({ score: 2, period: '2025-02-01' }),
      makeSession({ score: 3, period: '2025-01-01' }),
    ]
    const m = aggregateProfileMetrics(sessions)
    expect(m.evaluationCount).toBe(3)
    expect(m.avgAllTime).toBeCloseTo((4 + 2 + 3) / 3, 5)
  })

  it('avgCurrentPeriod is the score of the most recent period', () => {
    const sessions = [
      makeSession({ score: 4.5, period: '2025-03-01' }),
      makeSession({ score: 2,   period: '2025-01-01' }),
    ]
    const m = aggregateProfileMetrics(sessions)
    expect(m.avgCurrentPeriod).toBeCloseTo(4.5, 5)
  })

  it('trend direction up when latest > previous period', () => {
    const sessions = [
      makeSession({ score: 4, period: '2025-02-01' }),
      makeSession({ score: 2, period: '2025-01-01' }),
    ]
    const m = aggregateProfileMetrics(sessions)
    expect(m.trend.direction).toBe('up')
    expect(m.trend.delta).toBeCloseTo(2, 5)
  })

  it('trend direction down when latest < previous period', () => {
    const sessions = [
      makeSession({ score: 2, period: '2025-02-01' }),
      makeSession({ score: 4, period: '2025-01-01' }),
    ]
    const m = aggregateProfileMetrics(sessions)
    expect(m.trend.direction).toBe('down')
    expect(m.trend.delta).toBeCloseTo(-2, 5)
  })

  it('trend is null when only one session', () => {
    const m = aggregateProfileMetrics([makeSession()])
    expect(m.trend.direction).toBeNull()
    expect(m.trend.delta).toBeNull()
  })

  it('chartData is sorted ascending by period', () => {
    const sessions = [
      makeSession({ score: 3, period: '2025-03-01' }),
      makeSession({ score: 1, period: '2025-01-01' }),
      makeSession({ score: 2, period: '2025-02-01' }),
    ]
    const m = aggregateProfileMetrics(sessions)
    expect(m.chartData.length).toBe(3)
    const scores = m.chartData.map(d => d.score)
    expect(scores).toEqual([1, 2, 3])
  })

  it('perQuestion computes avg per question across sessions', () => {
    const sessions = [
      makeSession({ responses: [makeResponse('q1', 4), makeResponse('q2', 2)] }),
      makeSession({ responses: [makeResponse('q1', 2), makeResponse('q2', 4)] }),
    ]
    const m = aggregateProfileMetrics(sessions)
    const q1 = m.perQuestion.find(q => q.questionId === 'q1')
    const q2 = m.perQuestion.find(q => q.questionId === 'q2')
    expect(q1.avg).toBeCloseTo(3, 5)
    expect(q1.count).toBe(2)
    expect(q2.avg).toBeCloseTo(3, 5)
  })

  it('strengths are top 3 perQuestion by avg, weaknesses are bottom 3', () => {
    const sessions = [
      makeSession({
        responses: [
          makeResponse('q1', 5, 'Alta'),
          makeResponse('q2', 4, 'Media-alta'),
          makeResponse('q3', 3, 'Media'),
          makeResponse('q4', 2, 'Media-baja'),
          makeResponse('q5', 1, 'Baja'),
        ],
      }),
    ]
    const m = aggregateProfileMetrics(sessions)
    expect(m.strengths[0].questionId).toBe('q1')
    expect(m.weaknesses[0].questionId).toBe('q5')
    expect(m.strengths.length).toBeLessThanOrEqual(3)
    expect(m.weaknesses.length).toBeLessThanOrEqual(3)
  })

  it('distribution counts sessions per score band', () => {
    const sessions = [
      makeSession({ score: 0.5 }),
      makeSession({ score: 1.5 }),
      makeSession({ score: 2.5 }),
      makeSession({ score: 3.5 }),
      makeSession({ score: 4.5 }),
    ]
    const m = aggregateProfileMetrics(sessions)
    expect(m.distribution['0-1']).toBe(1)
    expect(m.distribution['1-2']).toBe(1)
    expect(m.distribution['2-3']).toBe(1)
    expect(m.distribution['3-4']).toBe(1)
    expect(m.distribution['4-5']).toBe(1)
  })

  it('comments are extracted with period and manager name', () => {
    const sessions = [
      makeSession({
        period: '2025-01-01',
        comments: [{ id: 'c1', comment: 'Buen trabajo' }],
        manager: { first_name: 'Juan', last_name: 'Pérez', avatar_url: null },
      }),
    ]
    const m = aggregateProfileMetrics(sessions)
    expect(m.comments.length).toBe(1)
    expect(m.comments[0].comment).toBe('Buen trabajo')
    expect(m.comments[0].manager).toBe('Juan Pérez')
  })

  it('null total_score is treated as 0 in averaging', () => {
    const sessions = [
      makeSession({ score: null, period: '2025-01-01' }),
      makeSession({ score: 4,    period: '2025-02-01' }),
    ]
    const m = aggregateProfileMetrics(sessions)
    expect(m.avgAllTime).toBeCloseTo((0 + 4) / 2, 5)
  })

  it('summaryText is a non-empty string when there are sessions', () => {
    const m = aggregateProfileMetrics([makeSession({ score: 4 })])
    expect(typeof m.summaryText).toBe('string')
    expect(m.summaryText.length).toBeGreaterThan(0)
  })
})

// ─── aggregateGroupAverages ───────────────────────────────────────────────────

describe('aggregateGroupAverages', () => {
  it('returns null averages for empty/null input', () => {
    expect(aggregateGroupAverages([], 'me', 1)).toEqual({ companyAvg: null, deptAvg: null })
    expect(aggregateGroupAverages(null, 'me', 1)).toEqual({ companyAvg: null, deptAvg: null })
  })

  it('computes company and department averages correctly', () => {
    const sessions = [
      makeGroupSession(4, 'u1', 'co1', 1),
      makeGroupSession(2, 'u2', 'co1', 2),
      makeGroupSession(3, 'u3', 'co1', 1),
    ]
    const { companyAvg, deptAvg } = aggregateGroupAverages(sessions, 'me', 1)
    expect(companyAvg).toBeCloseTo((4 + 2 + 3) / 3, 5)
    expect(deptAvg).toBeCloseTo((4 + 3) / 2, 5)
  })

  it('excludes the current user from averages', () => {
    const sessions = [
      makeGroupSession(5, 'me', 'co1', 1),
      makeGroupSession(3, 'u2', 'co1', 1),
    ]
    const { companyAvg, deptAvg } = aggregateGroupAverages(sessions, 'me', 1)
    expect(companyAvg).toBeCloseTo(3, 5)
    expect(deptAvg).toBeCloseTo(3, 5)
  })

  it('returns null deptAvg when no other members in department', () => {
    const sessions = [makeGroupSession(4, 'u1', 'co1', 2)]
    const { deptAvg } = aggregateGroupAverages(sessions, 'me', 1)
    expect(deptAvg).toBeNull()
  })

  it('skips sessions with null employee embed', () => {
    const sessions = [
      { total_score: 5, employee: null },
      makeGroupSession(3, 'u1', 'co1', 1),
    ]
    const { companyAvg } = aggregateGroupAverages(sessions, 'me', 1)
    expect(companyAvg).toBeCloseTo(3, 5)
  })

  it('skips sessions with null total_score', () => {
    const sessions = [
      makeGroupSession(null, 'u1', 'co1', 1),
      makeGroupSession(4,    'u2', 'co1', 1),
    ]
    const { companyAvg } = aggregateGroupAverages(sessions, 'me', 1)
    expect(companyAvg).toBeCloseTo(4, 5)
  })
})

// ─── scoreScale ───────────────────────────────────────────────────────────────

describe('scoreScale', () => {
  it('representScore returns correct labels', () => {
    expect(representScore(1)).toBe('Deficiente')
    expect(representScore(2)).toBe('Irregular')
    expect(representScore(3)).toBe('Aceptable')
    expect(representScore(4)).toBe('Bueno')
    expect(representScore(5)).toBe('Excelente')
    expect(representScore(null)).toBe('—')
  })

  it('formatScore returns correct frequency labels', () => {
    expect(formatScore(1)).toBe('Nunca')
    expect(formatScore(2)).toBe('Muy poco')
    expect(formatScore(3)).toBe('A veces')
    expect(formatScore(4)).toBe('Muchas veces')
    expect(formatScore(5)).toBe('Siempre')
    expect(formatScore(null)).toBe('—')
  })

  it('scoreColor returns correct bg/text classes', () => {
    expect(scoreColor(4).bg).toContain('green')
    expect(scoreColor(3).bg).toContain('amber')
    expect(scoreColor(2).bg).toContain('red')
    expect(scoreColor(null).text).toContain('aaa')
  })
})
