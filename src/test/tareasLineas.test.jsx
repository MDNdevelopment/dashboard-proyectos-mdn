import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { vi } from 'vitest'

// ── Datos de prueba ────────────────────────────────────────────────────────────
const MOCK_LINES = [
  { id: 'line-1', company_id: 'co-1', name: 'Georgina',  color: '#FAB51A', sort_order: 0, member_user_ids: [] },
  { id: 'line-2', company_id: 'co-1', name: 'Daniellys', color: '#3B82F6', sort_order: 1, member_user_ids: [] },
]

const MOCK_TASKS = [
  {
    id: 'task-1', company_id: 'co-1', team_id: 'line-1',
    client: 'Banco Exterior', description: 'Diseñar banner',
    status: 'En proceso', assignee_id: null, support_id: null,
    request_date: '2026-06-01', due_date: '2026-06-30', closed_date: null,
    source: null, created_by: null, created_at: '2026-06-01T00:00:00Z',
  },
]

const MOCK_USERS = [
  { user_id: 'u-1', company_id: 'co-1', first_name: 'Ana', last_name: 'González',
    avatar_url: null, access_level: 1, position: null },
]

// ── Mock metricsApi ────────────────────────────────────────────────────────────
const mockLoadLines   = vi.fn().mockResolvedValue({ data: MOCK_LINES, error: null })
const mockLoadClients = vi.fn().mockResolvedValue({ data: [], error: null })

vi.mock('../components/metricas/metricsApi', () => ({
  loadLines:          (...a) => mockLoadLines(...a),
  loadClients:        (...a) => mockLoadClients(...a),
  updateLine:         vi.fn(),
  deleteLine:         vi.fn(),
  createLine:         vi.fn(),
  loadCompanyUsers:   vi.fn(),
  seedMetricsIfEmpty: vi.fn(),
}))

// ── Mock supabase ──────────────────────────────────────────────────────────────
// tasks y users se cargan directamente con supabase; metric_lines pasa por loadLines
vi.mock('../supabase', () => {
  const makeMockTable = (defaultData) => ({
    select: vi.fn().mockReturnThis(),
    eq:     vi.fn().mockReturnThis(),
    order:  vi.fn().mockResolvedValue({ data: defaultData, error: null }),
  })
  const channelStub = { on: vi.fn().mockReturnThis(), subscribe: vi.fn().mockReturnThis() }
  return {
    supabase: {
      from: vi.fn((table) => {
        if (table === 'tasks') return makeMockTable(MOCK_TASKS)
        if (table === 'users') return makeMockTable(MOCK_USERS)
        return makeMockTable([])
      }),
      channel:       vi.fn(() => channelStub),
      removeChannel: vi.fn(),
    },
  }
})

// ── Mock AuthContext ───────────────────────────────────────────────────────────
vi.mock('../context/AuthContext', () => ({
  useAuth: vi.fn(),
}))

import { useAuth } from '../context/AuthContext'
import TareasPage from '../pages/TareasPage'

function renderPage() {
  useAuth.mockReturnValue({
    userProfile: {
      user_id: 'u-mgr',
      company_id: 'co-1',
      access_level: 2,
      admin: false,
    },
  })
  return render(
    <MemoryRouter>
      <TareasPage />
    </MemoryRouter>
  )
}

// ── Tests ──────────────────────────────────────────────────────────────────────
describe('TareasPage — líneas desde metric_lines', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockLoadLines.mockResolvedValue({ data: MOCK_LINES, error: null })
    mockLoadClients.mockResolvedValue({ data: [], error: null })
  })

  it('llama a loadLines con el company_id del usuario', async () => {
    renderPage()
    await waitFor(() => {
      expect(mockLoadLines).toHaveBeenCalledWith('co-1')
    })
  })

  it('renderiza los chips de las líneas cargadas', async () => {
    renderPage()
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Georgina' })).toBeInTheDocument()
    })
    expect(screen.getByRole('button', { name: 'Daniellys' })).toBeInTheDocument()
  })

  it('no muestra el botón "Gestionar teams"', async () => {
    renderPage()
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Georgina' })).toBeInTheDocument()
    })
    expect(screen.queryByRole('button', { name: /gestionar teams/i })).not.toBeInTheDocument()
  })

  it('no muestra el modal de gestión de teams', async () => {
    renderPage()
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Georgina' })).toBeInTheDocument()
    })
    expect(screen.queryByRole('heading', { name: /gestión de teams/i })).not.toBeInTheDocument()
  })

  it('muestra el estado vacío con mensaje de Empresa → Líneas cuando no hay líneas', async () => {
    mockLoadLines.mockResolvedValue({ data: [], error: null })
    renderPage()
    await waitFor(() => {
      expect(screen.getByText('No hay líneas creadas')).toBeInTheDocument()
    })
    expect(screen.getByText(/Empresa → Líneas/)).toBeInTheDocument()
    // No hay botón de "Crear primer team" en el estado vacío
    expect(screen.queryByRole('button', { name: /crear primer team/i })).not.toBeInTheDocument()
  })
})
