import { describe, it, expect } from 'vitest'
import { getProjectTasks, getProjectProgress, getGlobalProgress } from '../utils/projectProgress'

const makeProject = (tasks) => ({
  phases: [{ id: 'ph-1', name: 'Fase', tasks }],
})

describe('getProjectTasks', () => {
  it('returns flat task list across all phases', () => {
    const p = {
      phases: [
        { id: 'a', tasks: [{ id: '1', status: 'completada' }] },
        { id: 'b', tasks: [{ id: '2', status: 'pendiente' }] },
      ],
    }
    expect(getProjectTasks(p)).toHaveLength(2)
  })

  it('returns empty array when phases is undefined', () => {
    expect(getProjectTasks({})).toEqual([])
  })
})

describe('getProjectProgress', () => {
  it('returns 0% and zero counts when there are no tasks', () => {
    const result = getProjectProgress({ phases: [] })
    expect(result).toEqual({ completed: 0, total: 0, percent: 0 })
  })

  it('calculates correct percent with mixed statuses', () => {
    const p = makeProject([
      { id: '1', status: 'completada' },
      { id: '2', status: 'completada' },
      { id: '3', status: 'en_proceso' },
      { id: '4', status: 'pendiente' },
    ])
    const result = getProjectProgress(p)
    expect(result.completed).toBe(2)
    expect(result.total).toBe(4)
    expect(result.percent).toBe(50)
  })

  it('only counts completada as done', () => {
    const p = makeProject([
      { id: '1', status: 'en_proceso' },
      { id: '2', status: 'pausada' },
      { id: '3', status: 'pendiente' },
    ])
    expect(getProjectProgress(p).completed).toBe(0)
    expect(getProjectProgress(p).percent).toBe(0)
  })

  it('returns 100% when all tasks are completada', () => {
    const p = makeProject([
      { id: '1', status: 'completada' },
      { id: '2', status: 'completada' },
    ])
    expect(getProjectProgress(p).percent).toBe(100)
  })
})

describe('getGlobalProgress', () => {
  it('returns zeros when projects array is empty', () => {
    expect(getGlobalProgress([])).toEqual({ percent: 0, doneTasks: 0, totalTasks: 0 })
  })

  it('uses unweighted mean of per-project percentages', () => {
    // 100% project + 0% project → 50%, not 50% weighted
    const p1 = makeProject([{ id: '1', status: 'completada' }])
    const p2 = makeProject([
      { id: '2', status: 'pendiente' },
      { id: '3', status: 'pendiente' },
      { id: '4', status: 'pendiente' },
    ])
    const result = getGlobalProgress([p1, p2])
    expect(result.percent).toBe(50)
  })

  it('counts doneTasks and totalTasks across all projects', () => {
    const p1 = makeProject([
      { id: '1', status: 'completada' },
      { id: '2', status: 'pendiente' },
    ])
    const p2 = makeProject([
      { id: '3', status: 'completada' },
      { id: '4', status: 'completada' },
    ])
    const result = getGlobalProgress([p1, p2])
    expect(result.doneTasks).toBe(3)
    expect(result.totalTasks).toBe(4)
  })
})
