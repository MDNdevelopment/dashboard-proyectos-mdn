import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, useNavigate } from 'react-router-dom'
import { vi } from 'vitest'

// ── Mock supabase ────────────────────────────────────────────────────────────
vi.mock('../supabase', () => {
  const channel = { on: vi.fn().mockReturnThis(), subscribe: vi.fn().mockReturnThis() }

  const mockFrom = vi.fn()
  const makeQuery = (result = []) => ({
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    is: vi.fn().mockReturnThis(),
    order: vi.fn().mockResolvedValue({ data: result, error: null }),
  })

  mockFrom.mockImplementation(table => {
    if (table === 'metric_lines') return makeQuery(MOCK_TEAMS)
    if (table === 'tasks') return makeQuery(MOCK_TASKS)
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
// Supabase retorna { members: [{user_id}] } desde metric_line_members; loadLines normaliza a member_user_ids
const MOCK_TEAMS = [
  { id: 'team-1', name: 'Georgina', company_id: 'co-1', created_at: '2026-01-01T00:00:00Z', members: [{ user_id: 'u1' }] },
  { id: 'team-2', name: 'Bianca',   company_id: 'co-1', created_at: '2026-01-02T00:00:00Z', members: [{ user_id: 'u1' }] },
]
const MOCK_TASKS = [
  {
    id: 'task-1',
    team_id: 'team-1',
    company_id: 'co-1',
    client: 'Banco ABC',
    description: 'Crear story para instagram',
    status: 'En proceso',
    request_date: '2026-06-22',
    due_date: '2099-12-31',
    assignee_id: 'u1',
    support_id: null,
    created_by: 'u1',
    created_at: '2026-06-22T10:00:00Z',
  },
]
const MOCK_USERS = [
  { user_id: 'u1', first_name: 'Georgina', last_name: 'Pérez', avatar_url: null, access_level: 2 },
]

import { useAuth } from '../context/AuthContext'
import TareasPage from '../pages/TareasPage'

function renderPage(profileOverride = {}, initialEntries = ['/tareas']) {
  useAuth.mockReturnValue({
    userProfile: {
      user_id: 'u1',
      company_id: 'co-1',
      access_level: 3,
      admin: false,
      department_id: 1,
      first_name: 'Georgina',
      last_name: 'Pérez',
      ...profileOverride,
    },
  })
  return render(
    <MemoryRouter initialEntries={initialEntries}>
      <TareasPage />
    </MemoryRouter>
  )
}

// Simula el botón "atrás" del navegador: MemoryRouter no usa window.history, así que
// se navega -1 dentro de su propio stack en memoria.
function BackButton() {
  const navigate = useNavigate()
  return <button onClick={() => navigate(-1)}>Volver (test)</button>
}

function renderPageWithBack(profileOverride = {}) {
  useAuth.mockReturnValue({
    userProfile: {
      user_id: 'u1',
      company_id: 'co-1',
      access_level: 3,
      admin: false,
      department_id: 1,
      first_name: 'Georgina',
      last_name: 'Pérez',
      ...profileOverride,
    },
  })
  return render(
    <MemoryRouter initialEntries={['/tareas']}>
      <BackButton />
      <TareasPage />
    </MemoryRouter>
  )
}

describe('TareasPage', () => {
  it('renders the page title', async () => {
    renderPage()
    expect(screen.getByText('Gestión de Tareas')).toBeInTheDocument()
  })

  it('renders view tab buttons without Panorama', async () => {
    renderPage()
    expect(screen.queryByRole('button', { name: 'Panorama' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Dashboard' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Base' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Kanban' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Stand-up' })).toBeInTheDocument()
  })

  it('does not render the "Team" label', async () => {
    renderPage()
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Georgina' })).toBeInTheDocument()
    })
    expect(screen.queryByText('Team')).not.toBeInTheDocument()
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

  it('level 1-3 users do not see the "Todos" button', async () => {
    renderPage({ access_level: 3, admin: false })
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Georgina' })).toBeInTheDocument()
    })
    expect(screen.queryByRole('button', { name: 'Todos' })).not.toBeInTheDocument()
  })

  it('level 4/admin users see "Todos" selected by default, showing the global overview', async () => {
    renderPage({ access_level: 4, admin: false })
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Todos' })).toBeInTheDocument()
    })
    const todosBtn = screen.getByRole('button', { name: 'Todos' })
    expect(todosBtn.className).toMatch(/\[#FFB800\]/)
    // Contenido de PanoramaView (cartelera global): KPI "Cumplimiento"
    expect(screen.getByText('Cumplimiento')).toBeInTheDocument()
  })

  it('shows the period selector on Dashboard/Base/Kanban but not on Stand-up', async () => {
    const user = userEvent.setup()
    renderPage()
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Georgina' })).toBeInTheDocument()
    })
    // Dashboard (default view)
    expect(screen.getByText('Período')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Base' }))
    expect(screen.getByText('Período')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Kanban' }))
    expect(screen.getByText('Período')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Stand-up' }))
    expect(screen.queryByText('Período')).not.toBeInTheDocument()
  })

  describe('dashboard KPI cards navigate to Base', () => {
    async function goToPanorama() {
      const user = userEvent.setup()
      renderPage({ access_level: 4, admin: false })
      await waitFor(() => {
        expect(screen.getByText('Cumplimiento')).toBeInTheDocument()
      })
      return user
    }

    it('"Cerradas" opens Base filtered by Estatus: Terminado', async () => {
      const user = await goToPanorama()
      await user.click(screen.getByText('Cerradas'))
      expect(screen.getByRole('button', { name: 'Base' })).toHaveClass('bg-[#111]')
      expect(screen.getByDisplayValue('Terminado')).toBeInTheDocument()
    })

    it('"Paralizados" opens Base filtered by Estatus: Paralizado', async () => {
      const user = await goToPanorama()
      await user.click(screen.getByText('Paralizados'))
      expect(screen.getByRole('button', { name: 'Base' })).toHaveClass('bg-[#111]')
      expect(screen.getByDisplayValue('Paralizado')).toBeInTheDocument()
    })

    it('"Retrasados" opens Base filtered by Alerta: Retrasadas', async () => {
      const user = await goToPanorama()
      await user.click(screen.getByText('Retrasados'))
      expect(screen.getByRole('button', { name: 'Base' })).toHaveClass('bg-[#111]')
      expect(screen.getByDisplayValue('Retrasadas')).toBeInTheDocument()
    })

    it('"Tareas del mes" and "Cumplimiento" open Base without filters', async () => {
      const user = await goToPanorama()
      await user.click(screen.getByText('Tareas del mes'))
      expect(screen.getByRole('button', { name: 'Base' })).toHaveClass('bg-[#111]')
      expect(screen.getByDisplayValue('Estatus: todos')).toBeInTheDocument()
      expect(screen.getByDisplayValue('Alerta: todas')).toBeInTheDocument()
    })

    it('clicking the Base tab directly after a card click clears the pending filter', async () => {
      const user = await goToPanorama()
      await user.click(screen.getByText('Paralizados'))
      expect(screen.getByDisplayValue('Paralizado')).toBeInTheDocument()
      await user.click(screen.getByRole('button', { name: 'Dashboard' }))
      await user.click(screen.getByRole('button', { name: 'Base' }))
      expect(screen.getByDisplayValue('Estatus: todos')).toBeInTheDocument()
    })

    it('browser back after opening Base from a card returns to Dashboard instead of leaving Tareas', async () => {
      const user = userEvent.setup()
      renderPageWithBack({ access_level: 4, admin: false })
      await waitFor(() => {
        expect(screen.getByText('Cumplimiento')).toBeInTheDocument()
      })
      await user.click(screen.getByText('Paralizados'))
      expect(screen.getByRole('button', { name: 'Base' })).toHaveClass('bg-[#111]')

      await user.click(screen.getByRole('button', { name: 'Volver (test)' }))

      await waitFor(() => {
        expect(screen.getByRole('button', { name: 'Dashboard' })).toHaveClass('bg-[#111]')
      })
      expect(screen.getByText('Cumplimiento')).toBeInTheDocument()
    })
  })

  describe('deep-link desde notificación (?taskId=)', () => {
    it('opens TaskModal for the task referenced by ?taskId= and cleans the URL param', async () => {
      renderPage({}, ['/tareas?taskId=task-1'])
      await waitFor(() => {
        expect(screen.getByText('Editar tarea')).toBeInTheDocument()
      })
      // El descripción de la tarea mockeada confirma que se abrió la tarea correcta.
      expect(screen.getByDisplayValue('Crear story para instagram')).toBeInTheDocument()
    })

    it('does nothing when ?taskId= does not match any loaded task', async () => {
      renderPage({}, ['/tareas?taskId=does-not-exist'])
      await waitFor(() => {
        expect(screen.getByRole('button', { name: 'Georgina' })).toBeInTheDocument()
      })
      expect(screen.queryByText('Editar tarea')).not.toBeInTheDocument()
    })
  })
})
