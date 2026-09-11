/**
 * TaskModal — chip de responsable de un usuario nivel 1 (no privilegiado).
 *
 * Antes, un nivel 1 quedaba SIEMPRE forzado como responsable y bloqueado (no podía
 * quitarse), tanto al crear una tarea como al editar cualquiera. La razón real era RLS: el
 * INSERT de `tasks` solo lo permitía si `auth.uid()` quedaba en `assignee_ids`. Con la
 * migración 20260923000000_tasks_insert_created_by.sql, el INSERT también se permite si
 * `created_by = auth.uid()`, así que:
 * - Tarea NUEVA: el nivel 1 sigue preseleccionado como responsable, pero ya puede quitarse.
 * - Tarea EXISTENTE que él mismo creó: puede quitarse (created_by ya lo cubre en UPDATE).
 * - Tarea EXISTENTE creada por otra persona: sigue bloqueado — assignee_ids/support_id son
 *   la única vía que le da el RLS de UPDATE, y quitarse rompería el guardado.
 */
import { render, screen } from '@testing-library/react'
import { vi } from 'vitest'
import { createSupabaseMock } from './helpers/supabaseMock'

const MOCK_TEAMS = [{ id: 'line-1', name: 'Georgina', color: '#FAB51A', member_user_ids: ['u-1'] }]

const MOCK_USERS = [
  { user_id: 'u-1', first_name: 'Ana', last_name: 'Gómez', access_level: 1, avatar_url: null },
]

vi.mock('../supabase', () => ({
  supabase: createSupabaseMock(),
}))

vi.mock('../context/AuthContext', () => ({
  useAuth: vi.fn(),
}))

import { useAuth } from '../context/AuthContext'
import TaskModal from '../components/tareas/TaskModal'

function mockLevel1User() {
  useAuth.mockReturnValue({
    userProfile: { user_id: 'u-1', company_id: 'co-1', access_level: 1, admin: false },
  })
}

function renderModal(overrides = {}) {
  const props = {
    task: null,
    teams: MOCK_TEAMS,
    clients: [],
    users: MOCK_USERS,
    defaultTeamId: 'line-1',
    onClose: vi.fn(),
    onCreated: vi.fn(),
    onUpdated: vi.fn(),
    ...overrides,
  }
  return render(<TaskModal {...props} />)
}

describe('TaskModal — chip de responsable de nivel 1', () => {
  it('tarea nueva: nivel 1 arranca preseleccionado pero puede quitarse (chip con ×)', () => {
    mockLevel1User()
    renderModal()
    expect(screen.getByText('Ana')).toBeInTheDocument()
    expect(screen.getByLabelText('Quitar Ana')).toBeInTheDocument()
  })

  it('editar una tarea que él mismo creó: puede quitarse', () => {
    mockLevel1User()
    const task = {
      id: 't1',
      team_id: 'line-1',
      description: 'Hacer algo',
      status: 'En proceso',
      assignee_ids: ['u-1'],
      support_id: null,
      request_date: '2026-01-01',
      due_date: null,
      closed_date: null,
      created_by: 'u-1',
      checklist: [],
    }
    renderModal({ task })
    expect(screen.getByLabelText('Quitar Ana')).toBeInTheDocument()
  })

  it('editar una tarea creada por otra persona: sigue bloqueado, sin botón de quitar', () => {
    mockLevel1User()
    const task = {
      id: 't2',
      team_id: 'line-1',
      description: 'Hacer algo',
      status: 'En proceso',
      assignee_ids: ['u-1'],
      support_id: null,
      request_date: '2026-01-01',
      due_date: null,
      closed_date: null,
      created_by: 'u-2',
      checklist: [],
    }
    renderModal({ task })
    expect(screen.getByText('Ana')).toBeInTheDocument()
    expect(screen.queryByLabelText('Quitar Ana')).not.toBeInTheDocument()
  })

  it('usuario privilegiado (access_level ≥ 2): tarea nueva arranca sin responsable preseleccionado', () => {
    useAuth.mockReturnValue({
      userProfile: { user_id: 'u-2', company_id: 'co-1', access_level: 2, admin: false },
    })
    renderModal()
    expect(screen.getByText('Asignar responsable...')).toBeInTheDocument()
  })
})
