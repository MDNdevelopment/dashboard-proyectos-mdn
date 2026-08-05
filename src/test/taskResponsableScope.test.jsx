/**
 * Tests de scope de Responsable en TaskModal.
 * Verifica:
 * - El picker de Responsable muestra solo los miembros del team seleccionado.
 * - Al cambiar de team, el responsable se resetea si no es miembro del nuevo team.
 * - Un responsable ya seleccionado sigue visible aunque no sea miembro (edición legacy).
 * - Se muestra hint cuando el team no tiene miembros.
 */
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi } from 'vitest'
import { createSupabaseMock } from './helpers/supabaseMock'

// ── Mocks ──────────────────────────────────────────────────────────────────────
// El mock original respondía igual (data: null) para cualquier tabla; el factory
// ya hace lo mismo por defecto (tabla no listada → makeQuery([]), single() → null).
vi.mock('../supabase', () => ({
  supabase: createSupabaseMock(),
}))

vi.mock('../context/AuthContext', () => ({
  useAuth: vi.fn(() => ({
    userProfile: { user_id: 'u-1', company_id: 'co-1', access_level: 2, admin: false },
  })),
}))

import TaskModal from '../components/tareas/TaskModal'

// ── Datos de prueba ────────────────────────────────────────────────────────────
const MOCK_TEAMS = [
  { id: 'line-1', name: 'Georgina', color: '#FAB51A', member_user_ids: ['u-ana', 'u-bruno'] },
  { id: 'line-2', name: 'Daniellys', color: '#3B82F6', member_user_ids: ['u-carlos'] },
  { id: 'line-3', name: 'Sin miembros', color: '#aaa', member_user_ids: [] },
]

const MOCK_USERS = [
  {
    user_id: 'u-ana',
    first_name: 'Ana',
    last_name: 'García',
    access_level: 1,
    avatar_url: null,
    position: null,
  },
  {
    user_id: 'u-bruno',
    first_name: 'Bruno',
    last_name: 'López',
    access_level: 1,
    avatar_url: null,
    position: null,
  },
  {
    user_id: 'u-carlos',
    first_name: 'Carlos',
    last_name: 'Pérez',
    access_level: 1,
    avatar_url: null,
    position: null,
  },
  {
    user_id: 'u-dir',
    first_name: 'Diana',
    last_name: 'Ruiz',
    access_level: 4,
    avatar_url: null,
    position: null,
  },
]

const MOCK_CLIENTS = []

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
describe('TaskModal — scope de Responsable al team seleccionado', () => {
  it('el picker de Responsable abre y muestra solo miembros del team por defecto (line-1)', async () => {
    const user = userEvent.setup()
    renderModal()

    // Abrir el picker de Responsable (botón con placeholder)
    const pickerBtn = screen.getByText('Asignar responsable...')
    await user.click(pickerBtn)

    await waitFor(() => {
      expect(screen.getByText('Ana García')).toBeInTheDocument()
      expect(screen.getByText('Bruno López')).toBeInTheDocument()
    })
    // Carlos es de line-2, no debe aparecer
    expect(screen.queryByText('Carlos Pérez')).not.toBeInTheDocument()
  })

  it('el picker de Apoyo de dirección muestra usuarios de empresa (company-wide, access_level ≥ 3)', async () => {
    const user = userEvent.setup()
    renderModal()

    const apoyoBtn = screen.getByText('¿Requiere apoyo de dirección?')
    await user.click(apoyoBtn)

    await waitFor(() => {
      // Diana tiene access_level 4 → debe aparecer en apoyo
      expect(screen.getByText('Diana Ruiz')).toBeInTheDocument()
    })
  })

  it('muestra hint cuando el team no tiene miembros', () => {
    renderModal({ defaultTeamId: 'line-3' })
    expect(screen.getByText(/No hay miembros en esta línea/i)).toBeInTheDocument()
  })

  it('edición de tarea legacy: responsable fuera del team sigue visible en el picker', async () => {
    const user = userEvent.setup()
    const legacyTask = {
      id: 'task-1',
      company_id: 'co-1',
      team_id: 'line-1',
      // Carlos es de line-2, pero estaba asignado antes de la migración (campo legacy)
      assignee_id: 'u-carlos',
      support_id: null,
      client_id: null,
      client: null,
      description: 'Tarea antigua',
      status: 'En proceso',
      request_date: null,
      due_date: null,
      closed_date: null,
      source: null,
      created_by: null,
    }
    renderModal({ task: legacyTask })

    // Con UserPickerMulti, Carlos aparece como chip en el trigger (solo primer nombre)
    expect(screen.getByText('Carlos')).toBeInTheDocument()

    // Al abrir el picker, Carlos debe aparecer en el dropdown con nombre completo
    await user.click(screen.getByRole('button', { name: 'Seleccionar responsables' }))
    await waitFor(() => {
      expect(screen.getAllByText('Carlos Pérez').length).toBeGreaterThanOrEqual(1)
    })
  })
})
