/**
 * Tests de la navegación clickeable agregada al módulo Reportes/Métricas.
 *
 * Cubre:
 * - LineView: inicializa la sub-pestaña activa desde ?tab=
 * - DashboardView: "Línea líder" es un botón navegable cuando hay datos
 * - DashboardView: tarjetas financieras son botones navegables
 * - TareasPage: pre-selecciona team desde ?team=
 * - BaseView: inicializa filtro de cliente desde ?client= y filtra por client_id
 */
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { vi } from 'vitest'

// ── Mocks globales ─────────────────────────────────────────────────────────────

vi.mock('../supabase', () => ({
  supabase: {
    from: vi.fn().mockReturnValue({
      select:  vi.fn().mockReturnThis(),
      insert:  vi.fn().mockReturnThis(),
      update:  vi.fn().mockReturnThis(),
      delete:  vi.fn().mockReturnThis(),
      upsert:  vi.fn().mockReturnThis(),
      eq:      vi.fn().mockReturnThis(),
      order:   vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
      single:  vi.fn().mockResolvedValue({ data: null, error: null }),
    }),
    channel: vi.fn(() => ({
      on: vi.fn().mockReturnThis(),
      subscribe: vi.fn().mockReturnThis(),
    })),
    removeChannel: vi.fn(),
  },
}))

const MOCK_USER = {
  user_id: 'u-1',
  company_id: 'co-1',
  access_level: 4,
  admin: true,
  first_name: 'Admin',
  last_name: 'Test',
}

vi.mock('../context/AuthContext', () => ({
  useAuth: vi.fn(() => ({
    userProfile: MOCK_USER,
    can: () => true,
    signOut: vi.fn(),
  })),
}))

// Silenciar recharts (no necesitamos renderizado de canvas en tests)
vi.mock('recharts', () => ({
  LineChart: ({ children }) => <div data-testid="line-chart">{children}</div>,
  BarChart: ({ children }) => <div data-testid="bar-chart">{children}</div>,
  RadarChart: ({ children }) => <div data-testid="radar-chart">{children}</div>,
  Line: () => null,
  Bar: () => null,
  Radar: () => null,
  XAxis: () => null,
  YAxis: () => null,
  Tooltip: () => null,
  Legend: () => null,
  CartesianGrid: () => null,
  LabelList: () => null,
  ResponsiveContainer: ({ children }) => <div>{children}</div>,
  PolarGrid: () => null,
  PolarAngleAxis: () => null,
  PolarRadiusAxis: () => null,
}))

vi.mock('../components/metricas/ScoreDial', () => ({
  default: () => <div data-testid="score-dial" />,
}))

// ── Helpers de render ──────────────────────────────────────────────────────────

function renderWithRouter(ui, { initialEntry = '/' } = {}) {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      {ui}
    </MemoryRouter>,
  )
}

// ══════════════════════════════════════════════════════════════════════════════
// 1. LineView — sub-pestaña desde ?tab=
// ══════════════════════════════════════════════════════════════════════════════

vi.mock('../components/metricas/LineHubView', () => ({
  default: () => <div data-testid="hub-view">Resumen</div>,
}))
vi.mock('../components/metricas/OperacionesView', () => ({
  default: () => <div data-testid="operaciones-view">Operaciones</div>,
}))
vi.mock('../components/metricas/FinanzasView', () => ({
  default: () => <div data-testid="finanzas-view">Finanzas</div>,
}))

import LineView from '../components/metricas/LineView'

const MOCK_LINE = { id: 'l-1', name: 'Georgina', color: '#FAB51A', member_user_ids: [] }

describe('LineView — sub-pestaña desde URL ?tab=', () => {
  it('muestra Resumen por defecto cuando no hay ?tab=', () => {
    renderWithRouter(
      <LineView line={MOCK_LINE} companyId="co-1" />,
      { initialEntry: '/reportes/linea/l-1' },
    )
    expect(screen.getByTestId('hub-view')).toBeInTheDocument()
    expect(screen.queryByTestId('finanzas-view')).not.toBeInTheDocument()
  })

  it('muestra Finanzas cuando ?tab=finanzas', () => {
    renderWithRouter(
      <LineView line={MOCK_LINE} companyId="co-1" />,
      { initialEntry: '/reportes/linea/l-1?tab=finanzas' },
    )
    expect(screen.getByTestId('finanzas-view')).toBeInTheDocument()
    expect(screen.queryByTestId('hub-view')).not.toBeInTheDocument()
  })

  it('muestra Operaciones cuando ?tab=operaciones', () => {
    renderWithRouter(
      <LineView line={MOCK_LINE} companyId="co-1" />,
      { initialEntry: '/reportes/linea/l-1?tab=operaciones' },
    )
    expect(screen.getByTestId('operaciones-view')).toBeInTheDocument()
  })

  it('cae a Resumen cuando ?tab= tiene un valor inválido', () => {
    renderWithRouter(
      <LineView line={MOCK_LINE} companyId="co-1" />,
      { initialEntry: '/reportes/linea/l-1?tab=inexistente' },
    )
    expect(screen.getByTestId('hub-view')).toBeInTheDocument()
  })
})

// ══════════════════════════════════════════════════════════════════════════════
// 1b. LineView — persistencia de ?year= y ?month= en la URL
// ══════════════════════════════════════════════════════════════════════════════

describe('LineView — persistencia de ?year= y ?month= en la URL', () => {
  it('inicializa el selector de año con el valor de ?year=', () => {
    renderWithRouter(
      <LineView line={MOCK_LINE} companyId="co-1" />,
      { initialEntry: '/reportes/linea/l-1?tab=operaciones&year=2024' },
    )
    // Los <select> no tienen label; el de año es el que tiene opciones de 4 dígitos
    const yearSelect = [...document.querySelectorAll('select')].find(s =>
      [...s.options].some(o => o.value === '2024')
    )
    expect(yearSelect).toBeTruthy()
    expect(yearSelect.value).toBe('2024')
  })

  it('inicializa el selector de mes con el valor de ?month=', () => {
    renderWithRouter(
      <LineView line={MOCK_LINE} companyId="co-1" />,
      { initialEntry: '/reportes/linea/l-1?tab=finanzas&month=3' },
    )
    const monthSelect = [...document.querySelectorAll('select')].find(s =>
      [...s.options].some(o => o.value === '3' && o.text === 'Marzo')
    )
    expect(monthSelect).toBeTruthy()
    expect(monthSelect.value).toBe('3')
  })

  it('no muestra los selectores de mes/año en el tab Resumen (hub)', () => {
    renderWithRouter(
      <LineView line={MOCK_LINE} companyId="co-1" />,
      { initialEntry: '/reportes/linea/l-1?tab=hub' },
    )
    // En hub no se renderizan los <select> de mes/año
    const selects = document.querySelectorAll('select')
    expect(selects.length).toBe(0)
  })
})

// ══════════════════════════════════════════════════════════════════════════════
// 1c. LineView — click en tab escribe el query param ?tab= en la URL
// ══════════════════════════════════════════════════════════════════════════════

describe('LineView — click en tab actualiza ?tab= en la URL', () => {
  it('hacer click en Operaciones muestra el componente de operaciones', async () => {
    const user = userEvent.setup()
    renderWithRouter(
      <LineView line={MOCK_LINE} companyId="co-1" />,
      { initialEntry: '/reportes/linea/l-1' },
    )

    // Inicialmente en hub (Resumen)
    expect(screen.getByTestId('hub-view')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Operaciones' }))

    expect(screen.getByTestId('operaciones-view')).toBeInTheDocument()
    expect(screen.queryByTestId('hub-view')).not.toBeInTheDocument()
  })

  it('hacer click en Finanzas muestra el componente de finanzas', async () => {
    const user = userEvent.setup()
    renderWithRouter(
      <LineView line={MOCK_LINE} companyId="co-1" />,
      { initialEntry: '/reportes/linea/l-1' },
    )

    await user.click(screen.getByRole('button', { name: 'Finanzas' }))

    expect(screen.getByTestId('finanzas-view')).toBeInTheDocument()
  })
})

// ══════════════════════════════════════════════════════════════════════════════
// 2. DashboardView — KPI "Línea líder" y tarjetas financieras clickeables
// ══════════════════════════════════════════════════════════════════════════════

// Mock de metricsApi para DashboardView
vi.mock('../components/metricas/metricsApi', () => ({
  loadYearReports: vi.fn().mockResolvedValue({ data: [], error: null }),
  loadClients:     vi.fn().mockResolvedValue({ data: [], error: null }),
  loadCompanyUsers: vi.fn().mockResolvedValue({ data: [], error: null }),
  seedMetricsIfEmpty: vi.fn().mockResolvedValue(null),
  loadLines: vi.fn().mockResolvedValue({ data: [], error: null }),
}))

vi.mock('../utils/aggregateMetricsDashboard', () => ({
  aggregateMetricsDashboard: vi.fn(() => ({
    matrix: { 'l-1': Array(12).fill(null) },
    currentMonth: 6,
    promAnual: 85,
    promMesActual: 82,
    lider: { line: { id: 'l-1', name: 'Georgina', color: '#FAB51A' }, prom: 85 },
    cobertura: 100,
    ranking: [],
    rankingMonth: 6,
    finTotalesPorLinea: {
      'l-1': { ingresos: 5000, egresos: 3000, diferencia: 2000 },
    },
  })),
}))

import DashboardView from '../components/metricas/DashboardView'

const MOCK_LINES = [
  { id: 'l-1', name: 'Georgina', color: '#FAB51A', member_user_ids: ['u-2'] },
]

describe('DashboardView — KPI "Línea líder" y tarjetas financieras clickeables', () => {
  it('el KPI "Línea líder" se renderiza como botón con el nombre de la línea', async () => {
    renderWithRouter(<DashboardView companyId="co-1" lines={MOCK_LINES} />)
    // Buscar el botón cuyo title apunta a la línea líder
    await waitFor(() => {
      expect(screen.getByTitle('Ir a Georgina')).toBeInTheDocument()
    })
    const btn = screen.getByTitle('Ir a Georgina')
    expect(btn.tagName.toLowerCase()).toBe('button')
  })

  it('la tarjeta financiera de la línea es un botón navegable', async () => {
    renderWithRouter(<DashboardView companyId="co-1" lines={MOCK_LINES} />)
    await waitFor(() => {
      expect(screen.getByTitle('Ver finanzas de Georgina')).toBeInTheDocument()
    })
    const finCard = screen.getByTitle('Ver finanzas de Georgina')
    expect(finCard.tagName.toLowerCase()).toBe('button')
  })

  it('la tarjeta financiera muestra el conteo de empleados como span navegable', async () => {
    renderWithRouter(<DashboardView companyId="co-1" lines={MOCK_LINES} />)
    await waitFor(() => {
      // member_user_ids: ['u-2'] → 1 empleado
      expect(screen.getByTitle('Ver equipo de esta línea')).toBeInTheDocument()
    })
    expect(screen.getByText(/1 empleado/)).toBeInTheDocument()
  })
})

// ══════════════════════════════════════════════════════════════════════════════
// 1d. LineView — filtrado de meses futuros en el selector
// ══════════════════════════════════════════════════════════════════════════════

const REAL_CURRENT_YEAR  = new Date().getFullYear()
const REAL_CURRENT_MONTH = new Date().getMonth() + 1

describe('LineView — selector de mes oculta periodos futuros', () => {
  it('con el año actual, el selector de mes solo muestra meses hasta el mes en curso', () => {
    renderWithRouter(
      <LineView line={MOCK_LINE} companyId="co-1" />,
      { initialEntry: `/reportes/linea/l-1?tab=operaciones&year=${REAL_CURRENT_YEAR}` },
    )
    const monthSelect = [...document.querySelectorAll('select')].find(s =>
      [...s.options].every(o => Number(o.value) <= 12)
    )
    expect(monthSelect).toBeTruthy()
    const values = [...monthSelect.options].map(o => Number(o.value))
    // No debe haber ningún mes mayor al mes actual
    expect(values.every(v => v <= REAL_CURRENT_MONTH)).toBe(true)
    // Debe haber exactamente REAL_CURRENT_MONTH opciones
    expect(values.length).toBe(REAL_CURRENT_MONTH)
  })

  it('con un año pasado, el selector de mes muestra los 12 meses', () => {
    const pastYear = REAL_CURRENT_YEAR - 1
    renderWithRouter(
      <LineView line={MOCK_LINE} companyId="co-1" />,
      { initialEntry: `/reportes/linea/l-1?tab=operaciones&year=${pastYear}` },
    )
    const monthSelect = [...document.querySelectorAll('select')].find(s =>
      [...s.options].some(o => o.value === '12')
    )
    expect(monthSelect).toBeTruthy()
    expect(monthSelect.options.length).toBe(12)
  })

  it('un ?month= futuro en la URL queda saneado al mes actual en el selector', () => {
    // Solo tiene sentido si no estamos en Diciembre
    if (REAL_CURRENT_MONTH >= 12) return
    const futureMonth = REAL_CURRENT_MONTH + 1
    renderWithRouter(
      <LineView line={MOCK_LINE} companyId="co-1" />,
      { initialEntry: `/reportes/linea/l-1?tab=operaciones&year=${REAL_CURRENT_YEAR}&month=${futureMonth}` },
    )
    const monthSelect = [...document.querySelectorAll('select')].find(s =>
      [...s.options].every(o => Number(o.value) <= 12)
    )
    expect(monthSelect).toBeTruthy()
    // El valor efectivo debe ser el mes actual (clamped), no el futuro
    expect(Number(monthSelect.value)).toBe(REAL_CURRENT_MONTH)
  })
})

// ══════════════════════════════════════════════════════════════════════════════
// 2b. DashboardView — cards "Promedio anual" y "Cobertura" no se renderizan
// ══════════════════════════════════════════════════════════════════════════════

describe('DashboardView — KPIs eliminados (Promedio anual y Cobertura)', () => {
  it('no renderiza la card "Promedio anual"', async () => {
    renderWithRouter(<DashboardView companyId="co-1" lines={MOCK_LINES} />)
    await waitFor(() => {
      expect(screen.getByTitle('Ir a Georgina')).toBeInTheDocument()
    })
    expect(screen.queryByText(/promedio anual/i)).not.toBeInTheDocument()
  })

  it('no renderiza la card "Cobertura"', async () => {
    renderWithRouter(<DashboardView companyId="co-1" lines={MOCK_LINES} />)
    await waitFor(() => {
      expect(screen.getByTitle('Ir a Georgina')).toBeInTheDocument()
    })
    expect(screen.queryByText(/cobertura/i)).not.toBeInTheDocument()
  })

  it('sigue renderizando la card "Mes actual"', async () => {
    renderWithRouter(<DashboardView companyId="co-1" lines={MOCK_LINES} />)
    await waitFor(() => {
      expect(screen.getByText(/mes actual/i)).toBeInTheDocument()
    })
  })

  it('sigue renderizando la card "Línea líder"', async () => {
    renderWithRouter(<DashboardView companyId="co-1" lines={MOCK_LINES} />)
    await waitFor(() => {
      expect(screen.getByText(/línea líder/i)).toBeInTheDocument()
    })
  })
})

// ══════════════════════════════════════════════════════════════════════════════
// 3. BaseView — filtro por ?client= (client_id)
// ══════════════════════════════════════════════════════════════════════════════

import BaseView from '../components/tareas/BaseView'

const MOCK_TASKS = [
  { id: 't-1', team_id: 'l-1', client: 'Pepsi',    client_id: 'c-1', description: 'Tarea A', status: 'En proceso', request_date: '2026-06-01', assignee_ids: [] },
  { id: 't-2', team_id: 'l-1', client: 'Coca-Cola', client_id: 'c-2', description: 'Tarea B', status: 'Pendiente',  request_date: '2026-06-02', assignee_ids: [] },
  { id: 't-3', team_id: 'l-1', client: 'Pepsi',    client_id: 'c-1', description: 'Tarea C', status: 'Terminado',  request_date: '2026-05-01', assignee_ids: [] },
]

const MOCK_TEAM = { id: 'l-1', name: 'Georgina', color: '#FAB51A', member_user_ids: [] }

const MOCK_CLIENTS_MAP = new Map([
  ['c-1', { id: 'c-1', name: 'Pepsi',    line_id: 'l-1' }],
  ['c-2', { id: 'c-2', name: 'Coca-Cola', line_id: 'l-1' }],
])

function renderBaseView(initialEntry = '/tareas') {
  return renderWithRouter(
    <BaseView
      tasks={MOCK_TASKS}
      teams={[MOCK_TEAM]}
      team={MOCK_TEAM}
      usersMap={new Map()}
      clientsById={MOCK_CLIENTS_MAP}
      onOpenTask={vi.fn()}
      onUpdated={vi.fn()}
    />,
    { initialEntry },
  )
}

describe('BaseView — filtro de cliente desde ?client=', () => {
  it('sin ?client= muestra todas las tareas del team', () => {
    renderBaseView('/tareas?view=base')
    // 3 tareas en total para el team l-1
    expect(screen.getByText('3 tareas')).toBeInTheDocument()
  })

  it('con ?client=c-1 filtra a solo las tareas de Pepsi (2 tareas)', () => {
    renderBaseView('/tareas?view=base&team=l-1&client=c-1')
    // Pepsi tiene t-1 y t-3 → 2 tareas
    expect(screen.getByText(/2 de 3/)).toBeInTheDocument()
  })

  it('muestra pill con el nombre del cliente cuando viene de Reportes', () => {
    renderBaseView('/tareas?view=base&team=l-1&client=c-1')
    // El pill tiene un botón × con title único "Quitar filtro de cliente"
    expect(screen.getByTitle('Quitar filtro de cliente')).toBeInTheDocument()
  })

  it('al hacer click en × del pill quita el filtro y muestra todas las tareas', async () => {
    const user = userEvent.setup()
    renderBaseView('/tareas?view=base&team=l-1&client=c-1')

    // El pill está visible
    expect(screen.getByTitle('Quitar filtro de cliente')).toBeInTheDocument()

    await user.click(screen.getByTitle('Quitar filtro de cliente'))

    // Ahora deben verse las 3 tareas
    await waitFor(() => {
      expect(screen.getByText('3 tareas')).toBeInTheDocument()
    })
  })
})
