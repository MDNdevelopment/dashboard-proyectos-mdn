import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { vi } from 'vitest'

// ── Datos de prueba ────────────────────────────────────────────────────────────
const USER_ID_MEMBER = 'u-mgr'

const MOCK_LINES = [
  {
    id: 'line-1',
    company_id: 'co-1',
    name: 'Georgina',
    color: '#FAB51A',
    sort_order: 0,
    member_user_ids: [USER_ID_MEMBER],
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

const MOCK_TASKS = [
  {
    id: 'task-1',
    company_id: 'co-1',
    team_id: 'line-1',
    client: 'Banco Exterior',
    description: 'Diseñar banner',
    status: 'En proceso',
    assignee_id: null,
    support_id: null,
    request_date: '2026-06-01',
    due_date: '2026-06-30',
    closed_date: null,
    source: null,
    created_by: null,
    created_at: '2026-06-01T00:00:00Z',
  },
  {
    id: 'task-2',
    company_id: 'co-1',
    team_id: 'line-2',
    client: 'Farmacia Salud',
    description: 'Editar reel',
    status: 'Pendiente',
    assignee_id: null,
    support_id: null,
    request_date: '2026-06-02',
    due_date: '2026-06-28',
    closed_date: null,
    source: null,
    created_by: null,
    created_at: '2026-06-02T00:00:00Z',
  },
]

const MOCK_USERS = [
  {
    user_id: 'u-1',
    company_id: 'co-1',
    first_name: 'Ana',
    last_name: 'González',
    avatar_url: null,
    access_level: 1,
    position: null,
  },
]

// Mutable: algunos tests (grupo "Independientes") reasignan la lista de usuarios
// para simular empleados sin línea. Se resetea a MOCK_USERS en cada beforeEach.
let mockUsersData = MOCK_USERS

// ── Mock metricsApi ────────────────────────────────────────────────────────────
const mockLoadLines = vi.fn().mockResolvedValue({ data: MOCK_LINES, error: null })
const mockLoadClients = vi.fn().mockResolvedValue({ data: [], error: null })

vi.mock('../components/metricas/metricsApi', () => ({
  loadLines: (...a) => mockLoadLines(...a),
  loadClients: (...a) => mockLoadClients(...a),
  updateLine: vi.fn(),
  deleteLine: vi.fn(),
  createLine: vi.fn(),
  loadCompanyUsers: vi.fn(),
  seedMetricsIfEmpty: vi.fn(),
}))

// ── Mock supabase ──────────────────────────────────────────────────────────────
// tasks y users se cargan directamente con supabase; metric_lines pasa por loadLines
vi.mock('../supabase', () => {
  const makeMockTable = (defaultData) => ({
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    order: vi.fn().mockResolvedValue({ data: defaultData, error: null }),
  })
  const channelStub = { on: vi.fn().mockReturnThis(), subscribe: vi.fn().mockReturnThis() }
  return {
    supabase: {
      from: vi.fn((table) => {
        if (table === 'tasks') return makeMockTable(MOCK_TASKS)
        if (table === 'users') return makeMockTable(mockUsersData)
        return makeMockTable([])
      }),
      channel: vi.fn(() => channelStub),
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

/**
 * Renderiza TareasPage con un userProfile configurable.
 * @param {object} profileOverride - Propiedades a sobreescribir en el userProfile base.
 */
function renderPage(profileOverride = {}) {
  useAuth.mockReturnValue({
    userProfile: {
      user_id: USER_ID_MEMBER,
      company_id: 'co-1',
      access_level: 2,
      admin: false,
      ...profileOverride,
    },
  })
  return render(
    <MemoryRouter>
      <TareasPage />
    </MemoryRouter>,
  )
}

// ── Tests ──────────────────────────────────────────────────────────────────────
describe('TareasPage — líneas desde metric_lines', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockLoadLines.mockResolvedValue({ data: MOCK_LINES, error: null })
    mockLoadClients.mockResolvedValue({ data: [], error: null })
    mockUsersData = MOCK_USERS
  })

  it('llama a loadLines con el company_id del usuario, incluyendo la línea general', async () => {
    renderPage()
    await waitFor(() => {
      expect(mockLoadLines).toHaveBeenCalledWith('co-1', {
        includeGeneral: true,
        includeManagement: true,
      })
    })
  })

  // Caso 1 — Nivel 4: ve TODAS las líneas
  it('nivel 4 ve todas las líneas (Georgina y Daniellys)', async () => {
    renderPage({ access_level: 4, user_id: 'u-otro' })
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Georgina' })).toBeInTheDocument()
    })
    expect(screen.getByRole('button', { name: 'Daniellys' })).toBeInTheDocument()
  })

  // Caso 1 — admin=true: ve TODAS las líneas
  it('admin ve todas las líneas (Georgina y Daniellys)', async () => {
    renderPage({ admin: true, access_level: 1, user_id: 'u-otro' })
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Georgina' })).toBeInTheDocument()
    })
    expect(screen.getByRole('button', { name: 'Daniellys' })).toBeInTheDocument()
  })

  // Caso 2 — Nivel 2 miembro de line-1: ve solo Georgina, no Daniellys
  it('nivel 2 miembro de line-1 ve solo Georgina, no Daniellys', async () => {
    // USER_ID_MEMBER está en member_user_ids de line-1 (ver MOCK_LINES)
    renderPage({ access_level: 2, admin: false, user_id: USER_ID_MEMBER })
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Georgina' })).toBeInTheDocument()
    })
    expect(screen.queryByRole('button', { name: 'Daniellys' })).not.toBeInTheDocument()
  })

  // Caso 3 — Nivel 2 sin membresía en ninguna línea: muestra empty state
  it('nivel 2 sin membresía muestra estado vacío "No hay líneas creadas"', async () => {
    renderPage({ access_level: 2, admin: false, user_id: 'u-sin-linea' })
    await waitFor(() => {
      expect(screen.getByText('No hay líneas creadas')).toBeInTheDocument()
    })
    expect(screen.getByText(/Empresa → Líneas/)).toBeInTheDocument()
  })

  // Verificaciones de ausencia de UI legacy (usan nivel 4 para garantizar que haya chips)
  it('no muestra el botón "Gestionar teams"', async () => {
    renderPage({ access_level: 4 })
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Georgina' })).toBeInTheDocument()
    })
    expect(screen.queryByRole('button', { name: /gestionar teams/i })).not.toBeInTheDocument()
  })

  it('no muestra el modal de gestión de teams', async () => {
    renderPage({ access_level: 4 })
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

  // ── Modo "Todos" (nivel 4 / admin) ──────────────────────────────────────────
  describe('modo "Todos"', () => {
    it('Base combina tareas de todas las líneas y el filtro de línea acota', async () => {
      const user = userEvent.setup()
      renderPage({ access_level: 4, admin: false, user_id: 'u-otro' })
      await waitFor(() => {
        expect(screen.getByRole('button', { name: 'Todos' })).toBeInTheDocument()
      })

      await user.click(screen.getByRole('button', { name: 'Base' }))

      // Ambas tareas (de line-1 y line-2) visibles combinadas
      await waitFor(() => {
        expect(screen.getByText('Diseñar banner')).toBeInTheDocument()
      })
      expect(screen.getByText('Editar reel')).toBeInTheDocument()

      // Filtrar por línea acota a una sola
      const lineFilter = screen.getByDisplayValue('Línea: todas')
      await user.selectOptions(lineFilter, 'line-1')

      expect(screen.getByText('Diseñar banner')).toBeInTheDocument()
      expect(screen.queryByText('Editar reel')).not.toBeInTheDocument()
    })
  })

  // ── Grupo "Independientes" (empleados sin línea, is_general) ──────────────────
  describe('grupo "Independientes"', () => {
    const USER_ID_SIN_LINEA = 'u-sin-linea'
    const LINES_WITH_GENERAL = [
      ...MOCK_LINES,
      {
        id: 'line-general',
        company_id: 'co-1',
        name: 'Independientes',
        color: '#9CA3AF',
        sort_order: 9999,
        is_general: true,
        member_user_ids: [],
      },
    ]
    const USERS_WITH_UNASSIGNED = [
      ...MOCK_USERS,
      {
        user_id: USER_ID_SIN_LINEA,
        company_id: 'co-1',
        first_name: 'Iván',
        last_name: 'Tech',
        avatar_url: null,
        access_level: 2,
        position: null,
      },
    ]

    beforeEach(() => {
      mockLoadLines.mockResolvedValue({ data: LINES_WITH_GENERAL, error: null })
    })

    it('admin ve el botón "Independientes"', async () => {
      renderPage({ admin: true, access_level: 1, user_id: 'u-otro' })
      await waitFor(() => {
        expect(screen.getByRole('button', { name: 'Independientes' })).toBeInTheDocument()
      })
    })

    it('un nivel 2 sin línea asignada ve el botón "Independientes" (membresía derivada)', async () => {
      mockUsersData = USERS_WITH_UNASSIGNED
      renderPage({ access_level: 2, admin: false, user_id: USER_ID_SIN_LINEA })
      await waitFor(() => {
        expect(screen.getByRole('button', { name: 'Independientes' })).toBeInTheDocument()
      })
      expect(screen.queryByRole('button', { name: 'Georgina' })).not.toBeInTheDocument()
    })

    it('un nivel 2 que sí pertenece a una línea real NO ve "Independientes"', async () => {
      renderPage({ access_level: 2, admin: false, user_id: USER_ID_MEMBER })
      await waitFor(() => {
        expect(screen.getByRole('button', { name: 'Georgina' })).toBeInTheDocument()
      })
      expect(screen.queryByRole('button', { name: 'Independientes' })).not.toBeInTheDocument()
    })

    it('al elegir "Independientes" no se muestra la pestaña "Dashboard" y entra directo a Base con Responsable visible', async () => {
      const user = userEvent.setup()
      renderPage({ admin: true, access_level: 1, user_id: 'u-otro' })
      await waitFor(() => {
        expect(screen.getByRole('button', { name: 'Independientes' })).toBeInTheDocument()
      })
      // Antes de elegirla, sobre una línea operativa, Dashboard sigue disponible
      expect(screen.getByRole('button', { name: 'Dashboard' })).toBeInTheDocument()

      await user.click(screen.getByRole('button', { name: 'Independientes' }))

      await waitFor(() => {
        expect(screen.queryByRole('button', { name: 'Dashboard' })).not.toBeInTheDocument()
      })
      expect(screen.getByRole('button', { name: 'Base' })).toHaveClass('bg-[#111]')
      expect(screen.getByDisplayValue('Responsable: todos')).toBeInTheDocument()
    })
  })

  // ── Grupo "Alta Gerencia" (dirección sin línea, is_management) ────────────────
  describe('grupo "Alta Gerencia"', () => {
    const LINES_WITH_MANAGEMENT = [
      ...MOCK_LINES,
      {
        id: 'line-general',
        company_id: 'co-1',
        name: 'Independientes',
        color: '#9CA3AF',
        sort_order: 9999,
        is_general: true,
        member_user_ids: [],
      },
      {
        id: 'line-management',
        company_id: 'co-1',
        name: 'Alta Gerencia',
        color: '#6B7280',
        sort_order: 9998,
        is_management: true,
        member_user_ids: [],
      },
    ]

    beforeEach(() => {
      mockLoadLines.mockResolvedValue({ data: LINES_WITH_MANAGEMENT, error: null })
    })

    it('admin ve el botón "Alta Gerencia" y al elegirlo entra directo a Base sin Dashboard', async () => {
      const user = userEvent.setup()
      renderPage({ admin: true, access_level: 1, user_id: 'u-otro' })
      await waitFor(() => {
        expect(screen.getByRole('button', { name: 'Alta Gerencia' })).toBeInTheDocument()
      })

      await user.click(screen.getByRole('button', { name: 'Alta Gerencia' }))

      await waitFor(() => {
        expect(screen.queryByRole('button', { name: 'Dashboard' })).not.toBeInTheDocument()
      })
      expect(screen.getByRole('button', { name: 'Base' })).toHaveClass('bg-[#111]')
    })
  })
})
