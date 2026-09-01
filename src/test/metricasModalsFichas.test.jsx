/**
 * Tests para los cambios funcionales del módulo Reportes/Métricas (fase 2):
 * - EmployeeInfoModal: renderiza info básica del empleado + línea
 * - ClientFichaModal: renderiza ficha técnica del cliente
 * - LineHubView: sin datos rinde el Resumen (no early-return), dos columnas, sin Promedio Anual / Radar
 * - OperacionesView: no hay sección "Feedback"
 * - FinanzasView: toggle lista/tarjetas, KPIs clickeables
 */
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, useLocation } from 'react-router-dom'
import { vi } from 'vitest'
import { createSupabaseMock } from './helpers/supabaseMock'

// ── Mocks globales ─────────────────────────────────────────────────────────────

vi.mock('../supabase', () => ({
  supabase: createSupabaseMock(),
}))

vi.mock('../context/AuthContext', () => ({
  useAuth: vi.fn(() => ({
    userProfile: {
      user_id: 'u-1',
      company_id: 'co-1',
      access_level: 4,
      admin: true,
      first_name: 'Admin',
      last_name: 'Test',
    },
    can: () => true,
    signOut: vi.fn(),
  })),
}))

vi.mock('recharts', () => ({
  LineChart: ({ children }) => <div data-testid="line-chart">{children}</div>,
  BarChart: ({ children }) => <div data-testid="bar-chart">{children}</div>,
  Line: () => null,
  Bar: ({ children }) => <>{children}</>,
  XAxis: () => null,
  YAxis: () => null,
  Tooltip: () => null,
  Legend: () => null,
  CartesianGrid: () => null,
  LabelList: () => null,
  ResponsiveContainer: ({ children }) => <div>{children}</div>,
}))

vi.mock('../components/metricas/ScoreDial', () => ({
  default: () => <div data-testid="score-dial" />,
}))

// Mock de metricsApi centralizado — todos los consumidores de este archivo lo usan
const mockLoadYearReports = vi.fn().mockResolvedValue({ data: [], error: null })
const mockLoadCompanyEmployees = vi.fn().mockResolvedValue({
  data: [
    {
      user_id: 'u-2',
      first_name: 'María',
      last_name: 'González',
      avatar_url: null,
      position: { position_name: 'Diseñadora' },
      department: { department_name: 'Diseño' },
      email: 'maria@mdn.com',
      phone_number: null,
      hire_date: null,
      birth_date: null,
      access_level: 2,
      admin: false,
    },
  ],
  error: null,
})
const mockLoadClients = vi.fn().mockResolvedValue({
  data: [
    {
      id: 'c-1',
      name: 'Pepsi',
      monthly_fee: 1500,
      payment_day: 5,
      logo_url: null,
      line_id: 'l-1',
      contacts: [],
      social_links: [],
    },
  ],
  error: null,
})
const mockLoadReport = vi.fn().mockResolvedValue({ data: null, error: null })
const mockLoadPrevReport = vi.fn().mockResolvedValue({ data: null, error: null })
const mockUpsertReport = vi.fn().mockResolvedValue({ data: null, error: null })

vi.mock('../components/metricas/metricsApi', () => ({
  loadYearReports: (...a) => mockLoadYearReports(...a),
  loadCompanyEmployees: (...a) => mockLoadCompanyEmployees(...a),
  loadClients: (...a) => mockLoadClients(...a),
  loadReport: (...a) => mockLoadReport(...a),
  loadPrevReport: (...a) => mockLoadPrevReport(...a),
  loadRecentReports: vi.fn().mockResolvedValue({ data: [], error: null }),
  upsertReport: (...a) => mockUpsertReport(...a),
  loadCompanyUsers: vi.fn().mockResolvedValue({ data: [], error: null }),
  seedMetricsIfEmpty: vi.fn().mockResolvedValue(null),
  loadLines: vi.fn().mockResolvedValue({ data: [], error: null }),
  loadFixedTaskMarks: vi.fn().mockResolvedValue({ data: [], error: null }),
}))

vi.mock('../utils/metricsFinance', () => ({
  calcFinanzas: vi.fn(() => ({
    totIngresos: 1700,
    totGastosOperativos: 0,
    totSueldos: 0,
    totOtrosGastos: 0,
    totEgresos: 0,
    diferencia: 1700,
  })),
  calcConsolidado: vi.fn(() => []),
  calcConsolidadoConGasto: vi.fn(() => ({
    rows: [],
    totals: { ingresos: 0, gastos: 0, diferencia: 0 },
  })),
  ensureFinanzas: vi.fn(),
  fmtUSD: vi.fn((v) => `$${v}`),
  lastNMonths: vi.fn(() => []),
  buildFinanceTrend: vi.fn(() => []),
}))

vi.mock('../utils/initMetricReport', () => ({
  initMetricReport: vi.fn(() => MINIMAL_REPORT_DATA),
}))
vi.mock('../utils/syncReportClients', () => ({
  syncReportClients: vi.fn((r) => r),
}))
vi.mock('../components/reuniones/meetingsApi', () => ({
  countMeetingsHeldForLine: vi.fn().mockResolvedValue({ count: 0, error: null }),
  loadHeldClientIdsForLine: vi.fn().mockResolvedValue({ clientIds: [], error: null }),
}))

// ── Fixtures ───────────────────────────────────────────────────────────────────

const MINIMAL_REPORT_DATA = {
  reuniones: { realizadas: 0, meta: 15 },
  productividad: { tareas: [] },
  crecimiento: { items: [] },
  solicitudes: { solicitudes: 0, editadas: 0 },
  pautas: { items: [] },
  piezas: { piezas: 0, editadas: 0 },
  finanzas: { ingresos: [], gastosOperativos: [], sueldos: [], otrosGastos: [] },
}

const FINANZAS_REPORT_DATA = {
  ...MINIMAL_REPORT_DATA,
  finanzas: {
    ingresos: [
      { id: 'i-1', clienteId: 'c-1', descripcion: 'Pepsi', monto: 1500 },
      { id: 'i-2', clienteId: null, descripcion: 'Otro ingreso', monto: 200 },
    ],
    gastosOperativos: [],
    sueldos: [],
    otrosGastos: [],
  },
}

const MOCK_LINE = { id: 'l-1', name: 'Georgina', color: '#FAB51A', member_user_ids: ['u-2'] }

function wrap(ui, initialEntry = '/') {
  return render(<MemoryRouter initialEntries={[initialEntry]}>{ui}</MemoryRouter>)
}

// ══════════════════════════════════════════════════════════════════════════════
// 1. EmployeeInfoModal
// ══════════════════════════════════════════════════════════════════════════════

import EmployeeInfoModal from '../components/metricas/EmployeeInfoModal'

const MOCK_EMPLOYEE = {
  user_id: 'u-2',
  first_name: 'María',
  last_name: 'González',
  email: 'maria@mdn.com',
  phone_number: '+58 412 1234567',
  hire_date: '2023-03-15',
  birth_date: '1995-07-22',
  access_level: 2,
  admin: false,
  avatar_url: null,
  position: {
    position_name: 'Diseñadora',
    position_description: 'Responsable de identidad visual de las marcas.',
    position_functions: ['Crear piezas gráficas', 'Revisar calendarios', 'Coordinar con clientes'],
  },
  department: { department_name: 'Diseño' },
}

describe('EmployeeInfoModal — ficha del empleado', () => {
  it('renderiza nombre completo del empleado', () => {
    wrap(<EmployeeInfoModal employee={MOCK_EMPLOYEE} line={MOCK_LINE} onClose={vi.fn()} />)
    expect(screen.getByText('María González')).toBeInTheDocument()
  })

  it('renderiza el cargo del empleado', () => {
    wrap(<EmployeeInfoModal employee={MOCK_EMPLOYEE} line={MOCK_LINE} onClose={vi.fn()} />)
    expect(screen.getByText('Diseñadora')).toBeInTheDocument()
  })

  it('renderiza el departamento', () => {
    wrap(<EmployeeInfoModal employee={MOCK_EMPLOYEE} line={MOCK_LINE} onClose={vi.fn()} />)
    expect(screen.getByText('Diseño')).toBeInTheDocument()
  })

  it('renderiza el correo', () => {
    wrap(<EmployeeInfoModal employee={MOCK_EMPLOYEE} line={MOCK_LINE} onClose={vi.fn()} />)
    expect(screen.getByText('maria@mdn.com')).toBeInTheDocument()
  })

  it('renderiza el chip de la línea', () => {
    wrap(<EmployeeInfoModal employee={MOCK_EMPLOYEE} line={MOCK_LINE} onClose={vi.fn()} />)
    expect(screen.getAllByText('Georgina').length).toBeGreaterThan(0)
  })

  it('renderiza el nivel de acceso "Nivel 2"', () => {
    wrap(<EmployeeInfoModal employee={MOCK_EMPLOYEE} line={MOCK_LINE} onClose={vi.fn()} />)
    expect(screen.getByText('Nivel 2')).toBeInTheDocument()
  })

  it('renderiza la descripción del cargo', () => {
    wrap(<EmployeeInfoModal employee={MOCK_EMPLOYEE} line={MOCK_LINE} onClose={vi.fn()} />)
    expect(screen.getByText('Responsable de identidad visual de las marcas.')).toBeInTheDocument()
  })

  it('renderiza las funciones del cargo como bullets', () => {
    wrap(<EmployeeInfoModal employee={MOCK_EMPLOYEE} line={MOCK_LINE} onClose={vi.fn()} />)
    expect(screen.getByText('Crear piezas gráficas')).toBeInTheDocument()
    expect(screen.getByText('Revisar calendarios')).toBeInTheDocument()
    expect(screen.getByText('Coordinar con clientes')).toBeInTheDocument()
  })

  it('no renderiza sección de funciones cuando position_functions está vacío', () => {
    const emp = {
      ...MOCK_EMPLOYEE,
      position: { ...MOCK_EMPLOYEE.position, position_functions: [] },
    }
    wrap(<EmployeeInfoModal employee={emp} line={MOCK_LINE} onClose={vi.fn()} />)
    expect(screen.queryByText(/Funciones/i)).not.toBeInTheDocument()
  })

  it('muestra "Ver perfil completo" cuando can("evaluaciones") es true', () => {
    wrap(<EmployeeInfoModal employee={MOCK_EMPLOYEE} line={MOCK_LINE} onClose={vi.fn()} />)
    expect(screen.getByText('Ver perfil completo')).toBeInTheDocument()
  })

  it('llama onClose al presionar el botón X', async () => {
    const onClose = vi.fn()
    wrap(<EmployeeInfoModal employee={MOCK_EMPLOYEE} line={MOCK_LINE} onClose={onClose} />)
    await userEvent.click(screen.getByRole('button', { name: /cerrar/i }))
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('llama onClose al presionar Escape', () => {
    const onClose = vi.fn()
    wrap(<EmployeeInfoModal employee={MOCK_EMPLOYEE} line={MOCK_LINE} onClose={onClose} />)
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledOnce()
  })
})

// ══════════════════════════════════════════════════════════════════════════════
// 2. ClientFichaModal
// ══════════════════════════════════════════════════════════════════════════════

import ClientFichaModal from '../components/metricas/ClientFichaModal'

const MOCK_CLIENT = {
  id: 'c-1',
  name: 'Pepsi',
  line_id: 'l-1',
  monthly_fee: 1500,
  payment_day: 5,
  website: 'https://pepsi.com',
  anniversary_date: '2019-04-01',
  mdn_since: '2021-06-15',
  logo_url: null,
  social_manager_id: 'u-social',
  designer_id: 'u-design',
  audiovisual_ids: ['u-av1'],
  apoyo_ids: [],
  contacts: [{ name: 'Carlos Rodríguez', role: 'Marketing', birth_day: 10, birth_month: 3 }],
  social_links: [
    { red: 'Instagram', link: 'https://instagram.com/pepsi' },
    { red: 'TikTok', link: 'https://tiktok.com/@pepsi' },
  ],
}

const MOCK_EMPLOYEES = [
  {
    user_id: 'u-social',
    first_name: 'Ana',
    last_name: 'García',
    avatar_url: null,
    department_id: 1,
  },
  {
    user_id: 'u-design',
    first_name: 'Pedro',
    last_name: 'López',
    avatar_url: null,
    department_id: 3,
  },
  {
    user_id: 'u-av1',
    first_name: 'Camila',
    last_name: 'Torres',
    avatar_url: null,
    department_id: 2,
  },
]

describe('ClientFichaModal — ficha técnica del cliente (usuario privilegiado)', () => {
  // El mock global de useAuth tiene access_level: 4, admin: true → privileged = true

  it('renderiza el nombre del cliente', () => {
    wrap(<ClientFichaModal client={MOCK_CLIENT} line={MOCK_LINE} onClose={vi.fn()} />)
    expect(screen.getByText('Pepsi')).toBeInTheDocument()
  })

  it('renderiza la mensualidad para usuario privilegiado', () => {
    wrap(<ClientFichaModal client={MOCK_CLIENT} line={MOCK_LINE} onClose={vi.fn()} />)
    // fmtUSD mock devuelve "$1500"
    expect(screen.getByText('$1500')).toBeInTheDocument()
  })

  it('renderiza el día de pago para usuario privilegiado', () => {
    wrap(<ClientFichaModal client={MOCK_CLIENT} line={MOCK_LINE} onClose={vi.fn()} />)
    expect(screen.getByText('día 5')).toBeInTheDocument()
  })

  it('renderiza el sitio web', () => {
    wrap(<ClientFichaModal client={MOCK_CLIENT} line={MOCK_LINE} onClose={vi.fn()} />)
    expect(screen.getByText('pepsi.com')).toBeInTheDocument()
  })

  it('renderiza los contactos', () => {
    wrap(<ClientFichaModal client={MOCK_CLIENT} line={MOCK_LINE} onClose={vi.fn()} />)
    expect(screen.getByText('Carlos Rodríguez')).toBeInTheDocument()
    expect(screen.getByText('Marketing')).toBeInTheDocument()
  })

  it('renderiza las redes sociales', () => {
    wrap(<ClientFichaModal client={MOCK_CLIENT} line={MOCK_LINE} onClose={vi.fn()} />)
    expect(screen.getByText('Instagram')).toBeInTheDocument()
    expect(screen.getByText('TikTok')).toBeInTheDocument()
  })

  it('llama onClose al presionar el botón X', async () => {
    const onClose = vi.fn()
    wrap(<ClientFichaModal client={MOCK_CLIENT} line={MOCK_LINE} onClose={onClose} />)
    await userEvent.click(screen.getByRole('button', { name: /cerrar/i }))
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('llama onClose al presionar Escape', () => {
    const onClose = vi.fn()
    wrap(<ClientFichaModal client={MOCK_CLIENT} line={MOCK_LINE} onClose={onClose} />)
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledOnce()
  })
})

import { useAuth as useAuthImport } from '../context/AuthContext'

describe('ClientFichaModal — gating para usuarios sin privilegio (nivel < 4, no admin)', () => {
  beforeEach(() => {
    // Sobreescribir el mock de useAuth para este bloque
    useAuthImport.mockReturnValue({
      userProfile: { user_id: 'u-3', company_id: 'co-1', access_level: 2, admin: false },
      can: () => true,
      signOut: vi.fn(),
    })
  })

  afterEach(() => {
    // Restaurar el mock original con admin: true
    useAuthImport.mockReturnValue({
      userProfile: {
        user_id: 'u-1',
        company_id: 'co-1',
        access_level: 4,
        admin: true,
        first_name: 'Admin',
        last_name: 'Test',
      },
      can: () => true,
      signOut: vi.fn(),
    })
  })

  it('oculta la mensualidad para usuario no privilegiado', () => {
    wrap(<ClientFichaModal client={MOCK_CLIENT} line={MOCK_LINE} onClose={vi.fn()} />)
    expect(screen.queryByText('$1500')).not.toBeInTheDocument()
  })

  it('oculta el día de pago para usuario no privilegiado', () => {
    wrap(<ClientFichaModal client={MOCK_CLIENT} line={MOCK_LINE} onClose={vi.fn()} />)
    expect(screen.queryByText('día 5')).not.toBeInTheDocument()
  })

  it('sigue mostrando el nombre y contactos para usuario no privilegiado', () => {
    wrap(<ClientFichaModal client={MOCK_CLIENT} line={MOCK_LINE} onClose={vi.fn()} />)
    expect(screen.getByText('Pepsi')).toBeInTheDocument()
    expect(screen.getByText('Carlos Rodríguez')).toBeInTheDocument()
  })
})

// ══════════════════════════════════════════════════════════════════════════════
// ClientFichaModal — sección Equipo asignado
// ══════════════════════════════════════════════════════════════════════════════

describe('ClientFichaModal — equipo asignado (con lista de empleados)', () => {
  it('muestra la sección Equipo asignado cuando se pasan empleados y el cliente tiene equipo', () => {
    wrap(
      <ClientFichaModal
        client={MOCK_CLIENT}
        line={MOCK_LINE}
        onClose={vi.fn()}
        employees={MOCK_EMPLOYEES}
      />,
    )
    expect(screen.getByText('Equipo asignado')).toBeInTheDocument()
  })

  it('muestra el nombre del Social Asignado resuelto por user_id', () => {
    wrap(
      <ClientFichaModal
        client={MOCK_CLIENT}
        line={MOCK_LINE}
        onClose={vi.fn()}
        employees={MOCK_EMPLOYEES}
      />,
    )
    expect(screen.getByText('Ana García')).toBeInTheDocument()
  })

  it('muestra el nombre del Diseñador Asignado resuelto por user_id', () => {
    wrap(
      <ClientFichaModal
        client={MOCK_CLIENT}
        line={MOCK_LINE}
        onClose={vi.fn()}
        employees={MOCK_EMPLOYEES}
      />,
    )
    expect(screen.getByText('Pedro López')).toBeInTheDocument()
  })

  it('muestra el nombre del miembro audiovisual resuelto por user_id', () => {
    wrap(
      <ClientFichaModal
        client={MOCK_CLIENT}
        line={MOCK_LINE}
        onClose={vi.fn()}
        employees={MOCK_EMPLOYEES}
      />,
    )
    expect(screen.getByText('Camila Torres')).toBeInTheDocument()
  })
})

describe('ClientFichaModal — equipo asignado (sin lista de empleados)', () => {
  it('NO muestra la sección Equipo asignado cuando no se pasan empleados', () => {
    wrap(<ClientFichaModal client={MOCK_CLIENT} line={MOCK_LINE} onClose={vi.fn()} />)
    expect(screen.queryByText('Equipo asignado')).not.toBeInTheDocument()
  })
})

// ══════════════════════════════════════════════════════════════════════════════
// 3. LineHubView — sin datos rinde el Resumen; dos columnas; sin Promedio Anual / Radar
// ══════════════════════════════════════════════════════════════════════════════

import LineHubView from '../components/metricas/LineHubView'

describe('LineHubView — resumen sin reportes', () => {
  it('con reports=[] renderiza el Resumen completo mostrando "Aún no hay datos" del mes actual', async () => {
    wrap(<LineHubView line={MOCK_LINE} companyId="co-1" year={2026} />)
    await waitFor(() => {
      expect(screen.getAllByText(/Aún no hay datos de/).length).toBeGreaterThan(0)
    })
    expect(screen.queryByTestId('score-dial')).not.toBeInTheDocument()
  })

  it('muestra un aviso de "Sin reportes" (banner informativo)', async () => {
    wrap(<LineHubView line={MOCK_LINE} companyId="co-1" year={2026} />)
    await waitFor(() => {
      expect(screen.getByText(/Sin reportes para 2026/i)).toBeInTheDocument()
    })
  })

  it('NO muestra "Promedio anual"', async () => {
    wrap(<LineHubView line={MOCK_LINE} companyId="co-1" year={2026} />)
    await waitFor(() =>
      expect(screen.getAllByText(/Aún no hay datos de/).length).toBeGreaterThan(0),
    )
    expect(screen.queryByText(/promedio anual/i)).not.toBeInTheDocument()
  })

  it('NO renderiza el Radar de indicadores', async () => {
    wrap(<LineHubView line={MOCK_LINE} companyId="co-1" year={2026} />)
    await waitFor(() =>
      expect(screen.getAllByText(/Aún no hay datos de/).length).toBeGreaterThan(0),
    )
    expect(screen.queryByText(/Radar de indicadores/i)).not.toBeInTheDocument()
  })

  it('muestra la columna de Empleados con María González', async () => {
    wrap(<LineHubView line={MOCK_LINE} companyId="co-1" year={2026} />)
    await waitFor(() => {
      expect(screen.getByText('María González')).toBeInTheDocument()
    })
  })

  it('muestra la columna de Marcas con Pepsi', async () => {
    wrap(<LineHubView line={MOCK_LINE} companyId="co-1" year={2026} />)
    await waitFor(() => {
      expect(screen.getByText('Pepsi')).toBeInTheDocument()
    })
  })

  it('al hacer click en el empleado abre EmployeeInfoModal', async () => {
    wrap(<LineHubView line={MOCK_LINE} companyId="co-1" year={2026} />)
    await waitFor(() => expect(screen.getByText('María González')).toBeInTheDocument())
    await userEvent.click(screen.getByTitle('Ver información de María González'))
    // El modal duplica el nombre en su header
    await waitFor(() => {
      expect(screen.getAllByText('María González').length).toBeGreaterThan(1)
    })
  })

  it('al hacer click en la marca abre ClientFichaModal', async () => {
    wrap(<LineHubView line={MOCK_LINE} companyId="co-1" year={2026} />)
    await waitFor(() => expect(screen.getByText('Pepsi')).toBeInTheDocument())
    await userEvent.click(screen.getByTitle('Ver ficha de Pepsi'))
    await waitFor(() => {
      expect(screen.getByText('día 5')).toBeInTheDocument()
    })
  })
})

// ══════════════════════════════════════════════════════════════════════════════
// 4. OperacionesView — no existe sección "7. Feedback"
// ══════════════════════════════════════════════════════════════════════════════

import OperacionesView from '../components/metricas/OperacionesView'

describe('OperacionesView — sin sección Feedback', () => {
  beforeEach(() => {
    mockLoadReport.mockResolvedValue({ data: { data: MINIMAL_REPORT_DATA }, error: null })
    mockLoadPrevReport.mockResolvedValue({ data: null, error: null })
    mockLoadClients.mockResolvedValue({ data: [], error: null })
  })

  it('no renderiza el título "7. Feedback de clientes"', async () => {
    wrap(<OperacionesView line={MOCK_LINE} companyId="co-1" year={2026} month={6} />)
    await waitFor(() => {
      expect(screen.getByText(/Reuniones realizadas/i)).toBeInTheDocument()
    })
    expect(screen.queryByText(/Feedback de clientes/i)).not.toBeInTheDocument()
  })

  it('sí renderiza las 6 secciones restantes', async () => {
    wrap(<OperacionesView line={MOCK_LINE} companyId="co-1" year={2026} month={6} />)
    await waitFor(() => {
      expect(screen.getByText(/Reuniones realizadas/i)).toBeInTheDocument()
    })
    expect(screen.getByText(/Tareas Fijas/i)).toBeInTheDocument()
    expect(screen.getByText(/Crecimiento de seguidores/i)).toBeInTheDocument()
    expect(screen.getByText(/Solicitudes vs Entregados/i)).toBeInTheDocument()
    expect(screen.getByText(/Nº Pautas/i)).toBeInTheDocument()
    expect(screen.getByText(/Nº Piezas/i)).toBeInTheDocument()
  })
})

// ══════════════════════════════════════════════════════════════════════════════
// 4b. OperacionesView — Crecimiento de seguidores: editabilidad por campo
// ══════════════════════════════════════════════════════════════════════════════

const CRECIMIENTO_REPORT_DATA = {
  ...MINIMAL_REPORT_DATA,
  crecimiento: {
    items: [
      {
        clienteId: 'c-1',
        seguidoresGanados: null,
        seguidoresActuales: null,
        seguidoresGanadosPrev: null,
        seguidoresBase: null,
        meta: 50,
      },
    ],
  },
}

const PREV_REPORT_CON_SEGUIDORES = {
  data: {
    data: {
      ...MINIMAL_REPORT_DATA,
      crecimiento: {
        items: [
          {
            clienteId: 'c-1',
            seguidoresGanados: 100,
            seguidoresActuales: 1500,
            seguidoresGanadosPrev: null,
            seguidoresBase: null,
            meta: 50,
          },
        ],
      },
    },
  },
  error: null,
}

const PREV_REPORT_SIN_SEGUIDORES = {
  data: {
    data: {
      ...MINIMAL_REPORT_DATA,
      crecimiento: {
        items: [
          {
            clienteId: 'c-1',
            seguidoresGanados: null,
            seguidoresActuales: null,
            seguidoresGanadosPrev: null,
            seguidoresBase: null,
            meta: 50,
          },
        ],
      },
    },
  },
  error: null,
}

describe('OperacionesView — Crecimiento seguidores: editabilidad por campo', () => {
  beforeEach(() => {
    mockLoadReport.mockResolvedValue({ data: { data: CRECIMIENTO_REPORT_DATA }, error: null })
    mockLoadClients.mockResolvedValue({
      data: [
        {
          id: 'c-1',
          name: 'Pepsi',
          monthly_fee: 1500,
          payment_day: 5,
          logo_url: null,
          line_id: 'l-1',
          contacts: [],
          social_links: [],
        },
      ],
      error: null,
    })
  })

  it('muestra "Primer mes de uso" y permite editar cuando no hay reporte previo', async () => {
    mockLoadPrevReport.mockResolvedValue({ data: null, error: null })
    wrap(<OperacionesView line={MOCK_LINE} companyId="co-1" year={2026} month={6} />)
    await waitFor(() => {
      expect(screen.getByText(/Primer mes de uso/i)).toBeInTheDocument()
    })
    const ganSpan = screen.getByText(/Gan\. May/)
    const ganInput = ganSpan.closest('div').querySelector('input')
    expect(ganInput).not.toBeDisabled()
    const totSpan = screen.getByText(/Tot\. May/)
    const totInput = totSpan.closest('div').querySelector('input')
    expect(totInput).not.toBeDisabled()
  })

  it('bloquea las columnas del mes anterior cuando el reporte previo tiene valores', async () => {
    mockLoadPrevReport.mockResolvedValue(PREV_REPORT_CON_SEGUIDORES)
    wrap(<OperacionesView line={MOCK_LINE} companyId="co-1" year={2026} month={6} />)
    await waitFor(() => {
      expect(screen.getByText(/Crecimiento de seguidores/i)).toBeInTheDocument()
    })
    expect(
      screen.queryByText(/algunos valores del mes anterior están vacíos/i),
    ).not.toBeInTheDocument()
    const ganSpan = screen.getByText(/Gan\. May/)
    const ganInput = ganSpan.closest('div').querySelector('input')
    expect(ganInput).toBeDisabled()
    const totSpan = screen.getByText(/Tot\. May/)
    const totInput = totSpan.closest('div').querySelector('input')
    expect(totInput).toBeDisabled()
  })

  it('permite editar y muestra aviso cuando el reporte previo existe pero tiene seguidores vacíos', async () => {
    mockLoadPrevReport.mockResolvedValue(PREV_REPORT_SIN_SEGUIDORES)
    wrap(<OperacionesView line={MOCK_LINE} companyId="co-1" year={2026} month={6} />)
    await waitFor(() => {
      expect(screen.getByText(/algunos valores del mes anterior están vacíos/i)).toBeInTheDocument()
    })
    const ganSpan = screen.getByText(/Gan\. May/)
    const ganInput = ganSpan.closest('div').querySelector('input')
    expect(ganInput).not.toBeDisabled()
    const totSpan = screen.getByText(/Tot\. May/)
    const totInput = totSpan.closest('div').querySelector('input')
    expect(totInput).not.toBeDisabled()
  })

  it('muestra el valor del mes anterior como valor por defecto cuando existe', async () => {
    mockLoadPrevReport.mockResolvedValue(PREV_REPORT_CON_SEGUIDORES)
    wrap(<OperacionesView line={MOCK_LINE} companyId="co-1" year={2026} month={6} />)
    await waitFor(() => {
      expect(screen.getByText(/Gan\. May/)).toBeInTheDocument()
    })
    const ganSpan = screen.getByText(/Gan\. May/)
    const ganInput = ganSpan.closest('div').querySelector('input')
    expect(ganInput.value).toBe('100')
    const totSpan = screen.getByText(/Tot\. May/)
    const totInput = totSpan.closest('div').querySelector('input')
    expect(totInput.value).toBe('1500')
  })
})

// ══════════════════════════════════════════════════════════════════════════════
// 5. FinanzasView — toggle Lista/Tarjetas + KPIs clickeables
// ══════════════════════════════════════════════════════════════════════════════

import FinanzasView from '../components/metricas/FinanzasView'

describe('FinanzasView — toggle Lista/Tarjetas + KPIs + Nómina', () => {
  beforeEach(() => {
    mockLoadReport.mockResolvedValue({ data: { data: FINANZAS_REPORT_DATA }, error: null })
    mockLoadPrevReport.mockResolvedValue({ data: null, error: null })
    mockLoadClients.mockResolvedValue({
      data: [
        {
          id: 'c-1',
          name: 'Pepsi',
          monthly_fee: 1500,
          payment_day: 5,
          logo_url: null,
          line_id: 'l-1',
          contacts: [],
          social_links: [],
        },
      ],
      error: null,
    })
    // Restaurar auth privilegiado
    useAuthImport.mockReturnValue({
      userProfile: {
        user_id: 'u-1',
        company_id: 'co-1',
        access_level: 4,
        admin: true,
        first_name: 'Admin',
        last_name: 'Test',
      },
      can: () => true,
      signOut: vi.fn(),
    })
  })

  it('renderiza el toggle "Lista" / "Tarjetas" en la sección Ingresos', async () => {
    wrap(<FinanzasView line={MOCK_LINE} companyId="co-1" year={2026} month={6} />)
    await waitFor(() => {
      // Hay 2 toggles: Ingresos y Sueldos
      expect(screen.getAllByText('Lista').length).toBeGreaterThanOrEqual(1)
      expect(screen.getAllByText('Tarjetas').length).toBeGreaterThanOrEqual(1)
    })
  })

  it('la vista por defecto es Tarjetas — Pepsi visible sin hacer click', async () => {
    wrap(<FinanzasView line={MOCK_LINE} companyId="co-1" year={2026} month={6} />)
    await waitFor(() => {
      expect(screen.getByText('Pepsi')).toBeInTheDocument()
    })
  })

  it('al cambiar a "Lista" Pepsi sigue visible', async () => {
    wrap(<FinanzasView line={MOCK_LINE} companyId="co-1" year={2026} month={6} />)
    await waitFor(() => expect(screen.getAllByText('Lista').length).toBeGreaterThanOrEqual(1))
    // Click el primer toggle "Lista" (sección Ingresos)
    await userEvent.click(screen.getAllByText('Lista')[0])
    await waitFor(() => {
      expect(screen.getByText('Pepsi')).toBeInTheDocument()
    })
  })

  it('el KPI "Ingresos brutos" es un botón (clickeable)', async () => {
    wrap(<FinanzasView line={MOCK_LINE} companyId="co-1" year={2026} month={6} />)
    await waitFor(() => {
      expect(screen.getByTitle('Ir a ingresos')).toBeInTheDocument()
    })
    expect(screen.getByTitle('Ir a ingresos').tagName.toLowerCase()).toBe('button')
  })

  it('el KPI "Total egresos" es un botón (clickeable)', async () => {
    wrap(<FinanzasView line={MOCK_LINE} companyId="co-1" year={2026} month={6} />)
    await waitFor(() => {
      expect(screen.getByTitle('Ir a gastos')).toBeInTheDocument()
    })
    expect(screen.getByTitle('Ir a gastos').tagName.toLowerCase()).toBe('button')
  })

  it('muestra la sección Sueldos / Nómina para usuario privilegiado', async () => {
    wrap(<FinanzasView line={MOCK_LINE} companyId="co-1" year={2026} month={6} />)
    await waitFor(() => {
      expect(screen.getByText('Sueldos / Nómina')).toBeInTheDocument()
    })
  })

  it('oculta la sección Sueldos / Nómina para usuario no privilegiado', async () => {
    useAuthImport.mockReturnValue({
      userProfile: { user_id: 'u-3', company_id: 'co-1', access_level: 2, admin: false },
      can: () => true,
      signOut: vi.fn(),
    })
    wrap(<FinanzasView line={MOCK_LINE} companyId="co-1" year={2026} month={6} />)
    await waitFor(() => {
      // Ingresos siempre visible
      expect(screen.getByText('Ingresos')).toBeInTheDocument()
    })
    expect(screen.queryByText('Sueldos / Nómina')).not.toBeInTheDocument()
  })
})

describe('FinanzasView — reporte cerrado (prop "closed")', () => {
  beforeEach(() => {
    mockLoadReport.mockResolvedValue({ data: { data: FINANZAS_REPORT_DATA }, error: null })
    mockLoadPrevReport.mockResolvedValue({ data: null, error: null })
    mockLoadClients.mockResolvedValue({
      data: [
        {
          id: 'c-1',
          name: 'Pepsi',
          monthly_fee: 1500,
          payment_day: 5,
          logo_url: null,
          line_id: 'l-1',
          contacts: [],
          social_links: [],
        },
      ],
      error: null,
    })
    useAuthImport.mockReturnValue({
      userProfile: {
        user_id: 'u-1',
        company_id: 'co-1',
        access_level: 4,
        admin: true,
        first_name: 'Admin',
        last_name: 'Test',
      },
      can: () => true,
      signOut: vi.fn(),
    })
  })

  it('deshabilita todos los inputs y el botón "Guardar finanzas"', async () => {
    wrap(<FinanzasView line={MOCK_LINE} companyId="co-1" year={2026} month={6} closed />)
    await waitFor(() => {
      expect(screen.getByText('Guardar finanzas')).toBeInTheDocument()
    })
    expect(screen.getByText('Guardar finanzas')).toBeDisabled()
    const inputs = document.querySelectorAll('input, textarea, select')
    expect(inputs.length).toBeGreaterThan(0)
    inputs.forEach((input) => expect(input).toBeDisabled())
  })

  it('sin "closed" (default) los inputs y el botón "Guardar finanzas" siguen habilitados', async () => {
    wrap(<FinanzasView line={MOCK_LINE} companyId="co-1" year={2026} month={6} />)
    await waitFor(() => {
      expect(screen.getByText('Guardar finanzas')).toBeInTheDocument()
    })
    expect(screen.getByText('Guardar finanzas')).not.toBeDisabled()
  })
})

// ══════════════════════════════════════════════════════════════════════════════
// 6. FinanzasView — Sueldos: toggle Lista/Tarjetas + foto de perfil
// ══════════════════════════════════════════════════════════════════════════════

describe('FinanzasView — Sueldos toggle Lista/Tarjetas y foto de perfil', () => {
  const EMPLOYEE_WITH_AVATAR = {
    user_id: 'u-2',
    first_name: 'María',
    last_name: 'González',
    avatar_url: 'https://res.cloudinary.com/test/image/upload/maria.jpg',
    position: { position_name: 'Diseñadora' },
    department: { department_name: 'Diseño' },
    email: 'maria@mdn.com',
    phone_number: null,
    hire_date: null,
    birth_date: null,
    access_level: 2,
    admin: false,
  }

  const SUELDOS_REPORT = {
    ...MINIMAL_REPORT_DATA,
    finanzas: {
      ingresos: [],
      gastosOperativos: [],
      sueldos: [{ id: 'sue-u-2', empleadoId: 'u-2', descripcion: 'María González', monto: 1200 }],
      otrosGastos: [],
    },
  }

  beforeEach(() => {
    mockLoadReport.mockResolvedValue({ data: { data: SUELDOS_REPORT }, error: null })
    mockLoadPrevReport.mockResolvedValue({ data: null, error: null })
    mockLoadClients.mockResolvedValue({ data: [], error: null })
    mockLoadCompanyEmployees.mockResolvedValue({ data: [EMPLOYEE_WITH_AVATAR], error: null })
    useAuthImport.mockReturnValue({
      userProfile: {
        user_id: 'u-1',
        company_id: 'co-1',
        access_level: 4,
        admin: true,
        first_name: 'Admin',
        last_name: 'Test',
      },
      can: () => true,
      signOut: vi.fn(),
    })
  })

  afterEach(() => {
    // Restaurar el mock global de empleados (sin avatar)
    mockLoadCompanyEmployees.mockResolvedValue({
      data: [
        {
          user_id: 'u-2',
          first_name: 'María',
          last_name: 'González',
          avatar_url: null,
          position: { position_name: 'Diseñadora' },
          department: { department_name: 'Diseño' },
          email: 'maria@mdn.com',
          phone_number: null,
          hire_date: null,
          birth_date: null,
          access_level: 2,
          admin: false,
        },
      ],
      error: null,
    })
  })

  it('la sección Sueldos tiene el toggle Lista/Tarjetas (igual que Ingresos)', async () => {
    wrap(<FinanzasView line={MOCK_LINE} companyId="co-1" year={2026} month={6} />)
    await waitFor(() => expect(screen.getByText('Sueldos / Nómina')).toBeInTheDocument())
    // Ingresos + Sueldos → 2 botones "Lista" y 2 "Tarjetas"
    expect(screen.getAllByText('Lista').length).toBe(2)
    expect(screen.getAllByText('Tarjetas').length).toBe(2)
  })

  it('en vista tarjetas (default) muestra la foto de perfil del empleado', async () => {
    wrap(<FinanzasView line={MOCK_LINE} companyId="co-1" year={2026} month={6} />)
    await waitFor(() => {
      const img = screen.getByAltText('MG')
      expect(img).toHaveAttribute('src', EMPLOYEE_WITH_AVATAR.avatar_url)
    })
  })

  it('al cambiar a vista lista la foto de perfil sigue visible', async () => {
    wrap(<FinanzasView line={MOCK_LINE} companyId="co-1" year={2026} month={6} />)
    await waitFor(() => expect(screen.getByText('Sueldos / Nómina')).toBeInTheDocument())
    // Click "Lista" del toggle de Sueldos (el segundo de los dos toggles)
    const listaButtons = screen.getAllByText('Lista')
    await userEvent.click(listaButtons[1])
    await waitFor(() => {
      const img = screen.getByAltText('MG')
      expect(img).toHaveAttribute('src', EMPLOYEE_WITH_AVATAR.avatar_url)
    })
  })

  it('en vista tarjetas muestra el cargo debajo del nombre del empleado', async () => {
    wrap(<FinanzasView line={MOCK_LINE} companyId="co-1" year={2026} month={6} />)
    await waitFor(() => expect(screen.getByText('Sueldos / Nómina')).toBeInTheDocument())
    // El nombre y el cargo deben ser visibles en la sección de sueldos (vista tarjetas default)
    expect(screen.getByText('María González')).toBeInTheDocument()
    expect(screen.getByText('Diseñadora')).toBeInTheDocument()
  })

  it('en vista lista el cargo sigue visible debajo del nombre', async () => {
    wrap(<FinanzasView line={MOCK_LINE} companyId="co-1" year={2026} month={6} />)
    await waitFor(() => expect(screen.getByText('Sueldos / Nómina')).toBeInTheDocument())
    // Cambiar a vista Lista en la sección Sueldos (segundo toggle)
    const listaButtons = screen.getAllByText('Lista')
    await userEvent.click(listaButtons[1])
    await waitFor(() => {
      expect(screen.getByText('María González')).toBeInTheDocument()
      expect(screen.getByText('Diseñadora')).toBeInTheDocument()
    })
  })

  it('sin position_name no rompe: muestra solo el nombre', async () => {
    mockLoadCompanyEmployees.mockResolvedValue({
      data: [{ ...EMPLOYEE_WITH_AVATAR, position: null }],
      error: null,
    })
    wrap(<FinanzasView line={MOCK_LINE} companyId="co-1" year={2026} month={6} />)
    await waitFor(() => expect(screen.getByText('Sueldos / Nómina')).toBeInTheDocument())
    expect(screen.getByText('María González')).toBeInTheDocument()
    expect(screen.queryByText('Diseñadora')).not.toBeInTheDocument()
  })

  it('sin avatar_url muestra iniciales en lugar de img', async () => {
    mockLoadCompanyEmployees.mockResolvedValue({
      data: [{ ...EMPLOYEE_WITH_AVATAR, avatar_url: null }],
      error: null,
    })
    wrap(<FinanzasView line={MOCK_LINE} companyId="co-1" year={2026} month={6} />)
    await waitFor(() => expect(screen.getByText('Sueldos / Nómina')).toBeInTheDocument())
    await waitFor(() => {
      expect(screen.queryByAltText('MG')).not.toBeInTheDocument() // no hay <img>
      expect(screen.getByText('MG')).toBeInTheDocument() // se muestran iniciales
    })
  })
})

// ══════════════════════════════════════════════════════════════════════════════
// 7. FinanzasView — deep-link ?section=ingresos|gastos (scroll one-shot)
// ══════════════════════════════════════════════════════════════════════════════

describe('FinanzasView — scroll a sección desde ?section=', () => {
  let scrollSpy

  function LocationSpy() {
    const loc = useLocation()
    return <div data-testid="location">{loc.pathname + loc.search}</div>
  }

  function renderWithSection(search, month = 6) {
    return render(
      <MemoryRouter initialEntries={[`/reportes/linea/l-1${search}`]}>
        <FinanzasView line={MOCK_LINE} companyId="co-1" year={2026} month={month} />
        <LocationSpy />
      </MemoryRouter>,
    )
  }

  beforeEach(() => {
    mockLoadReport.mockResolvedValue({ data: { data: FINANZAS_REPORT_DATA }, error: null })
    mockLoadPrevReport.mockResolvedValue({ data: null, error: null })
    mockLoadClients.mockResolvedValue({
      data: [
        {
          id: 'c-1',
          name: 'Pepsi',
          monthly_fee: 1500,
          payment_day: 5,
          logo_url: null,
          line_id: 'l-1',
          contacts: [],
          social_links: [],
        },
      ],
      error: null,
    })
    useAuthImport.mockReturnValue({
      userProfile: {
        user_id: 'u-1',
        company_id: 'co-1',
        access_level: 4,
        admin: true,
        first_name: 'Admin',
        last_name: 'Test',
      },
      can: () => true,
      signOut: vi.fn(),
    })
    scrollSpy = vi.fn()
    Element.prototype.scrollIntoView = scrollSpy // jsdom no lo implementa
  })

  it('con ?section=ingresos scrollea una vez tras cargar', async () => {
    renderWithSection('?tab=finanzas&section=ingresos')
    await waitFor(() => expect(scrollSpy).toHaveBeenCalledTimes(1))
  })

  it('con ?section=gastos scrollea a gastos operativos', async () => {
    renderWithSection('?tab=finanzas&section=gastos')
    await waitFor(() => expect(scrollSpy).toHaveBeenCalledTimes(1))
  })

  it('limpia el param section de la URL tras el scroll (conserva tab)', async () => {
    renderWithSection('?tab=finanzas&section=ingresos')
    await waitFor(() => expect(scrollSpy).toHaveBeenCalledTimes(1))
    await waitFor(() => {
      const loc = screen.getByTestId('location').textContent
      expect(loc).toContain('tab=finanzas')
      expect(loc).not.toContain('section=')
    })
  })

  it('no re-scrollea al recargar por cambio de mes', async () => {
    const view = renderWithSection('?tab=finanzas&section=ingresos')
    await waitFor(() => expect(scrollSpy).toHaveBeenCalledTimes(1))
    view.rerender(
      <MemoryRouter initialEntries={['/reportes/linea/l-1?tab=finanzas&section=ingresos']}>
        <FinanzasView line={MOCK_LINE} companyId="co-1" year={2026} month={7} />
        <LocationSpy />
      </MemoryRouter>,
    )
    await waitFor(() => expect(screen.getByText('Ingresos')).toBeInTheDocument())
    expect(scrollSpy).toHaveBeenCalledTimes(1)
  })

  it('sin ?section= no scrollea', async () => {
    renderWithSection('?tab=finanzas')
    await waitFor(() => expect(screen.getByText('Ingresos')).toBeInTheDocument())
    expect(scrollSpy).not.toHaveBeenCalled()
  })

  it('con ?section= desconocido no scrollea pero limpia el param', async () => {
    renderWithSection('?tab=finanzas&section=xyz')
    await waitFor(() => expect(screen.getByText('Ingresos')).toBeInTheDocument())
    await waitFor(() => {
      expect(screen.getByTestId('location').textContent).not.toContain('section=')
    })
    expect(scrollSpy).not.toHaveBeenCalled()
  })
})
