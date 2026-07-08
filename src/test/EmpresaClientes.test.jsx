import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { vi } from 'vitest'

// ── Datos de prueba ───────────────────────────────────────────────────────────
const MOCK_LINES = [
  { id: 'line-1', company_id: 'co-1', name: 'Georgina',  color: '#FAB51A', sort_order: 0, member_user_ids: [] },
  { id: 'line-2', company_id: 'co-1', name: 'Daniellys', color: '#3B82F6', sort_order: 1, member_user_ids: [] },
]

const MOCK_CLIENTS = [
  { id: 'cli-1', company_id: 'co-1', line_id: 'line-1', name: 'ALSA',     created_at: '2026-01-01', mdn_since: null, deleted_at: null, website: null, payment_day: null, social_links: [] },
  { id: 'cli-2', company_id: 'co-1', line_id: 'line-1', name: 'Da Vinci', created_at: '2026-01-02', mdn_since: null, deleted_at: null, website: null, payment_day: 5,    social_links: [] },
  { id: 'cli-3', company_id: 'co-1', line_id: null,      name: 'Maxxis',   created_at: '2026-01-03', mdn_since: null, deleted_at: null, website: null, payment_day: null, social_links: [] },
]

// Cliente archivado para tests de soft delete
const ARCHIVED_CLIENT = {
  id: 'cli-arch', company_id: 'co-1', line_id: 'line-1', name: 'Archivado SA',
  created_at: '2026-01-01', mdn_since: null, deleted_at: '2026-06-01T00:00:00Z',
  website: null, payment_day: null, social_links: [],
}

// ── Mock metricsApi ───────────────────────────────────────────────────────────
const MOCK_EMPLOYEES = [
  { user_id: 'emp-1', company_id: 'co-1', first_name: 'Ana',   last_name: 'García',  department_id: 1, avatar_url: null, position: { position_name: 'Social Media Manager' } },
  { user_id: 'emp-2', company_id: 'co-1', first_name: 'Pedro', last_name: 'López',   department_id: 3, avatar_url: null, position: { position_name: 'Diseñador Gráfico' } },
  { user_id: 'emp-3', company_id: 'co-1', first_name: 'Luis',  last_name: 'Martínez',department_id: 2, avatar_url: null, position: { position_name: 'Editor de Video' } },
]

const mockLoadLines            = vi.fn().mockResolvedValue({ data: MOCK_LINES, error: null })
const mockLoadClients          = vi.fn().mockResolvedValue({ data: MOCK_CLIENTS, error: null })
const mockLoadCompanyEmployees = vi.fn().mockResolvedValue({ data: MOCK_EMPLOYEES, error: null })
const mockCreateClient         = vi.fn().mockResolvedValue({ data: { id: 'cli-new', company_id: 'co-1', name: 'Nuevo', line_id: null, website: null, payment_day: null, social_links: [], social_manager_id: null, designer_id: null, audiovisual_ids: [], apoyo_ids: [] }, error: null })
const mockUpdateClient         = vi.fn().mockResolvedValue({ data: { id: 'cli-1', company_id: 'co-1', name: 'ALSA Editado', line_id: null, website: null, payment_day: null, social_links: [], social_manager_id: null, designer_id: null, audiovisual_ids: [], apoyo_ids: [] }, error: null })
const mockDeleteClient         = vi.fn().mockResolvedValue({ data: null, error: null })
const mockRestoreClient        = vi.fn().mockResolvedValue({ data: null, error: null })
const mockSeedIfEmpty          = vi.fn().mockResolvedValue(null)

vi.mock('../components/metricas/metricsApi', () => ({
  loadLines:              (...a) => mockLoadLines(...a),
  loadClients:            (...a) => mockLoadClients(...a),
  loadCompanyEmployees:   (...a) => mockLoadCompanyEmployees(...a),
  createClient:           (...a) => mockCreateClient(...a),
  updateClient:           (...a) => mockUpdateClient(...a),
  deleteClient:           (...a) => mockDeleteClient(...a),
  restoreClient:          (...a) => mockRestoreClient(...a),
  seedMetricsIfEmpty:     (...a) => mockSeedIfEmpty(...a),
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

// ── Capabilities restringidas para nivel 1 ────────────────────────────────────
const LEVEL1_RESTRICTED = [
  'empresa.departamentos', 'empresa.empleados', 'empresa.preguntas', 'empresa.permisos',
  'empresa.clientes', 'empresa.lineas', 'empresa.clientes.manage', 'empresa.lineas.manage',
]

function renderAsManager(path = '/empresa/clientes') {
  useAuth.mockReturnValue({
    userProfile: { user_id: 'u-mgr', company_id: 'co-1', access_level: 2, admin: false },
  })
  return render(
    <MemoryRouter initialEntries={[path]}>
      <EmpresaPage />
    </MemoryRouter>
  )
}

function renderAsRegular() {
  useAuth.mockReturnValue({
    userProfile: { user_id: 'u-reg', company_id: 'co-1', access_level: 1, admin: false },
    can: (key) => !LEVEL1_RESTRICTED.includes(key),
  })
  return render(
    <MemoryRouter initialEntries={['/empresa']}>
      <EmpresaPage />
    </MemoryRouter>
  )
}

// ── Tests ─────────────────────────────────────────────────────────────────────
describe('ClientsView (sección Clientes en Empresa) — lista plana', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockLoadLines.mockResolvedValue({ data: MOCK_LINES, error: null })
    mockLoadClients.mockResolvedValue({ data: MOCK_CLIENTS, error: null })
    mockLoadCompanyEmployees.mockResolvedValue({ data: MOCK_EMPLOYEES, error: null })
    mockCreateClient.mockResolvedValue({ data: { id: 'cli-new', company_id: 'co-1', name: 'Nuevo', line_id: null, website: null, payment_day: null, social_links: [], social_manager_id: null, designer_id: null, audiovisual_ids: [], apoyo_ids: [] }, error: null })
    mockUpdateClient.mockResolvedValue({ data: { id: 'cli-1', company_id: 'co-1', name: 'ALSA Editado', line_id: null, website: null, payment_day: null, social_links: [], social_manager_id: null, designer_id: null, audiovisual_ids: [], apoyo_ids: [] }, error: null })
    mockDeleteClient.mockResolvedValue({ data: null, error: null })
    mockRestoreClient.mockResolvedValue({ data: null, error: null })
  })

  it('muestra todos los clientes activos de la empresa', async () => {
    renderAsManager()
    await waitFor(() => { expect(screen.getByText('ALSA')).toBeInTheDocument() })
    expect(screen.getByText('Da Vinci')).toBeInTheDocument()
    expect(screen.getByText('Maxxis')).toBeInTheDocument()
  })

  it('carga clientes con includeArchived: true', async () => {
    renderAsManager()
    await waitFor(() => { expect(screen.getByText('ALSA')).toBeInTheDocument() })
    expect(mockLoadClients).toHaveBeenCalledWith('co-1', null, { includeArchived: true })
  })

  it('muestra chips de línea para clientes asignados y "Sin línea" para los no asignados', async () => {
    renderAsManager()
    await waitFor(() => { expect(screen.getByText('ALSA')).toBeInTheDocument() })
    const chipsGeorgina = screen.getAllByText('Georgina')
    expect(chipsGeorgina.length).toBeGreaterThanOrEqual(1)
    expect(screen.getByText('Sin línea')).toBeInTheDocument()
  })

  it('llama a seedMetricsIfEmpty al montar', async () => {
    renderAsManager()
    await waitFor(() => { expect(mockSeedIfEmpty).toHaveBeenCalledWith('co-1') })
  })

  it('los filtros por línea reducen la lista visible', async () => {
    renderAsManager()
    await waitFor(() => { expect(screen.getByText('ALSA')).toBeInTheDocument() })
    const sinLineaBtn = screen.getByRole('button', { name: /Sin línea/ })
    await userEvent.click(sinLineaBtn)
    expect(screen.getByText('Maxxis')).toBeInTheDocument()
    expect(screen.queryByText('ALSA')).not.toBeInTheDocument()
  })

  it('"Nuevo cliente" abre el modal de creación', async () => {
    const user = userEvent.setup()
    renderAsManager()
    await waitFor(() => { expect(screen.getByText('ALSA')).toBeInTheDocument() })
    await user.click(screen.getByRole('button', { name: /Nuevo cliente/i }))
    expect(screen.getByRole('heading', { name: 'Nuevo cliente' })).toBeInTheDocument()
  })

  it('crear cliente desde el modal llama a createClient con objeto de campos', async () => {
    const user = userEvent.setup()
    renderAsManager()
    await waitFor(() => { expect(screen.getByText('ALSA')).toBeInTheDocument() })
    await user.click(screen.getByRole('button', { name: /Nuevo cliente/i }))
    await user.type(screen.getByPlaceholderText('Nombre del cliente / marca'), 'Nuevo Cliente')
    await user.click(screen.getByRole('button', { name: 'Crear cliente' }))
    await waitFor(() => {
      expect(mockCreateClient).toHaveBeenCalledWith('co-1', expect.objectContaining({ name: 'Nuevo Cliente' }))
    })
  })

  it('editar cliente abre el modal pre-rellenado y llama a updateClient', async () => {
    const user = userEvent.setup()
    renderAsManager()
    await waitFor(() => { expect(screen.getByText('ALSA')).toBeInTheDocument() })
    const editBtns = screen.getAllByRole('button', { name: 'Editar' })
    await user.click(editBtns[0])
    expect(screen.getByRole('heading', { name: 'Editar cliente' })).toBeInTheDocument()
    const nameInput = screen.getByDisplayValue('ALSA')
    await user.clear(nameInput)
    await user.type(nameInput, 'ALSA Editado')
    await user.click(screen.getByRole('button', { name: 'Guardar cambios' }))
    await waitFor(() => {
      expect(mockUpdateClient).toHaveBeenCalledWith('cli-1', expect.objectContaining({ name: 'ALSA Editado' }))
    })
  })

  it('archivar abre el diálogo de confirmación y llama a deleteClient (soft delete)', async () => {
    const user = userEvent.setup()
    renderAsManager()
    await waitFor(() => { expect(screen.getByText('ALSA')).toBeInTheDocument() })

    const archiveBtns = screen.getAllByRole('button', { name: 'Archivar' })
    await user.click(archiveBtns[0])

    // Aparece el diálogo de confirmación
    expect(screen.getByRole('heading', { name: 'Eliminar cliente' })).toBeInTheDocument()

    const confirmInput = screen.getByPlaceholderText('ALSA')
    await user.type(confirmInput, 'ALSA')

    const allEliminar = screen.getAllByRole('button', { name: 'Eliminar' })
    await user.click(allEliminar[allEliminar.length - 1])

    await waitFor(() => {
      expect(mockDeleteClient).toHaveBeenCalledWith('cli-1')
    })
  })

  it('tras archivar, el cliente desaparece de la lista activa', async () => {
    const user = userEvent.setup()
    renderAsManager()
    await waitFor(() => { expect(screen.getByText('ALSA')).toBeInTheDocument() })

    const archiveBtns = screen.getAllByRole('button', { name: 'Archivar' })
    await user.click(archiveBtns[0])
    const confirmInput = screen.getByPlaceholderText('ALSA')
    await user.type(confirmInput, 'ALSA')
    const allEliminar = screen.getAllByRole('button', { name: 'Eliminar' })
    await user.click(allEliminar[allEliminar.length - 1])

    await waitFor(() => {
      expect(screen.queryByText('ALSA')).not.toBeInTheDocument()
    })
  })

  it('"Ver archivados" muestra clientes con deleted_at y ofrece Restaurar', async () => {
    const user = userEvent.setup()
    // Incluir un cliente archivado en la lista
    mockLoadClients.mockResolvedValue({ data: [...MOCK_CLIENTS, ARCHIVED_CLIENT], error: null })
    renderAsManager()
    await waitFor(() => { expect(screen.getByText('ALSA')).toBeInTheDocument() })

    // El cliente archivado no debe aparecer en modo Actual
    expect(screen.queryByText('Archivado SA')).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /Ver archivados/ }))
    expect(screen.getByText('Archivado SA')).toBeInTheDocument()

    // Debe haber botón Restaurar
    expect(screen.getByRole('button', { name: 'Restaurar' })).toBeInTheDocument()
  })

  it('Restaurar llama a restoreClient y devuelve el cliente a la lista activa', async () => {
    const user = userEvent.setup()
    mockLoadClients.mockResolvedValue({ data: [...MOCK_CLIENTS, ARCHIVED_CLIENT], error: null })
    renderAsManager()
    await waitFor(() => { expect(screen.getByText('ALSA')).toBeInTheDocument() })

    await user.click(screen.getByRole('button', { name: /Ver archivados/ }))
    await user.click(screen.getByRole('button', { name: 'Restaurar' }))

    await waitFor(() => {
      expect(mockRestoreClient).toHaveBeenCalledWith('cli-arch')
    })
  })

  it('el tab Clientes no aparece para usuarios sin acceso (access_level=1, no admin)', () => {
    renderAsRegular()
    expect(screen.queryByRole('button', { name: 'Clientes' })).not.toBeInTheDocument()
  })

  it('un manager ve el tab Clientes', async () => {
    renderAsManager()
    await waitFor(() => { expect(screen.getByRole('button', { name: 'Clientes' })).toBeInTheDocument() })
  })

  it('un manager ve el tab Líneas', async () => {
    renderAsManager()
    await waitFor(() => { expect(screen.getByRole('button', { name: 'Líneas' })).toBeInTheDocument() })
  })

  it('click en una fila de cliente abre el modal en modo lectura', async () => {
    const user = userEvent.setup()
    renderAsManager()
    await waitFor(() => { expect(screen.getByText('ALSA')).toBeInTheDocument() })
    await user.click(screen.getByText('ALSA'))
    expect(screen.getByRole('heading', { name: 'Detalle del cliente' })).toBeInTheDocument()
    expect(screen.getByDisplayValue('ALSA')).toBeDisabled()
  })

  it('botón "Editar" dentro del modal readonly lo convierte en modal editable', async () => {
    const user = userEvent.setup()
    renderAsManager()
    await waitFor(() => { expect(screen.getByText('ALSA')).toBeInTheDocument() })
    await user.click(screen.getByText('ALSA'))
    expect(screen.getByRole('heading', { name: 'Detalle del cliente' })).toBeInTheDocument()
    const editarBtns = screen.getAllByRole('button', { name: 'Editar' })
    await user.click(editarBtns[editarBtns.length - 1])
    expect(screen.getByRole('heading', { name: 'Editar cliente' })).toBeInTheDocument()
    expect(screen.getByDisplayValue('ALSA')).not.toBeDisabled()
    expect(screen.getByRole('button', { name: 'Guardar cambios' })).toBeInTheDocument()
  })

  it('el lápiz de la fila abre directamente en modo edición', async () => {
    const user = userEvent.setup()
    renderAsManager()
    await waitFor(() => { expect(screen.getByText('ALSA')).toBeInTheDocument() })
    const editBtns = screen.getAllByRole('button', { name: 'Editar' })
    await user.click(editBtns[0])
    expect(screen.getByRole('heading', { name: 'Editar cliente' })).toBeInTheDocument()
    expect(screen.getByDisplayValue('ALSA')).not.toBeDisabled()
  })

  it('el payload de crear cliente incluye los campos de equipo', async () => {
    const user = userEvent.setup()
    renderAsManager()
    await waitFor(() => { expect(screen.getByText('ALSA')).toBeInTheDocument() })
    await user.click(screen.getByRole('button', { name: /Nuevo cliente/i }))
    await user.type(screen.getByPlaceholderText('Nombre del cliente / marca'), 'Cliente Test')
    await user.click(screen.getByRole('button', { name: 'Crear cliente' }))
    await waitFor(() => {
      expect(mockCreateClient).toHaveBeenCalledWith('co-1', expect.objectContaining({
        name: 'Cliente Test',
        social_manager_id: null,
        designer_id: null,
        audiovisual_ids: [],
        apoyo_ids: [],
      }))
    })
  })

  it('la sección "Equipo del cliente" muestra los pickers en el modal', async () => {
    const user = userEvent.setup()
    renderAsManager()
    await waitFor(() => { expect(screen.getByText('ALSA')).toBeInTheDocument() })
    await user.click(screen.getByRole('button', { name: /Nuevo cliente/i }))
    expect(screen.getByText('Equipo del cliente')).toBeInTheDocument()
    expect(screen.getByText('Social Asignado')).toBeInTheDocument()
    expect(screen.getByText('Diseñador Asignado')).toBeInTheDocument()
    expect(screen.getByText('Audiovisual')).toBeInTheDocument()
    expect(screen.getByText('Apoyo')).toBeInTheDocument()
  })
})
