/**
 * Tests para PanoramaView — cards de KPI clickeables del dashboard "Todos".
 */
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi } from 'vitest'

import PanoramaView from '../components/tareas/PanoramaView'
import { currentMonthIndex } from '../components/tareas/constants'

const TEAMS = [
  { id: 't1', name: 'Redes' },
  { id: 't2', name: 'Diseño' },
]

const MONTH_IDX = currentMonthIndex()
const TODAY = new Date().toISOString().slice(0, 10)

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
    ...overrides,
  }
}

const TASKS = [
  makeTask({ id: 'closed', team_id: 't1', status: 'Terminado', closed_date: TODAY }),
  makeTask({ id: 'blocked', team_id: 't1', status: 'Paralizado' }),
  makeTask({ id: 'support', team_id: 't2', support_id: 'u-dir1' }),
]

function renderPanorama(onNavigateToBase = () => {}, onSelectTeam = () => {}) {
  return render(
    <PanoramaView
      teams={TEAMS}
      tasks={TASKS}
      monthIdx={MONTH_IDX}
      onSelectTeam={onSelectTeam}
      onNavigateToBase={onNavigateToBase}
    />,
  )
}

describe('PanoramaView — cards de KPI clickeables', () => {
  it('renderiza la card "Apoyo dir." con el conteo agregado de todos los teams', () => {
    renderPanorama()
    expect(screen.getByText('Apoyo dir.')).toBeInTheDocument()
    // 1 tarea con support_id no cerrada en todo el set
    expect(screen.getByRole('button', { name: /apoyo dir\..*1/is })).toBeInTheDocument()
  })

  it('la card "Apoyo dir." es un botón y su click navega a Base con support: "all"', async () => {
    const user = userEvent.setup()
    const onNavigateToBase = vi.fn()
    renderPanorama(onNavigateToBase)
    const card = screen.getByRole('button', { name: /apoyo dir\./i })
    await user.click(card)
    expect(onNavigateToBase).toHaveBeenCalledWith({ support: 'all' })
  })

  it('la card "Cerradas" navega a Base filtrando por status Terminado', async () => {
    const user = userEvent.setup()
    const onNavigateToBase = vi.fn()
    renderPanorama(onNavigateToBase)
    await user.click(screen.getByRole('button', { name: /cerradas/i }))
    expect(onNavigateToBase).toHaveBeenCalledWith({ status: 'Terminado' })
  })

  it('la card "Paralizados" navega a Base filtrando por status Paralizado', async () => {
    const user = userEvent.setup()
    const onNavigateToBase = vi.fn()
    renderPanorama(onNavigateToBase)
    await user.click(screen.getByRole('button', { name: /paralizados/i }))
    expect(onNavigateToBase).toHaveBeenCalledWith({ status: 'Paralizado' })
  })

  it('la card "Retrasados" navega a Base con alert: "late"', async () => {
    const user = userEvent.setup()
    const onNavigateToBase = vi.fn()
    renderPanorama(onNavigateToBase)
    await user.click(screen.getByRole('button', { name: /retrasados/i }))
    expect(onNavigateToBase).toHaveBeenCalledWith({ alert: 'late' })
  })

  it('las cards de team siguen siendo clickeables y llaman a onSelectTeam', async () => {
    const user = userEvent.setup()
    const onSelectTeam = vi.fn()
    renderPanorama(() => {}, onSelectTeam)
    await user.click(screen.getByText('Redes'))
    expect(onSelectTeam).toHaveBeenCalledWith('t1')
  })
})
