/**
 * Tests del selector de cliente en TaskModal (ClientPicker — buscador + chips,
 * mismo patrón que Reuniones/CNP, ver ClientPicker.jsx).
 * Verifica que:
 * - El campo Cliente es el buscador de ClientPicker, no un <select>.
 * - Lista (como sugerencias) solo los clientes de la línea seleccionada.
 * - Se puede dejar sin ningún cliente (chips vacíos).
 * - Al cambiar de Team las sugerencias cambian al filtro de la nueva línea.
 */
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi } from 'vitest'
import { createSupabaseMock } from './helpers/supabaseMock'

// ── Datos de prueba ────────────────────────────────────────────────────────────
const MOCK_TEAMS = [
  { id: 'line-1', name: 'Georgina', color: '#FAB51A' },
  { id: 'line-2', name: 'Daniellys', color: '#3B82F6' },
]

const MOCK_CLIENTS = [
  { id: 'c-1', company_id: 'co-1', line_id: 'line-1', name: 'Banco Exterior', logo_url: null },
  { id: 'c-2', company_id: 'co-1', line_id: 'line-1', name: 'Hotel Tamanaco', logo_url: null },
  { id: 'c-3', company_id: 'co-1', line_id: 'line-2', name: 'Pepsi', logo_url: null },
]

const MOCK_USERS = []

// ── Mocks ──────────────────────────────────────────────────────────────────────
vi.mock('../supabase', () => ({
  supabase: createSupabaseMock(),
}))

vi.mock('../context/AuthContext', () => ({
  useAuth: vi.fn(() => ({
    userProfile: { user_id: 'u-1', company_id: 'co-1', access_level: 2, admin: false },
  })),
}))

import TaskModal from '../components/tareas/TaskModal'

function renderModal(overrides = {}) {
  const props = {
    task: null,
    teams: MOCK_TEAMS,
    clients: MOCK_CLIENTS,
    users: MOCK_USERS,
    defaultTeamId: 'line-1',
    onClose: vi.fn(),
    onCreated: vi.fn(),
    onUpdated: vi.fn(),
    ...overrides,
  }
  return render(<TaskModal {...props} />)
}

// ── Tests ──────────────────────────────────────────────────────────────────────
describe('TaskModal — selector de cliente (ClientPicker)', () => {
  it('el campo Cliente es el buscador de ClientPicker, no un <select>', () => {
    renderModal()
    expect(screen.getByPlaceholderText('Buscar cliente por nombre…')).toBeInTheDocument()
    expect(screen.getByText('Sin clientes agregados.')).toBeInTheDocument()
  })

  it('lista solo los clientes de la línea por defecto (line-1) como sugerencia', async () => {
    const user = userEvent.setup()
    renderModal()
    await user.type(screen.getByPlaceholderText('Buscar cliente por nombre…'), 'a')
    expect(await screen.findByText('Banco Exterior')).toBeInTheDocument()
    expect(screen.getByText('Hotel Tamanaco')).toBeInTheDocument()
    // Cliente de line-2 no debe sugerirse
    expect(screen.queryByText('Pepsi')).not.toBeInTheDocument()
  })

  it('se puede dejar la tarea sin ningún cliente', () => {
    renderModal()
    expect(screen.getByText('Sin clientes agregados.')).toBeInTheDocument()
  })

  it('al cambiar de Team las sugerencias cambian al filtro de la nueva línea', async () => {
    const user = userEvent.setup()
    renderModal()

    const [teamSelect] = screen.getAllByRole('combobox')
    await user.selectOptions(teamSelect, 'line-2')

    await user.type(screen.getByPlaceholderText('Buscar cliente por nombre…'), 'e')
    await waitFor(() => {
      expect(screen.getByText('Pepsi')).toBeInTheDocument()
    })
    expect(screen.queryByText('Banco Exterior')).not.toBeInTheDocument()
  })

  it('muestra hint cuando la línea no tiene clientes', () => {
    const clientsSinLinea = MOCK_CLIENTS.filter((c) => c.line_id !== 'line-1')
    renderModal({ clients: clientsSinLinea })
    // line-1 no tiene clientes en este subset → hint visible
    expect(screen.getByText(/No hay clientes en esta línea/i)).toBeInTheDocument()
  })

  it('muestra hint de cliente heredado cuando la tarea tiene nombre pero no client_ids', () => {
    const legacyTask = {
      id: 'task-old',
      company_id: 'co-1',
      team_id: 'line-1',
      client_id: null,
      client_ids: [],
      client: 'Pepsi Antiguo',
      description: 'Hacer algo',
      status: 'En proceso',
      assignee_id: null,
      support_id: null,
      request_date: null,
      due_date: null,
      closed_date: null,
      source: null,
      created_by: null,
    }
    renderModal({ task: legacyTask })
    expect(screen.getByText(/Cliente previo/i)).toBeInTheDocument()
    expect(screen.getByText(/Pepsi Antiguo/)).toBeInTheDocument()
  })
})
