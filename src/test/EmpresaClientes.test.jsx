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
  { id: 'cli-1', company_id: 'co-1', line_id: 'line-1', name: 'ALSA',     created_at: '2026-01-01', website: null, payment_day: null, social_links: [] },
  { id: 'cli-2', company_id: 'co-1', line_id: 'line-1', name: 'Da Vinci', created_at: '2026-01-02', website: null, payment_day: 5,    social_links: [] },
  { id: 'cli-3', company_id: 'co-1', line_id: null,      name: 'Maxxis',   created_at: '2026-01-03', website: null, payment_day: null, social_links: [] },
]

// ── Mock metricsApi ───────────────────────────────────────────────────────────
const mockLoadLines       = vi.fn().mockResolvedValue({ data: MOCK_LINES, error: null })
const mockLoadClients     = vi.fn().mockResolvedValue({ data: MOCK_CLIENTS, error: null })
const mockCreateClient    = vi.fn().mockResolvedValue({ data: { id: 'cli-new', company_id: 'co-1', name: 'Nuevo', line_id: null, website: null, payment_day: null, social_links: [] }, error: null })
const mockUpdateClient    = vi.fn().mockResolvedValue({ data: { id: 'cli-1', company_id: 'co-1', name: 'ALSA Editado', line_id: null, website: null, payment_day: null, social_links: [] }, error: null })
const mockDeleteClient    = vi.fn().mockResolvedValue({ data: null, error: null })
const mockSeedIfEmpty     = vi.fn().mockResolvedValue(null)

vi.mock('../components/metricas/metricsApi', () => ({
  loadLines:          (...a) => mockLoadLines(...a),
  loadClients:        (...a) => mockLoadClients(...a),
  createClient:       (...a) => mockCreateClient(...a),
  updateClient:       (...a) => mockUpdateClient(...a),
  deleteClient:       (...a) => mockDeleteClient(...a),
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

// ── Helpers ───────────────────────────────────────────────────────────────────
// Capabilities restringidas para nivel 1 según los defaults sembrados
const LEVEL1_RESTRICTED = [
  'empresa.departamentos', 'empresa.empleados', 'empresa.preguntas', 'empresa.permisos',
  'empresa.clientes', 'empresa.lineas', 'empresa.clientes.manage', 'empresa.lineas.manage',
]

function renderAsManager(path = '/empresa/clientes') {
  useAuth.mockReturnValue({
    userProfile: {
      user_id: 'u-mgr',
      company_id: 'co-1',
      access_level: 2,
      admin: false,
    },
  })
  return render(
    <MemoryRouter initialEntries={[path]}>
      <EmpresaPage />
    </MemoryRouter>
  )
}

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
describe('ClientsView (sección Clientes en Empresa) — lista plana', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockLoadLines.mockResolvedValue({ data: MOCK_LINES, error: null })
    mockLoadClients.mockResolvedValue({ data: MOCK_CLIENTS, error: null })
    mockCreateClient.mockResolvedValue({ data: { id: 'cli-new', company_id: 'co-1', name: 'Nuevo', line_id: null, website: null, payment_day: null, social_links: [] }, error: null })
    mockUpdateClient.mockResolvedValue({ data: { id: 'cli-1', company_id: 'co-1', name: 'ALSA Editado', line_id: null, website: null, payment_day: null, social_links: [] }, error: null })
    mockDeleteClient.mockResolvedValue({ data: null, error: null })
  })

  it('muestra todos los clientes de la empresa (lista plana)', async () => {
    renderAsManager()
    await waitFor(() => {
      expect(screen.getByText('ALSA')).toBeInTheDocument()
    })
    expect(screen.getByText('Da Vinci')).toBeInTheDocument()
    expect(screen.getByText('Maxxis')).toBeInTheDocument()
  })

  it('muestra chips de línea para clientes asignados y "Sin línea" para los no asignados', async () => {
    renderAsManager()
    await waitFor(() => { expect(screen.getByText('ALSA')).toBeInTheDocument() })
    // Al menos un chip "Georgina" (los dos clientes de line-1)
    const chipsGeorgina = screen.getAllByText('Georgina')
    expect(chipsGeorgina.length).toBeGreaterThanOrEqual(1)
    // El cliente sin línea muestra "Sin línea"
    expect(screen.getByText('Sin línea')).toBeInTheDocument()
  })

  it('llama a seedMetricsIfEmpty al montar', async () => {
    renderAsManager()
    await waitFor(() => { expect(mockSeedIfEmpty).toHaveBeenCalledWith('co-1') })
  })

  it('los filtros por línea reducen la lista visible', async () => {
    renderAsManager()
    await waitFor(() => { expect(screen.getByText('ALSA')).toBeInTheDocument() })

    // Filtrar por "Sin línea"
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
      expect(mockCreateClient).toHaveBeenCalledWith(
        'co-1',
        expect.objectContaining({ name: 'Nuevo Cliente' })
      )
    })
  })

  it('editar cliente abre el modal pre-rellenado y llama a updateClient', async () => {
    const user = userEvent.setup()
    renderAsManager()
    await waitFor(() => { expect(screen.getByText('ALSA')).toBeInTheDocument() })

    // Hacer clic en el botón "Editar" del primer cliente (ALSA)
    const editBtns = screen.getAllByRole('button', { name: 'Editar' })
    await user.click(editBtns[0])

    // Modal abre con el título de edición
    expect(screen.getByRole('heading', { name: 'Editar cliente' })).toBeInTheDocument()

    // El campo nombre debe estar pre-rellenado con el nombre del cliente
    const nameInput = screen.getByDisplayValue('ALSA')
    await user.clear(nameInput)
    await user.type(nameInput, 'ALSA Editado')
    await user.click(screen.getByRole('button', { name: 'Guardar cambios' }))

    await waitFor(() => {
      expect(mockUpdateClient).toHaveBeenCalledWith(
        'cli-1',
        expect.objectContaining({ name: 'ALSA Editado' })
      )
    })
  })

  it('eliminar abre el diálogo de confirmación y llama a deleteClient', async () => {
    const user = userEvent.setup()
    renderAsManager()
    await waitFor(() => { expect(screen.getByText('ALSA')).toBeInTheDocument() })

    const deleteBtns = screen.getAllByRole('button', { name: 'Eliminar' })
    await user.click(deleteBtns[0])

    // Aparece el diálogo
    expect(screen.getByRole('heading', { name: 'Eliminar cliente' })).toBeInTheDocument()

    // Escribir el nombre para habilitar
    const confirmInput = screen.getByPlaceholderText('ALSA')
    await user.type(confirmInput, 'ALSA')

    // El botón del diálogo es el último "Eliminar" en el DOM
    const allEliminar = screen.getAllByRole('button', { name: 'Eliminar' })
    await user.click(allEliminar[allEliminar.length - 1])

    await waitFor(() => {
      expect(mockDeleteClient).toHaveBeenCalledWith('cli-1')
    })
  })

  it('el tab Clientes no aparece para usuarios sin acceso (access_level=1, no admin)', () => {
    renderAsRegular()
    expect(screen.queryByRole('button', { name: 'Clientes' })).not.toBeInTheDocument()
  })

  it('un manager ve el tab Clientes', async () => {
    renderAsManager()
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Clientes' })).toBeInTheDocument()
    })
  })

  it('un manager ve el tab Líneas', async () => {
    renderAsManager()
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Líneas' })).toBeInTheDocument()
    })
  })
})
