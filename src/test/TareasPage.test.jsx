import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { vi } from 'vitest'

// ── Mock supabase ────────────────────────────────────────────────────────────
vi.mock('../supabase', () => {
  const channel = { on: vi.fn().mockReturnThis(), subscribe: vi.fn().mockReturnThis() }
  const mockFrom = vi.fn()

  // Default: return empty arrays
  const makeQuery = (result = []) => ({
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    order: vi.fn().mockResolvedValue({ data: result, error: null }),
  })

  mockFrom.mockImplementation(table => {
    if (table === 'teams') return makeQuery(MOCK_TEAMS)
    if (table === 'team_members') return makeQuery(MOCK_MEMBERS)
    if (table === 'tareas') return makeQuery(MOCK_TAREAS)
    if (table === 'users') return makeQuery(MOCK_USERS)
    return makeQuery([])
  })

  return {
    supabase: {
      from: mockFrom,
      channel: vi.fn(() => channel),
      removeChannel: vi.fn(),
    },
  }
})

// ── Mock AuthContext ──────────────────────────────────────────────────────────
vi.mock('../context/AuthContext', () => ({
  useAuth: vi.fn(),
}))

// ── Test data ────────────────────────────────────────────────────────────────
const MOCK_TEAMS = [
  { id: 'team-1', name: 'Georgina', company_id: 'co-1', created_at: '2026-01-01T00:00:00Z' },
  { id: 'team-2', name: 'Bianca',   company_id: 'co-1', created_at: '2026-01-02T00:00:00Z' },
]
const MOCK_MEMBERS = [
  { id: 'm1', team_id: 'team-1', user_id: 'u1', created_at: '2026-01-01T00:00:00Z' },
]
const MOCK_TAREAS = [
  {
    id: 'ta-1',
    team_id: 'team-1',
    company_id: 'co-1',
    cliente: 'Banco ABC',
    tarea: 'Crear story para instagram',
    estatus: 'En proceso',
    fecha_solicitud: '2026-06-22',
    fecha_entrega: '2099-12-31',
    responsable_id: 'u1',
    apoyo_id: null,
    capturado_por: 'u1',
    created_at: '2026-06-22T10:00:00Z',
  },
]
const MOCK_USERS = [
  { user_id: 'u1', first_name: 'Georgina', last_name: 'Pérez', avatar_url: null, access_level: 2 },
]

import { useAuth } from '../context/AuthContext'
import TareasPage from '../pages/TareasPage'

function renderPage() {
  useAuth.mockReturnValue({
    userProfile: {
      user_id: 'u1',
      company_id: 'co-1',
      access_level: 3,
      admin: false,
      department_id: 1,
      first_name: 'Georgina',
      last_name: 'Pérez',
    },
  })
  return render(
    <MemoryRouter initialEntries={['/tareas']}>
      <TareasPage />
    </MemoryRouter>
  )
}

describe('TareasPage', () => {
  it('renders the page title', async () => {
    renderPage()
    expect(screen.getByText('Gestión de Tareas')).toBeInTheDocument()
  })

  it('renders view tab buttons', async () => {
    renderPage()
    expect(screen.getByRole('button', { name: 'Panorama' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Dashboard' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Base' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Kanban' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Stand-up' })).toBeInTheDocument()
  })

  it('renders team pills after data loads', async () => {
    renderPage()
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Georgina' })).toBeInTheDocument()
    })
    expect(screen.getByRole('button', { name: 'Bianca' })).toBeInTheDocument()
  })

  it('renders the Nueva tarea button', async () => {
    renderPage()
    expect(screen.getByRole('button', { name: /nueva tarea/i })).toBeInTheDocument()
  })

  it('renders the Gestionar teams button', async () => {
    renderPage()
    expect(screen.getByRole('button', { name: /gestionar teams/i })).toBeInTheDocument()
  })
})
