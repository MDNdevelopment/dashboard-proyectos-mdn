/**
 * Tests de UsoView (Reportes → Monitor de uso):
 * - Renderiza una fila por línea, con jefa, conteos y total.
 * - Los ceros se resaltan.
 * - Cambiar de mes vuelve a pedir datos (no cachea).
 * - Click en una fila expande el detalle con la narrativa.
 */
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi } from 'vitest'

vi.mock('recharts', () => ({
  LineChart: ({ children }) => <div data-testid="line-chart">{children}</div>,
  Line: () => null,
  BarChart: ({ children, data }) => (
    <div data-testid="bar-chart" data-values={JSON.stringify(data)}>
      {children}
    </div>
  ),
  Bar: ({ children }) => <div data-testid="bar">{children}</div>,
  Cell: () => null,
  XAxis: () => null,
  YAxis: () => null,
  Tooltip: () => null,
  Legend: () => null,
  CartesianGrid: () => null,
  ResponsiveContainer: ({ children }) => <div>{children}</div>,
}))

const loadUsageActivity = vi.fn()
const loadCompanyUsers = vi.fn()
vi.mock('../components/metricas/metricsApi', () => ({
  loadUsageActivity: (...args) => loadUsageActivity(...args),
  loadCompanyUsers: (...args) => loadCompanyUsers(...args),
}))

import UsoView from '../components/metricas/UsoView'
import { USAGE_MODULES } from '../utils/aggregateUsageMonitor'

const LINES = [
  {
    id: 'l-1',
    name: 'Team Bianca',
    color: '#EC4899',
    lead_user_id: 'jefa-1',
    member_user_ids: ['jefa-1', 'miembro-1'],
  },
]

const USERS = [
  { user_id: 'jefa-1', first_name: 'Bianca', last_name: 'R.' },
  { user_id: 'miembro-1', first_name: 'María', last_name: 'Vanessa' },
]

function emptyRaw(overrides = {}) {
  return { meetings: [], tasks: [], fixedMarks: [], cnp: [], pautas: [], ...overrides }
}

beforeEach(() => {
  loadUsageActivity.mockReset()
  loadCompanyUsers.mockReset()
  loadCompanyUsers.mockResolvedValue({ data: USERS, error: null })
})

describe('UsoView', () => {
  it('renderiza una fila por línea con el nombre de la jefa y resalta los ceros', async () => {
    loadUsageActivity.mockResolvedValue({
      data: emptyRaw({
        tasks: [{ team_id: 'l-1', created_by: 'jefa-1', created_at: '2026-09-05', due_date: null }],
      }),
      error: null,
    })

    render(<UsoView companyId="co-1" lines={LINES} />)

    await waitFor(() => {
      expect(screen.getByText('Team Bianca')).toBeInTheDocument()
    })
    expect(screen.getByText('Bianca R.')).toBeInTheDocument()
    // Tareas = 1 (aparece también en Total, que también vale 1)
    expect(screen.getAllByText('1').length).toBeGreaterThanOrEqual(2)
    // Módulos en 0 quedan resaltados en rojo
    const zeroCells = screen.getAllByText('0')
    expect(zeroCells.length).toBeGreaterThan(0)
    expect(zeroCells[0].className).toMatch(/text-red-600/)
  })

  it('cambiar el mes vuelve a pedir datos a metricsApi', async () => {
    loadUsageActivity.mockResolvedValue({ data: emptyRaw(), error: null })
    render(<UsoView companyId="co-1" lines={LINES} />)

    await waitFor(() => expect(loadUsageActivity).toHaveBeenCalledTimes(1))

    const user = userEvent.setup()
    const selects = document.querySelectorAll('select')
    const monthSelect = selects[0]
    await user.selectOptions(monthSelect, '3')

    await waitFor(() => expect(loadUsageActivity).toHaveBeenCalledTimes(2))
    expect(loadUsageActivity).toHaveBeenLastCalledWith(
      'co-1',
      expect.objectContaining({ month: 3 }),
    )
  })

  it('click en una fila expande el detalle con la narrativa', async () => {
    loadUsageActivity.mockResolvedValue({
      data: emptyRaw({
        tasks: [{ team_id: 'l-1', created_by: 'jefa-1', created_at: '2026-09-05', due_date: null }],
      }),
      error: null,
    })
    render(<UsoView companyId="co-1" lines={LINES} />)

    await waitFor(() => expect(screen.getByText('Team Bianca')).toBeInTheDocument())

    const user = userEvent.setup()
    await user.click(screen.getByText('Team Bianca'))

    await waitFor(() => {
      expect(
        screen.getByText(/Ningún miembro del equipo registró actividad este mes\./),
      ).toBeInTheDocument()
    })
  })

  it('el detalle expandido incluye la tabla de desglose por miembro (jefa + equipo)', async () => {
    loadUsageActivity.mockResolvedValue({
      data: emptyRaw({
        tasks: [
          { team_id: 'l-1', created_by: 'jefa-1', created_at: '2026-09-05', due_date: null },
          { team_id: 'l-1', created_by: 'miembro-1', created_at: '2026-09-06', due_date: null },
        ],
      }),
      error: null,
    })
    render(<UsoView companyId="co-1" lines={LINES} />)

    await waitFor(() => expect(screen.getByText('Team Bianca')).toBeInTheDocument())

    const user = userEvent.setup()
    await user.click(screen.getByText('Team Bianca'))

    await waitFor(() => {
      expect(screen.getByText('Miembro')).toBeInTheDocument()
    })
    // La jefa aparece marcada con el badge "Jefa" (además de la columna "Jefa" de la
    // tabla resumen) y el resto del equipo debajo.
    expect(screen.getAllByText('Jefa').length).toBeGreaterThanOrEqual(2)
    expect(screen.getAllByText('Bianca R.').length).toBeGreaterThanOrEqual(2) // fila resumen + detalle
    expect(screen.getByText('María Vanessa')).toBeInTheDocument()
  })

  it('el detalle expandido resume la puntualidad por módulo, no un listado de cada registro', async () => {
    loadUsageActivity.mockResolvedValue({
      data: emptyRaw({
        tasks: [
          {
            team_id: 'l-1',
            created_by: 'jefa-1',
            created_at: '2026-09-11',
            due_date: '2026-09-10',
          },
          {
            team_id: 'l-1',
            created_by: 'jefa-1',
            created_at: '2026-09-05',
            due_date: '2026-09-10',
          },
        ],
      }),
      error: null,
    })
    render(<UsoView companyId="co-1" lines={LINES} />)

    await waitFor(() => expect(screen.getByText('Team Bianca')).toBeInTheDocument())

    const user = userEvent.setup()
    await user.click(screen.getByText('Team Bianca'))

    await waitFor(() => {
      expect(screen.getByText(/Detalle de puntualidad del equipo/)).toBeInTheDocument()
    })
    expect(screen.getByText(/De 2 tareas, 1 fue tardía/)).toBeInTheDocument()
  })

  it('muestra un mensaje de error si la carga falla', async () => {
    loadUsageActivity.mockResolvedValue({ data: null, error: { message: 'Falló la carga' } })
    render(<UsoView companyId="co-1" lines={LINES} />)

    await waitFor(() => {
      expect(screen.getByText('Falló la carga')).toBeInTheDocument()
    })
  })

  describe('tab Gráficas', () => {
    const LINES_2 = [
      ...LINES,
      {
        id: 'l-2',
        name: 'Team Vanessa',
        color: '#3B82F6',
        lead_user_id: 'jefa-2',
        member_user_ids: ['jefa-2'],
      },
    ]
    const USERS_2 = [...USERS, { user_id: 'jefa-2', first_name: 'Vane', last_name: 'S.' }]

    it('no renderiza la gráfica de acciones por módulo en la sección dashboard', async () => {
      loadUsageActivity.mockResolvedValue({ data: emptyRaw(), error: null })
      render(<UsoView companyId="co-1" lines={LINES} section="dashboard" />)

      await waitFor(() => expect(loadUsageActivity).toHaveBeenCalled())
      expect(screen.queryByText(/Acciones por módulo/)).not.toBeInTheDocument()
    })

    it('muestra el estado vacío cuando no hay actividad en el mes', async () => {
      loadUsageActivity.mockResolvedValue({ data: emptyRaw(), error: null })
      render(<UsoView companyId="co-1" lines={LINES} section="graficas" />)

      await waitFor(() => {
        expect(screen.getByText(/Acciones por módulo/)).toBeInTheDocument()
      })
      // "Uso general por team" y "Acciones por módulo" muestran el estado vacío por separado.
      expect(screen.getAllByText('Sin datos para esta ventana').length).toBeGreaterThanOrEqual(2)
    })

    it('la gráfica de uso general muestra el mismo Total que la tabla del Dashboard', async () => {
      loadCompanyUsers.mockResolvedValue({ data: USERS_2, error: null })
      loadUsageActivity.mockResolvedValue({
        data: emptyRaw({
          tasks: [
            { team_id: 'l-1', created_by: 'jefa-1', created_at: '2026-09-05', due_date: null },
            { team_id: 'l-2', created_by: 'jefa-2', created_at: '2026-09-06', due_date: null },
            { team_id: 'l-2', created_by: 'jefa-2', created_at: '2026-09-07', due_date: null },
          ],
        }),
        error: null,
      })
      render(<UsoView companyId="co-1" lines={LINES_2} section="graficas" />)

      await waitFor(() => {
        expect(screen.getByText(/Uso general por team/)).toBeInTheDocument()
      })
      const charts = screen.getAllByTestId('bar-chart')
      const usoGeneral = JSON.parse(charts[0].getAttribute('data-values'))
      expect(usoGeneral).toEqual([
        { team: 'Team Bianca', color: '#EC4899', total: 1 },
        { team: 'Team Vanessa', color: '#3B82F6', total: 2 },
      ])
    })

    it('cada mini-gráfico de módulo lleva su propia serie por línea, sin compartir escala', async () => {
      loadCompanyUsers.mockResolvedValue({ data: USERS_2, error: null })
      loadUsageActivity.mockResolvedValue({
        data: emptyRaw({
          tasks: [
            { team_id: 'l-1', created_by: 'jefa-1', created_at: '2026-09-05', due_date: null },
            { team_id: 'l-2', created_by: 'jefa-2', created_at: '2026-09-06', due_date: null },
            { team_id: 'l-2', created_by: 'jefa-2', created_at: '2026-09-07', due_date: null },
          ],
        }),
        error: null,
      })
      render(<UsoView companyId="co-1" lines={LINES_2} section="graficas" />)

      await waitFor(() => {
        expect(screen.getByText(/Acciones por módulo/)).toBeInTheDocument()
      })
      // 5 módulos, cada uno con su propio label de mini-gráfico.
      USAGE_MODULES.forEach((mod) => {
        expect(screen.getByText(mod.label)).toBeInTheDocument()
      })
      // Un BarChart por uso general + uno por cada módulo (5) = 6 en total.
      const charts = screen.getAllByTestId('bar-chart')
      expect(charts.length).toBe(1 + USAGE_MODULES.length)

      const tareasChart = charts[1 + USAGE_MODULES.findIndex((m) => m.key === 'tareas')]
      const tareasValues = JSON.parse(tareasChart.getAttribute('data-values'))
      expect(tareasValues).toEqual([
        { team: 'Team Bianca', color: '#EC4899', valor: 1 },
        { team: 'Team Vanessa', color: '#3B82F6', valor: 2 },
      ])

      const reunionesChart = charts[1 + USAGE_MODULES.findIndex((m) => m.key === 'reuniones')]
      const reunionesValues = JSON.parse(reunionesChart.getAttribute('data-values'))
      expect(reunionesValues).toEqual([
        { team: 'Team Bianca', color: '#EC4899', valor: 0 },
        { team: 'Team Vanessa', color: '#3B82F6', valor: 0 },
      ])
    })
  })
})
