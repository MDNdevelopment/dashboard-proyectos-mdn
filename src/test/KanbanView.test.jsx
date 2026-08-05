/**
 * Tests para KanbanView — filtro por mes (monthIdx).
 */
import { render, screen } from '@testing-library/react'
import { vi } from 'vitest'
import { createSupabaseMock, makeQuery } from './helpers/supabaseMock'

vi.mock('../supabase', () => ({
  supabase: createSupabaseMock({
    tables: {
      tasks: () => makeQuery(null),
    },
  }),
}))

vi.mock('../components/tareas/taskStatus', () => ({
  updateTaskStatus: vi.fn(),
}))

import KanbanView from '../components/tareas/KanbanView'

const TEAM = { id: 't1', name: 'Redes', member_user_ids: ['u-ana'] }

const USERS_MAP = new Map([
  [
    'u-ana',
    { user_id: 'u-ana', first_name: 'Ana', last_name: 'Gómez', access_level: 1, avatar_url: null },
  ],
])

function makeTask(overrides) {
  return {
    id: Math.random().toString(36).slice(2),
    team_id: 't1',
    description: 'Tarea kanban',
    client: 'Cliente',
    status: 'En proceso',
    support_id: null,
    assignee_ids: [],
    request_date: '2026-01-10',
    due_date: null,
    closed_date: null,
    client_id: null,
    ...overrides,
  }
}

// Enero 2026 = 2026*12 + 0 ; Marzo 2026 = 2026*12 + 2
const JAN_2026 = 2026 * 12 + 0
const MAR_2026 = 2026 * 12 + 2

const MONTH_TASKS = [
  makeTask({
    id: 'jan-open',
    description: 'Iniciada en enero, abierta',
    request_date: '2026-01-05',
    status: 'En proceso',
  }),
  makeTask({
    id: 'jan-closed',
    description: 'Cerrada en enero',
    request_date: '2026-01-05',
    due_date: '2026-01-20',
    closed_date: '2026-01-20',
    status: 'Terminado',
  }),
  makeTask({
    id: 'mar-new',
    description: 'Nace en marzo',
    request_date: '2026-03-02',
    status: 'Pendiente',
  }),
]

function renderKanban(monthIdx) {
  return render(
    <KanbanView
      team={TEAM}
      teams={[TEAM]}
      tasks={MONTH_TASKS}
      usersMap={USERS_MAP}
      clientsById={new Map()}
      monthIdx={monthIdx}
      onOpenTask={() => {}}
      onUpdated={() => {}}
    />,
  )
}

describe('KanbanView — filtro por mes (monthIdx)', () => {
  it('en enero muestra las tareas activas ese mes y oculta las que aún no nacen', () => {
    renderKanban(JAN_2026)
    expect(screen.getByText('Iniciada en enero, abierta')).toBeInTheDocument()
    expect(screen.getByText('Cerrada en enero')).toBeInTheDocument()
    expect(screen.queryByText('Nace en marzo')).not.toBeInTheDocument()
  })

  it('en marzo sigue mostrando la tarea arrastrada abierta y oculta la ya cerrada en enero', () => {
    renderKanban(MAR_2026)
    expect(screen.getByText('Iniciada en enero, abierta')).toBeInTheDocument()
    expect(screen.getByText('Nace en marzo')).toBeInTheDocument()
    expect(screen.queryByText('Cerrada en enero')).not.toBeInTheDocument()
  })
})
