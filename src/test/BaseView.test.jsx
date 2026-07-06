/**
 * Tests para BaseView — filtro de Apoyo de dirección (multi-select por persona).
 */
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi } from 'vitest'
import { MemoryRouter } from 'react-router-dom'

vi.mock('../supabase', () => ({
  supabase: {
    from: vi.fn().mockReturnValue({
      update: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: null, error: null }),
    }),
  },
}))

vi.mock('../components/tareas/taskStatus', () => ({
  updateTaskStatus: vi.fn(),
}))

import BaseView from '../components/tareas/BaseView'

// ── Datos de prueba ────────────────────────────────────────────────────────────

const TEAM = {
  id: 't1',
  name: 'Redes',
  member_user_ids: ['u-ana', 'u-bruno'],
}

const USERS_MAP = new Map([
  ['u-ana',   { user_id: 'u-ana',   first_name: 'Ana',   last_name: 'Gómez',  access_level: 1, avatar_url: null }],
  ['u-bruno', { user_id: 'u-bruno', first_name: 'Bruno', last_name: 'López',  access_level: 1, avatar_url: null }],
  ['u-dir1',  { user_id: 'u-dir1',  first_name: 'Diana', last_name: 'Ruiz',   access_level: 4, avatar_url: null }],
  ['u-dir2',  { user_id: 'u-dir2',  first_name: 'Pedro', last_name: 'Castro', access_level: 3, avatar_url: null }],
])

function makeTask(overrides) {
  return {
    id: Math.random().toString(36).slice(2),
    team_id: 't1',
    description: 'Tarea base',
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

const TASKS = [
  makeTask({ id: 'task-1', description: 'Sin apoyo', support_id: null }),
  makeTask({ id: 'task-2', description: 'Apoyo Diana', client: 'Marca A', support_id: 'u-dir1' }),
  makeTask({ id: 'task-3', description: 'Apoyo Pedro', client: 'Marca B', support_id: 'u-dir2' }),
]

function renderBase(tasks = TASKS) {
  return render(
    <MemoryRouter>
      <BaseView
        tasks={tasks}
        teams={[TEAM]}
        team={TEAM}
        usersMap={USERS_MAP}
        clientsById={new Map()}
        onOpenTask={() => {}}
        onUpdated={() => {}}
      />
    </MemoryRouter>,
  )
}

// Abre el dropdown y devuelve el panel con testid
async function openDropdown(user) {
  await user.click(screen.getByRole('button', { name: /apoyo dir./i }))
  return screen.getByTestId('direction-filter-panel')
}

// ── Tests ──────────────────────────────────────────────────────────────────────

describe('BaseView — filtro de apoyo de dirección', () => {
  it('el botón de filtro muestra "Apoyo dir.: todos" por defecto', () => {
    renderBase()
    expect(screen.getByRole('button', { name: /apoyo dir.: todos/i })).toBeInTheDocument()
  })

  it('abre el dropdown con usuarios de access_level >= 3', async () => {
    const user = userEvent.setup()
    renderBase()
    const panel = await openDropdown(user)
    expect(within(panel).getByText('Diana Ruiz')).toBeInTheDocument()
    expect(within(panel).getByText('Pedro Castro')).toBeInTheDocument()
  })

  it('el dropdown no muestra usuarios con access_level < 3', async () => {
    const user = userEvent.setup()
    renderBase()
    const panel = await openDropdown(user)
    expect(within(panel).queryByText('Ana Gómez')).not.toBeInTheDocument()
    expect(within(panel).queryByText('Bruno López')).not.toBeInTheDocument()
  })

  it('seleccionar un usuario filtra las tareas por su support_id', async () => {
    const user = userEvent.setup()
    renderBase()
    const panel = await openDropdown(user)
    await user.click(within(panel).getByText('Diana Ruiz'))
    // Click fuera para cerrar el dropdown
    await user.click(document.body)
    expect(screen.getByText('Apoyo Diana')).toBeInTheDocument()
    expect(screen.queryByText('Apoyo Pedro')).not.toBeInTheDocument()
    expect(screen.queryByText('Sin apoyo')).not.toBeInTheDocument()
  })

  it('seleccionar dos usuarios muestra tareas de ambos (OR)', async () => {
    const user = userEvent.setup()
    renderBase()
    const panel = await openDropdown(user)
    await user.click(within(panel).getByText('Diana Ruiz'))
    await user.click(within(panel).getByText('Pedro Castro'))
    await user.click(document.body)
    expect(screen.getByText('Apoyo Diana')).toBeInTheDocument()
    expect(screen.getByText('Apoyo Pedro')).toBeInTheDocument()
    expect(screen.queryByText('Sin apoyo')).not.toBeInTheDocument()
  })

  it('sin selección muestra todas las tareas del team', () => {
    renderBase()
    expect(screen.getByText('Sin apoyo')).toBeInTheDocument()
    expect(screen.getByText('Apoyo Diana')).toBeInTheDocument()
    expect(screen.getByText('Apoyo Pedro')).toBeInTheDocument()
  })

  it('"Limpiar filtros" vacía la selección de dirección', async () => {
    const user = userEvent.setup()
    renderBase()
    const panel = await openDropdown(user)
    await user.click(within(panel).getByText('Diana Ruiz'))
    await user.click(document.body)
    await user.click(screen.getByRole('button', { name: /limpiar filtros/i }))
    expect(screen.getByText('Sin apoyo')).toBeInTheDocument()
    expect(screen.getByText('Apoyo Diana')).toBeInTheDocument()
  })
})
