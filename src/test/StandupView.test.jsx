import { render, screen } from '@testing-library/react'
import { vi } from 'vitest'
import StandupView from '../components/tareas/StandupView'

// currentMonthIndex() returns year*12+month for today's date
// We use a request_date in the past so tasks are always "in month"
const TEAM = { id: 't1', name: 'Diseño' }

const SUPPORT_USER = { user_id: 'u-dir', first_name: 'Ana', last_name: 'Ruiz', avatar_url: null }

const USERS_MAP = new Map([
  ['u-dir', SUPPORT_USER],
])

// Helper to build a minimal task
function task(overrides) {
  return {
    id: Math.random().toString(36).slice(2),
    team_id: 't1',
    description: 'Tarea de prueba',
    client: 'Cliente X',
    status: 'En proceso',
    support_id: null,
    assignee_ids: [],
    request_date: '2026-01-01',
    due_date: null,
    closed_date: null,
    ...overrides,
  }
}

const noop = () => {}

describe('StandupView — contenedor "Asignadas a dirección"', () => {
  it('no muestra tareas de dirección cuando ninguna tiene support_id', () => {
    const tasks = [
      task({ status: 'En proceso' }),
      task({ status: 'Pendiente' }),
    ]
    render(
      <StandupView
        team={TEAM}
        tasks={tasks}
        usersMap={USERS_MAP}
        monthIdx={2026 * 12 + 0}
        onOpenTask={noop}
      />,
    )
    // Card exists but shows empty state
    expect(screen.getByText(/sin tareas asignadas a dirección/i)).toBeInTheDocument()
  })

  it('muestra tareas con support_id en el card de dirección', () => {
    const tasks = [
      task({ description: 'Tarea ejecutiva', client: 'Empresa ABC', support_id: 'u-dir' }),
    ]
    render(
      <StandupView
        team={TEAM}
        tasks={tasks}
        usersMap={USERS_MAP}
        monthIdx={2026 * 12 + 0}
        onOpenTask={noop}
      />,
    )
    expect(screen.getAllByText(/tarea ejecutiva/i).length).toBeGreaterThan(0)
    expect(screen.getAllByText(/apoyo: ana/i).length).toBeGreaterThan(0)
  })

  it('no muestra en dirección tareas cerradas (Terminado) con support_id', () => {
    const tasks = [
      task({ description: 'Tarea cerrada', support_id: 'u-dir', status: 'Terminado', closed_date: '2026-01-15' }),
    ]
    render(
      <StandupView
        team={TEAM}
        tasks={tasks}
        usersMap={USERS_MAP}
        monthIdx={2026 * 12 + 0}
        onOpenTask={noop}
      />,
    )
    expect(screen.getByText(/sin tareas asignadas a dirección/i)).toBeInTheDocument()
    expect(screen.queryByText(/tarea cerrada/i)).not.toBeInTheDocument()
  })

  it('no incluye tareas de otro team en el card de dirección', () => {
    const tasks = [
      task({ description: 'Tarea otro team', team_id: 't2', support_id: 'u-dir' }),
    ]
    render(
      <StandupView
        team={TEAM}
        tasks={tasks}
        usersMap={USERS_MAP}
        monthIdx={2026 * 12 + 0}
        onOpenTask={noop}
      />,
    )
    expect(screen.getByText(/sin tareas asignadas a dirección/i)).toBeInTheDocument()
  })
})
