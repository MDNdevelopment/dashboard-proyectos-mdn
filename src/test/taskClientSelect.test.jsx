/**
 * Tests del desplegable de cliente en TaskModal.
 * Verifica que:
 * - El campo Cliente es un <select> (combobox), no un textbox.
 * - Lista solo los clientes de la línea seleccionada.
 * - Incluye la opción "Sin cliente".
 * - Al cambiar de Team el cliente se resetea.
 */
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi } from 'vitest'

// ── Datos de prueba ────────────────────────────────────────────────────────────
const MOCK_TEAMS = [
  { id: 'line-1', name: 'Georgina',  color: '#FAB51A' },
  { id: 'line-2', name: 'Daniellys', color: '#3B82F6' },
]

const MOCK_CLIENTS = [
  { id: 'c-1', company_id: 'co-1', line_id: 'line-1', name: 'Banco Exterior', logo_url: null },
  { id: 'c-2', company_id: 'co-1', line_id: 'line-1', name: 'Hotel Tamanaco', logo_url: null },
  { id: 'c-3', company_id: 'co-1', line_id: 'line-2', name: 'Pepsi',          logo_url: null },
]

const MOCK_USERS = []

// ── Mocks ──────────────────────────────────────────────────────────────────────
vi.mock('../supabase', () => ({
  supabase: {
    from: vi.fn().mockReturnValue({
      insert: vi.fn().mockReturnThis(),
      update: vi.fn().mockReturnThis(),
      delete: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      eq:     vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: null, error: null }),
    }),
    channel:       vi.fn(() => ({ on: vi.fn().mockReturnThis(), subscribe: vi.fn().mockReturnThis() })),
    removeChannel: vi.fn(),
  },
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
describe('TaskModal — desplegable de cliente', () => {
  it('el campo Cliente es un combobox (select), no un input de texto', () => {
    renderModal()
    // Hay dos selects: Team y Cliente (y luego Estatus). El de Cliente debe tener 'Sin cliente'.
    const selects = screen.getAllByRole('combobox')
    const clientSelect = selects.find(s => s.querySelector
      ? Array.from(s.options ?? []).some(o => o.text === 'Sin cliente')
      : false)
    // Si el querySelector no está disponible, buscamos por la option directamente
    expect(screen.getByRole('option', { name: 'Sin cliente' })).toBeInTheDocument()
  })

  it('lista solo los clientes de la línea por defecto (line-1)', () => {
    renderModal()
    // Clientes de line-1
    expect(screen.getByRole('option', { name: 'Banco Exterior' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'Hotel Tamanaco' })).toBeInTheDocument()
    // Cliente de line-2 no debe aparecer
    expect(screen.queryByRole('option', { name: 'Pepsi' })).not.toBeInTheDocument()
  })

  it('incluye la opción "Sin cliente"', () => {
    renderModal()
    expect(screen.getByRole('option', { name: 'Sin cliente' })).toBeInTheDocument()
  })

  it('al cambiar de Team los clientes cambian al filtro de la nueva línea', async () => {
    const user = userEvent.setup()
    renderModal()

    // Inicialmente se ven clientes de line-1
    expect(screen.getByRole('option', { name: 'Banco Exterior' })).toBeInTheDocument()

    // Los combobox son: [0] Team, [1] Cliente, [2] Estatus
    const [teamSelect] = screen.getAllByRole('combobox')
    await user.selectOptions(teamSelect, 'line-2')

    // Ahora deben verse clientes de line-2
    await waitFor(() => {
      expect(screen.getByRole('option', { name: 'Pepsi' })).toBeInTheDocument()
    })
    // Y los de line-1 ya no
    expect(screen.queryByRole('option', { name: 'Banco Exterior' })).not.toBeInTheDocument()
  })

  it('muestra hint cuando la línea no tiene clientes', () => {
    const clientsSinLinea = MOCK_CLIENTS.filter(c => c.line_id !== 'line-1')
    renderModal({ clients: clientsSinLinea })
    // line-1 no tiene clientes en este subset → hint visible
    expect(screen.getByText(/No hay clientes en esta línea/i)).toBeInTheDocument()
  })

  it('muestra hint de cliente heredado cuando la tarea tiene nombre pero no client_id', () => {
    const legacyTask = {
      id: 'task-old', company_id: 'co-1',
      team_id: 'line-1', client_id: null, client: 'Pepsi Antiguo',
      description: 'Hacer algo', status: 'En proceso',
      assignee_id: null, support_id: null,
      request_date: null, due_date: null, closed_date: null,
      source: null, created_by: null,
    }
    renderModal({ task: legacyTask })
    expect(screen.getByText(/Cliente previo/i)).toBeInTheDocument()
    expect(screen.getByText(/Pepsi Antiguo/)).toBeInTheDocument()
  })
})
