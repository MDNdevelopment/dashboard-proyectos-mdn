/**
 * Tests para TeamView — cards de KPI clickeables del dashboard de un team.
 */
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi } from 'vitest'

import TeamView from '../components/tareas/TeamView'
import { currentMonthIndex } from '../components/tareas/constants'

const TEAM = { id: 't1', name: 'Redes' }
const MONTH_IDX = currentMonthIndex()
const TODAY = new Date().toISOString().slice(0, 10)

const USERS_MAP = new Map([
  ['u-ana', { user_id: 'u-ana', first_name: 'Ana', last_name: 'Gómez', access_level: 1 }],
])

function makeTask(overrides) {
  return {
    id: Math.random().toString(36).slice(2),
    team_id: 't1',
    description: 'Tarea',
    client: 'Cliente',
    status: 'En proceso',
    support_id: null,
    assignee_ids: [],
    request_date: TODAY,
    due_date: null,
    closed_date: null,
    client_id: null,
    ...overrides,
  }
}

const TASKS = [
  makeTask({ id: 'closed', status: 'Terminado', closed_date: TODAY }),
  makeTask({ id: 'blocked', status: 'Paralizado' }),
  makeTask({ id: 'support', support_id: 'u-dir1' }),
]

function renderTeamView(onNavigateToBase = () => {}) {
  return render(
    <TeamView
      team={TEAM}
      tasks={TASKS}
      usersMap={USERS_MAP}
      monthIdx={MONTH_IDX}
      clientsById={new Map()}
      onOpenTask={() => {}}
      onNavigateToBase={onNavigateToBase}
    />,
  )
}

describe('TeamView — cards de KPI clickeables', () => {
  it('las 6 cards del dashboard de team son botones', () => {
    renderTeamView()
    for (const label of ['Planificadas', 'Cerradas', 'Cumplimiento', 'Paralizados', 'Retrasados', 'Apoyo dir.']) {
      expect(screen.getByRole('button', { name: new RegExp(label, 'i') })).toBeInTheDocument()
    }
  })

  it('"Planificadas" navega a Base sin filtro', async () => {
    const user = userEvent.setup()
    const onNavigateToBase = vi.fn()
    renderTeamView(onNavigateToBase)
    await user.click(screen.getByRole('button', { name: /planificadas/i }))
    expect(onNavigateToBase).toHaveBeenCalledWith(null)
  })

  it('"Cerradas" navega a Base filtrando por status Terminado', async () => {
    const user = userEvent.setup()
    const onNavigateToBase = vi.fn()
    renderTeamView(onNavigateToBase)
    await user.click(screen.getByRole('button', { name: /cerradas/i }))
    expect(onNavigateToBase).toHaveBeenCalledWith({ status: 'Terminado' })
  })

  it('"Paralizados" navega a Base filtrando por status Paralizado', async () => {
    const user = userEvent.setup()
    const onNavigateToBase = vi.fn()
    renderTeamView(onNavigateToBase)
    await user.click(screen.getByRole('button', { name: /paralizados/i }))
    expect(onNavigateToBase).toHaveBeenCalledWith({ status: 'Paralizado' })
  })

  it('"Retrasados" navega a Base con alert: "late"', async () => {
    const user = userEvent.setup()
    const onNavigateToBase = vi.fn()
    renderTeamView(onNavigateToBase)
    await user.click(screen.getByRole('button', { name: /retrasados/i }))
    expect(onNavigateToBase).toHaveBeenCalledWith({ alert: 'late' })
  })

  it('"Apoyo dir." navega a Base con support: "all" (marca a todos los directores)', async () => {
    const user = userEvent.setup()
    const onNavigateToBase = vi.fn()
    renderTeamView(onNavigateToBase)
    await user.click(screen.getByRole('button', { name: /apoyo dir\./i }))
    expect(onNavigateToBase).toHaveBeenCalledWith({ support: 'all' })
  })
})
