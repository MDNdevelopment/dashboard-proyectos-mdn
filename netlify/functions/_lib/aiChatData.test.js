import { describe, it, expect, vi, beforeEach } from 'vitest'

function makeQuery(data, error = null) {
  const q = {
    select: vi.fn(() => q),
    eq: vi.fn(() => q),
    in: vi.fn(() => q),
    is: vi.fn(() => q),
    order: vi.fn(() => q),
  }
  q.then = (resolve) => Promise.resolve({ data, error }).then(resolve)
  return q
}

const fromMock = vi.fn()
vi.mock('./supabase.js', () => ({ supabase: { from: (...args) => fromMock(...args) } }))

const { loadMetricsDataset } = await import('./aiChatData.js')

const TABLES = {
  metric_lines: [
    { id: 'l1', name: 'Alfa', color: '#111', is_general: false, is_management: false },
  ],
  metric_reports: [{ line_id: 'l1', year: 2026, month: 6, data: {} }],
  tasks: [{ id: 't1', team_id: 'l1', description: 'x' }],
  users: [{ user_id: 'u1', first_name: 'Ana', last_name: 'Pérez' }],
  meetings: [{ id: 'm1', line_id: 'l1', status: 'realizada' }],
  av_pautas: [{ id: 'p1', line_id: 'l1', status: 'realizada' }],
  positions: [{ position_id: 1, position_name: 'Social Media Manager', department_id: 1 }],
  departments: [{ department_id: 1, department_name: 'Redes' }],
  metric_clients: [{ id: 'c1', line_id: 'l1', name: 'Jugos Los Ángeles' }],
  metric_line_members: [{ line_id: 'l1', user_id: 'u1', is_lead: true }],
  paid_campaigns: [{ id: 'ad1', client_id: 'c1', amount: 200 }],
  support_tickets: [{ id: 1, title: 'Ticket x', status: 'abierto' }],
  leads: [{ id: 1, nombre: 'Lead x', status: 'pendiente' }],
  vacations: [{ id: 1, user_id: 'u1', status: 'aprobada' }],
  cnp_requests: [{ id: 'cnp1', line_id: 'l1', status: 'pendiente' }],
  publication_checks: [
    { id: 'pc1', client_id: 'c1', network: 'Instagram', last_published_at: '2026-06-01' },
  ],
  av_pauta_piezas: [{ id: 'pz1', pauta_id: 'p1', editor_user_id: 'u1', status: 'pendiente' }],
  task_comments: [{ id: 'tc1', task_id: 't1' }],
  // target_employee debe coincidir con un user_id ya cargado (u1) para que sobreviva el
  // filtro en memoria contra `users` (la vista no tiene company_id, ver aiChatData.js).
  employee_evaluation_summary: [
    { target_employee: 'u1', department_id: 1, period_start: '2026-06-01', average_total_rate: 4 },
  ],
}

const ALL_TABLE_NAMES = [
  'metric_lines',
  'metric_reports',
  'tasks',
  'users',
  'meetings',
  'av_pautas',
  'positions',
  'departments',
  'metric_clients',
  'metric_line_members',
  'paid_campaigns',
  'support_tickets',
  'leads',
  'vacations',
  'cnp_requests',
  'publication_checks',
  'av_pauta_piezas',
  'task_comments',
  'employee_evaluation_summary',
]

describe('loadMetricsDataset', () => {
  beforeEach(() => {
    fromMock.mockReset()
  })

  it('carga todas las tablas (métricas, tareas, personal, clientes y módulos ampliados) filtradas por company_id', async () => {
    fromMock.mockImplementation((table) => makeQuery(TABLES[table] ?? []))

    const res = await loadMetricsDataset('c1')

    expect(res.lines).toEqual([{ ...TABLES.metric_lines[0], member_user_ids: ['u1'] }])
    expect(res.linesAll).toEqual([{ ...TABLES.metric_lines[0], member_user_ids: ['u1'] }])
    expect(res.lineMembers).toEqual(TABLES.metric_line_members)
    expect(res.reports).toEqual(TABLES.metric_reports)
    expect(res.tasks).toEqual(TABLES.tasks)
    expect(res.users).toEqual(TABLES.users)
    expect(res.meetings).toEqual(TABLES.meetings)
    expect(res.pautas).toEqual(TABLES.av_pautas)
    expect(res.positions).toEqual(TABLES.positions)
    expect(res.departments).toEqual(TABLES.departments)
    expect(res.clients).toEqual(TABLES.metric_clients)
    expect(res.campaigns).toEqual(TABLES.paid_campaigns)
    expect(res.tickets).toEqual(TABLES.support_tickets)
    expect(res.leads).toEqual(TABLES.leads)
    expect(res.vacations).toEqual(TABLES.vacations)
    expect(res.cnpRequests).toEqual(TABLES.cnp_requests)
    expect(res.publicationChecks).toEqual(TABLES.publication_checks)
    expect(res.pautaPiezas).toEqual(TABLES.av_pauta_piezas)
    expect(res.taskComments).toEqual(TABLES.task_comments)
    expect(res.evaluationSummary).toEqual(TABLES.employee_evaluation_summary)
    const currentYear = new Date().getFullYear()
    expect(res.availableYears).toEqual({ min: currentYear - 1, max: currentYear })

    for (const table of ALL_TABLE_NAMES) {
      expect(fromMock).toHaveBeenCalledWith(table)
    }
  })

  it('descarta filas de employee_evaluation_summary de empleados fuera de la empresa (la vista no tiene company_id)', async () => {
    fromMock.mockImplementation((table) => {
      if (table === 'employee_evaluation_summary') {
        return makeQuery([
          ...TABLES.employee_evaluation_summary,
          { target_employee: 'otra-empresa', department_id: 1, average_total_rate: 5 },
        ])
      }
      return makeQuery(TABLES[table] ?? [])
    })

    const res = await loadMetricsDataset('c1')
    expect(res.evaluationSummary).toEqual(TABLES.employee_evaluation_summary)
  })

  it('no consulta datos sensibles (sueldo ni contacto privado del cliente)', async () => {
    fromMock.mockImplementation((table) => makeQuery(TABLES[table] ?? []))
    await loadMetricsDataset('c1')

    expect(fromMock).not.toHaveBeenCalledWith('metric_client_private')
    const usersQuery =
      fromMock.mock.results[fromMock.mock.calls.findIndex((c) => c[0] === 'users')].value
    const selectedFields = usersQuery.select.mock.calls[0][0]
    expect(selectedFields).not.toMatch(/monthly_salary/)
  })

  it('devuelve arrays vacíos si una tabla no tiene datos (sin líneas ni clientes: no consulta miembros/campañas)', async () => {
    fromMock.mockImplementation(() => makeQuery(null))
    const res = await loadMetricsDataset('c1')
    const currentYear = new Date().getFullYear()
    expect(res).toEqual({
      lines: [],
      linesAll: [],
      lineMembers: [],
      reports: [],
      tasks: [],
      users: [],
      meetings: [],
      pautas: [],
      positions: [],
      departments: [],
      clients: [],
      campaigns: [],
      tickets: [],
      leads: [],
      vacations: [],
      cnpRequests: [],
      publicationChecks: [],
      pautaPiezas: [],
      taskComments: [],
      evaluationSummary: [],
      availableYears: { min: currentYear - 1, max: currentYear },
    })
    expect(fromMock).not.toHaveBeenCalledWith('metric_line_members')
    expect(fromMock).not.toHaveBeenCalledWith('paid_campaigns')
  })

  it('lanza si alguna consulta devuelve error', async () => {
    fromMock.mockImplementation((table) =>
      table === 'tasks' ? makeQuery(null, { message: 'boom' }) : makeQuery(TABLES[table] ?? []),
    )
    await expect(loadMetricsDataset('c1')).rejects.toThrow('boom')
  })

  it('lanza si metric_line_members devuelve error', async () => {
    fromMock.mockImplementation((table) =>
      table === 'metric_line_members'
        ? makeQuery(null, { message: 'boom-members' })
        : makeQuery(TABLES[table] ?? []),
    )
    await expect(loadMetricsDataset('c1')).rejects.toThrow('boom-members')
  })

  it('lanza si paid_campaigns devuelve error', async () => {
    fromMock.mockImplementation((table) =>
      table === 'paid_campaigns'
        ? makeQuery(null, { message: 'boom-ads' })
        : makeQuery(TABLES[table] ?? []),
    )
    await expect(loadMetricsDataset('c1')).rejects.toThrow('boom-ads')
  })
})
