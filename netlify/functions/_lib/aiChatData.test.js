import { describe, it, expect, vi, beforeEach } from 'vitest'

function makeQuery(data, error = null) {
  const q = {
    select: vi.fn(() => q),
    eq: vi.fn(() => q),
    in: vi.fn(() => q),
    is: vi.fn(() => q),
  }
  q.then = (resolve) => Promise.resolve({ data, error }).then(resolve)
  return q
}

const fromMock = vi.fn()
vi.mock('./supabase.js', () => ({ supabase: { from: (...args) => fromMock(...args) } }))

const { loadMetricsDataset } = await import('./aiChatData.js')

describe('loadMetricsDataset', () => {
  beforeEach(() => {
    fromMock.mockReset()
  })

  it('carga lines, reports, tasks, users, meetings y pautas filtrados por company_id', async () => {
    const tables = {
      metric_lines: [{ id: 'l1', name: 'Alfa', color: '#111' }],
      metric_reports: [{ line_id: 'l1', year: 2026, month: 6, data: {} }],
      tasks: [{ id: 't1', team_id: 'l1', description: 'x' }],
      users: [{ user_id: 'u1', first_name: 'Ana', last_name: 'Pérez' }],
      meetings: [{ id: 'm1', line_id: 'l1', status: 'realizada' }],
      av_pautas: [{ id: 'p1', line_id: 'l1', status: 'realizada' }],
    }
    fromMock.mockImplementation((table) => makeQuery(tables[table] ?? []))

    const res = await loadMetricsDataset('c1')

    expect(res.lines).toEqual(tables.metric_lines)
    expect(res.reports).toEqual(tables.metric_reports)
    expect(res.tasks).toEqual(tables.tasks)
    expect(res.users).toEqual(tables.users)
    expect(res.meetings).toEqual(tables.meetings)
    expect(res.pautas).toEqual(tables.av_pautas)
    const currentYear = new Date().getFullYear()
    expect(res.availableYears).toEqual({ min: currentYear - 1, max: currentYear })
    expect(fromMock).toHaveBeenCalledWith('metric_lines')
    expect(fromMock).toHaveBeenCalledWith('metric_reports')
    expect(fromMock).toHaveBeenCalledWith('tasks')
    expect(fromMock).toHaveBeenCalledWith('users')
    expect(fromMock).toHaveBeenCalledWith('meetings')
    expect(fromMock).toHaveBeenCalledWith('av_pautas')
  })

  it('devuelve arrays vacíos si una tabla no tiene datos', async () => {
    fromMock.mockImplementation(() => makeQuery(null))
    const res = await loadMetricsDataset('c1')
    const currentYear = new Date().getFullYear()
    expect(res).toEqual({
      lines: [],
      reports: [],
      tasks: [],
      users: [],
      meetings: [],
      pautas: [],
      availableYears: { min: currentYear - 1, max: currentYear },
    })
  })

  it('lanza si alguna consulta devuelve error', async () => {
    fromMock.mockImplementation((table) =>
      table === 'tasks' ? makeQuery(null, { message: 'boom' }) : makeQuery([]),
    )
    await expect(loadMetricsDataset('c1')).rejects.toThrow('boom')
  })
})
