import { describe, it, expect } from 'vitest'
import { aggregateEvaluationSummary } from '../utils/aggregateEvaluationSummary'

// Helpers para construir datos de prueba
const user = (id, pos = 'Developer') => ({
  user_id: id,
  first_name: `First${id}`,
  last_name: `Last${id}`,
  email: `user${id}@example.com`,
  position: pos ? { position_name: pos } : null,
})

const session = (employeeId, managerId, score, pos = 'Developer') => ({
  total_score: score,
  employee: user(employeeId, pos),
  manager: managerId ? user(managerId, pos) : null,
})

// ─── aggregateEvaluationSummary ──────────────────────────────────────────────

describe('aggregateEvaluationSummary', () => {
  it('returns [] for empty/null/undefined input', () => {
    expect(aggregateEvaluationSummary([])).toEqual([])
    expect(aggregateEvaluationSummary(null)).toEqual([])
    expect(aggregateEvaluationSummary(undefined)).toEqual([])
  })

  // ── received_count / avg_score ─────────────────────────────────────────────

  it('single session → avg_score equals total_score, received_count = 1', () => {
    const result = aggregateEvaluationSummary([session('u1', 'u2', 4.2)])
    const row = result.find(r => r.user_id === 'u1')
    expect(row.avg_score).toBeCloseTo(4.2)
    expect(row.received_count).toBe(1)
  })

  it('multiple sessions for the same employee → avg_score is the mean, received_count = N', () => {
    const result = aggregateEvaluationSummary([
      session('u1', 'u2', 3),
      session('u1', 'u3', 5),
    ])
    const row = result.find(r => r.user_id === 'u1')
    expect(row.avg_score).toBeCloseTo(4)
    expect(row.received_count).toBe(2)
  })

  // ── made_count ─────────────────────────────────────────────────────────────

  it('manager of a session gets made_count = 1', () => {
    const result = aggregateEvaluationSummary([session('u1', 'u2', 4)])
    const mgr = result.find(r => r.user_id === 'u2')
    expect(mgr).toBeDefined()
    expect(mgr.made_count).toBe(1)
  })

  it('manager who did multiple evaluations accumulates made_count', () => {
    const result = aggregateEvaluationSummary([
      session('u1', 'u3', 4),
      session('u2', 'u3', 3),
    ])
    const mgr = result.find(r => r.user_id === 'u3')
    expect(mgr.made_count).toBe(2)
  })

  // ── solo-evaluador (manager que no fue evaluado) ───────────────────────────

  it('person who only appears as manager → avg_score null, received_count 0, made_count > 0', () => {
    const result = aggregateEvaluationSummary([
      session('u1', 'u2', 4.5),  // u2 solo evalúa
    ])
    const mgr = result.find(r => r.user_id === 'u2')
    expect(mgr.avg_score).toBeNull()
    expect(mgr.received_count).toBe(0)
    expect(mgr.made_count).toBe(1)
  })

  it('solo-evaluador aparece al final del ordenamiento (después de los evaluados)', () => {
    const result = aggregateEvaluationSummary([
      session('u1', 'u3', 4),   // u3 solo evalúa
      session('u2', 'u3', 3),
    ])
    // u1 (4) y u2 (3) tienen score; u3 no tiene → al final
    expect(result[result.length - 1].user_id).toBe('u3')
  })

  // ── persona que es empleado Y manager ─────────────────────────────────────

  it('person who both received and gave evaluations has correct both counts', () => {
    const result = aggregateEvaluationSummary([
      session('u1', 'u2', 4),  // u1 recibe, u2 hace
      session('u2', 'u1', 3),  // u2 recibe, u1 hace
    ])
    const u1 = result.find(r => r.user_id === 'u1')
    expect(u1.received_count).toBe(1)
    expect(u1.made_count).toBe(1)
    expect(u1.avg_score).toBeCloseTo(4)

    const u2 = result.find(r => r.user_id === 'u2')
    expect(u2.received_count).toBe(1)
    expect(u2.made_count).toBe(1)
    expect(u2.avg_score).toBeCloseTo(3)
  })

  // ── ordenamiento ──────────────────────────────────────────────────────────

  it('multiple employees sorted by avg_score descending', () => {
    const result = aggregateEvaluationSummary([
      session('u1', null, 2),
      session('u2', null, 5),
      session('u3', null, 3.5),
    ])
    expect(result.map(r => r.user_id)).toEqual(['u2', 'u3', 'u1'])
  })

  // ── forma de salida ────────────────────────────────────────────────────────

  it('output shape has all required fields and no internal ones', () => {
    const result = aggregateEvaluationSummary([session('u1', 'u2', 4, 'Designer')])
    const row = result.find(r => r.user_id === 'u1')
    expect(row).toHaveProperty('user_id', 'u1')
    expect(row).toHaveProperty('first_name', 'Firstu1')
    expect(row).toHaveProperty('last_name', 'Lastu1')
    expect(row).toHaveProperty('email', 'useru1@example.com')
    expect(row).toHaveProperty('position_name', 'Designer')
    expect(row).toHaveProperty('received_count')
    expect(row).toHaveProperty('made_count')
    expect(row).toHaveProperty('avg_score')
    expect(row).not.toHaveProperty('scores')  // campo interno eliminado
  })

  it('position_name is null when position embed is missing', () => {
    const result = aggregateEvaluationSummary([session('u1', null, 3, null)])
    expect(result[0].position_name).toBeNull()
  })

  it('ignores sessions where employee embed is null', () => {
    const result = aggregateEvaluationSummary([
      { total_score: 4, employee: null, manager: null },
      session('u1', null, 3),
    ])
    expect(result).toHaveLength(1)
    expect(result[0].user_id).toBe('u1')
  })

  it('treats null total_score as 0 when averaging', () => {
    const result = aggregateEvaluationSummary([
      session('u1', null, null),
      session('u1', null, 4),
    ])
    expect(result[0].avg_score).toBeCloseTo(2)
  })
})
