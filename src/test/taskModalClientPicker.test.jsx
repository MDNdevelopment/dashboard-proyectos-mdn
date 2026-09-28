/**
 * Verifica el selector de "Cliente" en TaskModal (ClientPicker — buscador + chips):
 * - Con una línea normal, solo se sugieren los clientes de esa línea (line_id).
 * - Con el grupo "Independientes" (is_general), no hay línea que acote, así que se
 *   sugieren TODOS los clientes de la empresa.
 */
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi } from 'vitest'
import { createSupabaseMock } from './helpers/supabaseMock'

const MOCK_TEAMS = [
  { id: 'line-1', name: 'Georgina', color: '#FAB51A', member_user_ids: [] },
  { id: 'line-2', name: 'Daniellys', color: '#3B82F6', member_user_ids: [] },
  {
    id: 'line-general',
    name: 'Independientes',
    color: '#9CA3AF',
    is_general: true,
    member_user_ids: [],
  },
]

const MOCK_CLIENTS = [
  { id: 'client-1', line_id: 'line-1', name: 'Banco Exterior' },
  { id: 'client-2', line_id: 'line-2', name: 'Farmacia Salud' },
]

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
    users: [],
    defaultTeamId: null,
    onClose: vi.fn(),
    onCreated: vi.fn(),
    onUpdated: vi.fn(),
    ...overrides,
  }
  return render(<TaskModal {...props} />)
}

// El <select> de Team no tiene <label htmlFor>, así que se ubica por orden: es el
// primer combobox del formulario.
function teamSelectEl() {
  return screen.getAllByRole('combobox')[0]
}

function clientSearchEl() {
  return screen.getByPlaceholderText('Buscar cliente por nombre…')
}

describe('TaskModal — selector de Cliente (ClientPicker)', () => {
  it('con una línea normal solo sugiere los clientes de esa línea', async () => {
    const user = userEvent.setup()
    renderModal()
    await user.selectOptions(teamSelectEl(), 'line-1')
    await user.type(clientSearchEl(), 'a')

    expect(await screen.findByText('Banco Exterior')).toBeInTheDocument()
    expect(screen.queryByText('Farmacia Salud')).not.toBeInTheDocument()
  })

  it('con "Independientes" sugiere todos los clientes de la empresa', async () => {
    const user = userEvent.setup()
    renderModal()
    await user.selectOptions(teamSelectEl(), 'line-general')
    await user.type(clientSearchEl(), 'a')

    expect(await screen.findByText('Banco Exterior')).toBeInTheDocument()
    expect(screen.getByText('Farmacia Salud')).toBeInTheDocument()
  })

  it('al cambiar de "Independientes" a una línea normal, vuelve a acotar por línea', async () => {
    const user = userEvent.setup()
    renderModal()

    await user.selectOptions(teamSelectEl(), 'line-general')
    await user.type(clientSearchEl(), 'a')
    expect(await screen.findByText('Farmacia Salud')).toBeInTheDocument()

    await user.selectOptions(teamSelectEl(), 'line-1')
    await user.clear(clientSearchEl())
    await user.type(clientSearchEl(), 'a')
    expect(await screen.findByText('Banco Exterior')).toBeInTheDocument()
    expect(screen.queryByText('Farmacia Salud')).not.toBeInTheDocument()
  })
})
