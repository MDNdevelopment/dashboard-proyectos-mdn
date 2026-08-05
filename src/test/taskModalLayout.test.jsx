/**
 * Test del orden de secciones en TaskModal.
 * Verifica que:
 * - Las secciones "Actividades" y "Comentarios" aparecen ANTES de la fila de botones
 *   (Eliminar / Cancelar / Guardar cambios) en el DOM.
 * - El botón "Guardar cambios" sigue vinculado al form aunque viva fuera de él
 *   (atributo form="task-form").
 */
import { render, screen } from '@testing-library/react'
import { vi } from 'vitest'
import { createSupabaseMock } from './helpers/supabaseMock'

// ── Datos de prueba ────────────────────────────────────────────────────────────
const MOCK_TEAMS = [{ id: 'line-1', name: 'Georgina', color: '#FAB51A' }]

const MOCK_CLIENTS = []

const MOCK_USERS = []

const MOCK_TASK = {
  id: 'task-1',
  company_id: 'co-1',
  team_id: 'line-1',
  client_id: null,
  client: null,
  description: 'Hacer algo',
  status: 'En proceso',
  assignee_id: null,
  support_id: null,
  request_date: null,
  due_date: null,
  closed_date: null,
  source: null,
  created_by: null,
  checklist: [],
}

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

function renderModal(overrides = {}) {
  const props = {
    task: MOCK_TASK,
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
describe('TaskModal — orden de Actividades/Comentarios vs. botones de acción', () => {
  it('Actividades y Comentarios preceden en el DOM al botón "Guardar cambios"', () => {
    renderModal()

    const actividadesHeading = screen.getByText(/^Actividades/)
    const comentariosHeading = screen.getByText('Comentarios')
    const saveButton = screen.getByRole('button', { name: /Guardar cambios/i })

    // DOCUMENT_POSITION_FOLLOWING (4) → el nodo comparado sigue al nodo de referencia.
    // Es decir: actividadesHeading y comentariosHeading deben venir ANTES que saveButton.
    expect(
      actividadesHeading.compareDocumentPosition(saveButton) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy()
    expect(
      comentariosHeading.compareDocumentPosition(saveButton) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy()
  })

  it('el botón "Guardar cambios" sigue vinculado al form aunque esté fuera de él', () => {
    renderModal()

    const saveButton = screen.getByRole('button', { name: /Guardar cambios/i })
    expect(saveButton).toHaveAttribute('type', 'submit')
    expect(saveButton).toHaveAttribute('form', 'task-form')
  })

  it('los botones Eliminar, Cancelar y Guardar cambios siguen presentes', () => {
    renderModal()

    expect(screen.getByRole('button', { name: 'Eliminar' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Cancelar' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Guardar cambios/i })).toBeInTheDocument()
  })
})
