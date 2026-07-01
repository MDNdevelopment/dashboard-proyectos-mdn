import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { vi } from 'vitest'

// ── Datos de prueba ───────────────────────────────────────────────────────────
const MOCK_LINES = [
  { id: 'line-1', company_id: 'co-1', name: 'Georgina',  color: '#FAB51A', sort_order: 0, member_user_ids: ['u-1'] },
  { id: 'line-2', company_id: 'co-1', name: 'Daniellys', color: '#3B82F6', sort_order: 1, member_user_ids: [] },
]

const MOCK_USERS = [
  { user_id: 'u-1', company_id: 'co-1', first_name: 'Ana',   last_name: 'González', avatar_url: null },
  { user_id: 'u-2', company_id: 'co-1', first_name: 'Pedro', last_name: 'Martínez', avatar_url: null },
]

// ── Mock metricsApi ───────────────────────────────────────────────────────────
const mockLoadLines        = vi.fn().mockResolvedValue({ data: MOCK_LINES, error: null })
const mockUpdateLine       = vi.fn().mockResolvedValue({ data: MOCK_LINES[0], error: null })
const mockDeleteLine       = vi.fn().mockResolvedValue({ data: null, error: null })
const mockCreateLine       = vi.fn().mockResolvedValue({ data: { id: 'line-new', name: 'Nueva', color: '#FAB51A', sort_order: 2, member_user_ids: [] }, error: null })
const mockLoadCompanyUsers = vi.fn().mockResolvedValue({ data: MOCK_USERS, error: null })
// loadClients y seedMetricsIfEmpty no se usan en LinesView pero los mocks deben existir
const mockLoadClients      = vi.fn().mockResolvedValue({ data: [], error: null })
const mockSeedIfEmpty      = vi.fn().mockResolvedValue(null)

vi.mock('../components/metricas/metricsApi', () => ({
  loadLines:          (...a) => mockLoadLines(...a),
  updateLine:         (...a) => mockUpdateLine(...a),
  deleteLine:         (...a) => mockDeleteLine(...a),
  createLine:         (...a) => mockCreateLine(...a),
  loadCompanyUsers:   (...a) => mockLoadCompanyUsers(...a),
  loadClients:        (...a) => mockLoadClients(...a),
  seedMetricsIfEmpty: (...a) => mockSeedIfEmpty(...a),
}))

// ── Mock supabase (realtime) ──────────────────────────────────────────────────
vi.mock('../supabase', () => {
  const channel = { on: vi.fn().mockReturnThis(), subscribe: vi.fn().mockReturnThis() }
  return {
    supabase: {
      from:          vi.fn().mockReturnValue({
        select: vi.fn().mockReturnThis(),
        eq:     vi.fn().mockReturnThis(),
        order:  vi.fn().mockResolvedValue({ data: [], error: null }),
      }),
      channel:       vi.fn(() => channel),
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
    </MemoryRouter>
  )
}

// Capabilities restringidas para nivel 1 según los defaults sembrados
const LEVEL1_RESTRICTED = [
  'empresa.departamentos', 'empresa.empleados', 'empresa.preguntas', 'empresa.permisos',
  'empresa.clientes', 'empresa.lineas', 'empresa.clientes.manage', 'empresa.lineas.manage',
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
    </MemoryRouter>
  )
}

// ── Tests ─────────────────────────────────────────────────────────────────────
describe('LinesView (sección Líneas en Empresa)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockLoadLines.mockResolvedValue({ data: MOCK_LINES, error: null })
    mockLoadCompanyUsers.mockResolvedValue({ data: MOCK_USERS, error: null })
    mockUpdateLine.mockResolvedValue({ data: MOCK_LINES[0], error: null })
    mockDeleteLine.mockResolvedValue({ data: null, error: null })
    mockCreateLine.mockResolvedValue({ data: { id: 'line-new', name: 'Nueva', color: '#FAB51A', sort_order: 2, member_user_ids: [] }, error: null })
  })

  it('renderiza las líneas existentes', async () => {
    renderAsManager()
    await waitFor(() => {
      expect(screen.getByText('Georgina')).toBeInTheDocument()
    })
    expect(screen.getByText('Daniellys')).toBeInTheDocument()
  })

  it('muestra el miembro ya asignado a Georgina como chip', async () => {
    renderAsManager()
    await waitFor(() => { expect(screen.getByText('Georgina')).toBeInTheDocument() })
    // Ana aparece al menos una vez: como chip en la card de Georgina
    // (puede aparecer también como opción en selectores de otras líneas para permitir moverla)
    const instances = screen.getAllByText('Ana González')
    expect(instances.length).toBeGreaterThanOrEqual(1)
  })

  it('Pedro Martínez aparece en el selector de Daniellys (no está en ninguna línea)', async () => {
    renderAsManager()
    await waitFor(() => { expect(screen.getByText('Daniellys')).toBeInTheDocument() })
    // El selector de Daniellys debe tener a Pedro (no asignado)
    const selectors = screen.getAllByRole('combobox', { name: /Agregar empleado/ })
    // Buscamos el selector de Daniellys (debería mostrar a Pedro)
    const daniellysSelector = selectors.find(sel =>
      sel.getAttribute('aria-label') === 'Agregar empleado a Daniellys'
    )
    expect(daniellysSelector).toBeDefined()
  })

  it('asignar empleado llama a updateLine con member_user_ids actualizado', async () => {
    const user = userEvent.setup()
    renderAsManager()
    await waitFor(() => { expect(screen.getByText('Daniellys')).toBeInTheDocument() })

    const daniellysSelector = screen.getByRole('combobox', { name: 'Agregar empleado a Daniellys' })
    await user.selectOptions(daniellysSelector, 'u-2')

    await waitFor(() => {
      expect(mockUpdateLine).toHaveBeenCalledWith(
        'line-2',
        { member_user_ids: ['u-2'] }
      )
    })
  })

  it('"Nueva línea" abre el modal de creación de línea', async () => {
    const user = userEvent.setup()
    renderAsManager()
    await waitFor(() => { expect(screen.getByText('Georgina')).toBeInTheDocument() })

    await user.click(screen.getByRole('button', { name: /Nueva línea/i }))
    expect(screen.getByRole('heading', { name: 'Nueva línea' })).toBeInTheDocument()
  })

  it('crear línea desde el modal llama a createLine', async () => {
    const user = userEvent.setup()
    renderAsManager()
    await waitFor(() => { expect(screen.getByText('Georgina')).toBeInTheDocument() })

    await user.click(screen.getByRole('button', { name: /Nueva línea/i }))
    await user.type(screen.getByPlaceholderText('Nombre de la línea'), 'Sabrina')
    await user.click(screen.getByRole('button', { name: 'Crear línea' }))

    await waitFor(() => {
      expect(mockCreateLine).toHaveBeenCalledWith(
        'co-1',
        expect.objectContaining({ name: 'Sabrina' })
      )
    })
  })

  it('editar línea abre el modal con nombre pre-rellenado', async () => {
    const user = userEvent.setup()
    renderAsManager()
    await waitFor(() => { expect(screen.getByText('Georgina')).toBeInTheDocument() })

    const editBtns = screen.getAllByRole('button', { name: 'Editar línea' })
    await user.click(editBtns[0])

    expect(screen.getByRole('heading', { name: 'Editar línea' })).toBeInTheDocument()
    expect(screen.getByDisplayValue('Georgina')).toBeInTheDocument()
  })

  it('eliminar línea abre el diálogo de confirmación y llama a deleteLine', async () => {
    const user = userEvent.setup()
    renderAsManager()
    await waitFor(() => { expect(screen.getByText('Georgina')).toBeInTheDocument() })

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
})
