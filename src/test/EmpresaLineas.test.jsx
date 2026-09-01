import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { vi } from 'vitest'

// ── Datos de prueba ───────────────────────────────────────────────────────────
const MOCK_LINES = [
  {
    id: 'line-1',
    company_id: 'co-1',
    name: 'Georgina',
    color: '#FAB51A',
    sort_order: 0,
    member_user_ids: ['u-1'],
  },
  {
    id: 'line-2',
    company_id: 'co-1',
    name: 'Daniellys',
    color: '#3B82F6',
    sort_order: 1,
    member_user_ids: [],
  },
]

const MOCK_USERS = [
  {
    user_id: 'u-1',
    company_id: 'co-1',
    first_name: 'Ana',
    last_name: 'González',
    avatar_url: null,
  },
  {
    user_id: 'u-2',
    company_id: 'co-1',
    first_name: 'Pedro',
    last_name: 'Martínez',
    avatar_url: null,
  },
]

const MOCK_CLIENTS = [
  { id: 'c-1', company_id: 'co-1', line_id: 'line-1', name: 'Marca A' },
  { id: 'c-2', company_id: 'co-1', line_id: 'line-1', name: 'Marca B' },
  { id: 'c-3', company_id: 'co-1', line_id: 'line-2', name: 'Marca C' },
]

// ── Reporte cerrado de prueba (line-1, mes actual) ─────────────────────────────
// Dinámico para que coincida con la lógica de LinesView (mes actual = CURRENT_MONTH).
const _testNow = new Date()
const MOCK_REPORTS = [
  {
    id: 'r-1',
    line_id: 'line-1',
    year: _testNow.getFullYear(),
    month: _testNow.getMonth() + 1,
    data: {
      reuniones: { realizadas: 15, meta: 15 },
      productividad: { tareas: [] },
      crecimiento: { items: [] },
      solicitudes: { solicitudes: 0, editadas: 0 },
      pautas: { items: [] },
      piezas: { piezas: 0, editadas: 0 },
    },
  },
]

// ── Mock metricsApi ───────────────────────────────────────────────────────────
const mockLoadLines = vi.fn().mockResolvedValue({ data: MOCK_LINES, error: null })
const mockUpdateLine = vi.fn().mockResolvedValue({ data: MOCK_LINES[0], error: null })
const mockDeleteLine = vi.fn().mockResolvedValue({ data: null, error: null })
const mockCreateLine = vi
  .fn()
  .mockResolvedValue({
    data: { id: 'line-new', name: 'Nueva', color: '#FAB51A', sort_order: 2, member_user_ids: [] },
    error: null,
  })
const mockLoadCompanyUsers = vi.fn().mockResolvedValue({ data: MOCK_USERS, error: null })
// loadClients ahora se usa en LinesView para mostrar el conteo de marcas por línea
const mockLoadClients = vi.fn().mockResolvedValue({ data: MOCK_CLIENTS, error: null })
const mockLoadYearReports = vi.fn().mockResolvedValue({ data: MOCK_REPORTS, error: null })
const mockSeedIfEmpty = vi.fn().mockResolvedValue(null)
const mockAddLineMember = vi.fn().mockResolvedValue({ data: null, error: null })
const mockRemoveLineMember = vi.fn().mockResolvedValue({ data: null, error: null })

vi.mock('../components/metricas/metricsApi', () => ({
  loadLines: (...a) => mockLoadLines(...a),
  updateLine: (...a) => mockUpdateLine(...a),
  deleteLine: (...a) => mockDeleteLine(...a),
  createLine: (...a) => mockCreateLine(...a),
  loadCompanyUsers: (...a) => mockLoadCompanyUsers(...a),
  loadClients: (...a) => mockLoadClients(...a),
  loadYearReports: (...a) => mockLoadYearReports(...a),
  seedMetricsIfEmpty: (...a) => mockSeedIfEmpty(...a),
  addLineMember: (...a) => mockAddLineMember(...a),
  removeLineMember: (...a) => mockRemoveLineMember(...a),
}))

// ── Mock supabase (realtime) ──────────────────────────────────────────────────
vi.mock('../supabase', () => {
  const channel = { on: vi.fn().mockReturnThis(), subscribe: vi.fn().mockReturnThis() }
  return {
    supabase: {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        order: vi.fn().mockResolvedValue({ data: [], error: null }),
      }),
      channel: vi.fn(() => channel),
      removeChannel: vi.fn(),
    },
  }
})

// ── Mock AuthContext ──────────────────────────────────────────────────────────
vi.mock('../context/AuthContext', () => ({
  useAuth: vi.fn(),
}))

import { useAuth } from '../context/AuthContext'
import EmpresaPage from '../pages/EmpresaPage'

function renderAsManager() {
  useAuth.mockReturnValue({
    userProfile: {
      user_id: 'u-mgr',
      company_id: 'co-1',
      access_level: 2,
      admin: false,
    },
  })
  return render(
    <MemoryRouter initialEntries={['/empresa/lineas']}>
      <EmpresaPage />
    </MemoryRouter>,
  )
}

// Capabilities restringidas para nivel 1 según los defaults sembrados
const LEVEL1_RESTRICTED = [
  'empresa.departamentos',
  'empresa.empleados',
  'empresa.preguntas',
  'empresa.permisos',
  'empresa.clientes',
  'empresa.lineas',
  'empresa.clientes.manage',
  'empresa.lineas.manage',
]

function renderAsRegular() {
  useAuth.mockReturnValue({
    userProfile: {
      user_id: 'u-reg',
      company_id: 'co-1',
      access_level: 1,
      admin: false,
    },
    can: (key) => !LEVEL1_RESTRICTED.includes(key),
  })
  return render(
    <MemoryRouter initialEntries={['/empresa']}>
      <EmpresaPage />
    </MemoryRouter>,
  )
}

// ── Tests ─────────────────────────────────────────────────────────────────────
describe('LinesView (sección Líneas en Empresa)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockLoadLines.mockResolvedValue({ data: MOCK_LINES, error: null })
    mockLoadCompanyUsers.mockResolvedValue({ data: MOCK_USERS, error: null })
    mockLoadClients.mockResolvedValue({ data: MOCK_CLIENTS, error: null })
    mockLoadYearReports.mockResolvedValue({ data: MOCK_REPORTS, error: null })
    mockUpdateLine.mockResolvedValue({ data: MOCK_LINES[0], error: null })
    mockDeleteLine.mockResolvedValue({ data: null, error: null })
    mockCreateLine.mockResolvedValue({
      data: { id: 'line-new', name: 'Nueva', color: '#FAB51A', sort_order: 2, member_user_ids: [] },
      error: null,
    })
  })

  it('renderiza las líneas existentes', async () => {
    renderAsManager()
    await waitFor(() => {
      expect(screen.getByText('Georgina')).toBeInTheDocument()
    })
    expect(screen.getByText('Daniellys')).toBeInTheDocument()
  })

  it('muestra estadísticas de empleados y marcas en cada card con números grandes', async () => {
    renderAsManager()
    await waitFor(() => {
      expect(screen.getByText('Georgina')).toBeInTheDocument()
    })
    // Ambas cards muestran las etiquetas stat (selector 'p' excluye el tab de nav "Empleados")
    expect(screen.getAllByText('Empleados', { selector: 'p' })).toHaveLength(2)
    expect(screen.getAllByText('Marcas', { selector: 'p' })).toHaveLength(2)
    // Números: Georgina→1 miembro, 2 marcas; Daniellys→0 miembros, 1 marca
    expect(screen.getByText('0')).toBeInTheDocument() // Daniellys, 0 empleados (único)
    expect(screen.getByText('2')).toBeInTheDocument() // Georgina, 2 marcas (único)
    expect(screen.getAllByText('1')).toHaveLength(2) // Georgina 1 empleado + Daniellys 1 marca
  })

  it('"Nueva línea" abre el modal de creación de línea', async () => {
    const user = userEvent.setup()
    renderAsManager()
    await waitFor(() => {
      expect(screen.getByText('Georgina')).toBeInTheDocument()
    })

    await user.click(screen.getByRole('button', { name: /Nueva línea/i }))
    expect(screen.getByRole('heading', { name: 'Nueva línea' })).toBeInTheDocument()
  })

  it('crear línea desde el modal llama a createLine', async () => {
    const user = userEvent.setup()
    renderAsManager()
    await waitFor(() => {
      expect(screen.getByText('Georgina')).toBeInTheDocument()
    })

    await user.click(screen.getByRole('button', { name: /Nueva línea/i }))
    await user.type(screen.getByPlaceholderText('Nombre de la línea'), 'Sabrina')
    await user.click(screen.getByRole('button', { name: 'Crear línea' }))

    await waitFor(() => {
      expect(mockCreateLine).toHaveBeenCalledWith(
        'co-1',
        expect.objectContaining({ name: 'Sabrina' }),
      )
    })
  })

  it('editar línea abre el modal con nombre pre-rellenado', async () => {
    const user = userEvent.setup()
    renderAsManager()
    await waitFor(() => {
      expect(screen.getByText('Georgina')).toBeInTheDocument()
    })

    const editBtns = screen.getAllByRole('button', { name: 'Editar línea' })
    await user.click(editBtns[0])

    expect(screen.getByRole('heading', { name: 'Editar línea' })).toBeInTheDocument()
    expect(screen.getByDisplayValue('Georgina')).toBeInTheDocument()
  })

  it('eliminar línea abre el diálogo de confirmación y llama a deleteLine', async () => {
    const user = userEvent.setup()
    renderAsManager()
    await waitFor(() => {
      expect(screen.getByText('Georgina')).toBeInTheDocument()
    })

    const deleteBtns = screen.getAllByRole('button', { name: 'Eliminar línea' })
    await user.click(deleteBtns[0])

    expect(screen.getByRole('heading', { name: 'Eliminar línea' })).toBeInTheDocument()

    const confirmInput = screen.getByPlaceholderText('Georgina')
    await user.type(confirmInput, 'Georgina')

    const allEliminar = screen.getAllByRole('button', { name: 'Eliminar' })
    await user.click(allEliminar[allEliminar.length - 1])

    await waitFor(() => {
      expect(mockDeleteLine).toHaveBeenCalledWith('line-1')
    })
  })

  it('el tab Líneas no aparece para usuarios sin acceso', () => {
    renderAsRegular()
    expect(screen.queryByRole('button', { name: 'Líneas' })).not.toBeInTheDocument()
  })

  it('muestra el label "Salud" en la card que tiene reportes cerrados', async () => {
    renderAsManager()
    await waitFor(() => {
      expect(screen.getByText('Georgina')).toBeInTheDocument()
    })
    // Georgina (line-1) tiene MOCK_REPORTS con mes 3 → el dial muestra el label
    expect(screen.getAllByText(/Salud/i).length).toBeGreaterThan(0)
  })

  it('muestra "Sin datos" en la card que no tiene reportes', async () => {
    renderAsManager()
    await waitFor(() => {
      expect(screen.getByText('Daniellys')).toBeInTheDocument()
    })
    // Daniellys (line-2) no tiene reportes → "Sin datos"
    expect(screen.getByText(/Sin/i)).toBeInTheDocument()
  })

  it('renderiza la inicial de al menos una marca de line-1', async () => {
    renderAsManager()
    await waitFor(() => {
      expect(screen.getByText('Georgina')).toBeInTheDocument()
    })
    // MOCK_CLIENTS tiene "Marca A" y "Marca B" en line-1 → iniciales M visibles en avatares
    const initials = screen.getAllByText('M')
    expect(initials.length).toBeGreaterThan(0)
  })
})
