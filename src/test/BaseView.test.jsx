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

describe('BaseView — filtro por mes (monthIdx)', () => {
  // Enero 2026 = 2026*12 + 0 ; Marzo 2026 = 2026*12 + 2
  const JAN_2026 = 2026 * 12 + 0
  const MAR_2026 = 2026 * 12 + 2

  const MONTH_TASKS = [
    makeTask({ id: 'jan-open', description: 'Iniciada en enero, abierta', request_date: '2026-01-05', status: 'En proceso' }),
    makeTask({ id: 'jan-closed', description: 'Cerrada en enero', request_date: '2026-01-05', due_date: '2026-01-20', closed_date: '2026-01-20', status: 'Terminado' }),
    makeTask({ id: 'mar-new', description: 'Nace en marzo', request_date: '2026-03-02', status: 'Pendiente' }),
  ]

  function renderBaseWithMonth(monthIdx) {
    return render(
      <MemoryRouter>
        <BaseView
          tasks={MONTH_TASKS}
          teams={[TEAM]}
          team={TEAM}
          usersMap={USERS_MAP}
          clientsById={new Map()}
          monthIdx={monthIdx}
          onOpenTask={() => {}}
          onUpdated={() => {}}
        />
      </MemoryRouter>,
    )
  }

  it('en enero muestra las tareas activas ese mes y oculta las que aún no nacen', () => {
    renderBaseWithMonth(JAN_2026)
    expect(screen.getByText('Iniciada en enero, abierta')).toBeInTheDocument()
    expect(screen.getByText('Cerrada en enero')).toBeInTheDocument()
    expect(screen.queryByText('Nace en marzo')).not.toBeInTheDocument()
  })

  it('en marzo sigue mostrando la tarea arrastrada abierta y oculta la ya cerrada en enero', () => {
    renderBaseWithMonth(MAR_2026)
    expect(screen.getByText('Iniciada en enero, abierta')).toBeInTheDocument()
    expect(screen.getByText('Nace en marzo')).toBeInTheDocument()
    expect(screen.queryByText('Cerrada en enero')).not.toBeInTheDocument()
  })
})

describe('BaseView — checkbox "Ocultar completadas"', () => {
  // done-1 se cierra en el mes actual real (BaseView filtra también por monthIdx, que por
  // defecto es el mes de hoy) para que este suite sea independiente de ese otro filtro.
  const TODAY_MONTH_TASK_DATE = new Date().toISOString().slice(0, 10)
  const COMPLETED_TASKS = [
    makeTask({ id: 'open-1', description: 'Tarea abierta', status: 'En proceso' }),
    makeTask({ id: 'done-1', description: 'Tarea terminada', status: 'Terminado', request_date: TODAY_MONTH_TASK_DATE, closed_date: TODAY_MONTH_TASK_DATE }),
  ]

  function renderBaseAt(initialEntry) {
    return render(
      <MemoryRouter initialEntries={[initialEntry]}>
        <BaseView
          tasks={COMPLETED_TASKS}
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

  it('por defecto (sin ?hideDone=1) el checkbox está desmarcado y se ven las completadas', () => {
    renderBaseAt('/tareas?view=base')
    const checkbox = screen.getByRole('checkbox', { name: /ocultar completadas/i })
    expect(checkbox).not.toBeChecked()
    expect(screen.getByText('Tarea terminada')).toBeInTheDocument()
  })

  it('marcar el checkbox oculta las tareas Terminado y conserva el resto', async () => {
    const user = userEvent.setup()
    renderBaseAt('/tareas?view=base')
    await user.click(screen.getByRole('checkbox', { name: /ocultar completadas/i }))
    expect(screen.queryByText('Tarea terminada')).not.toBeInTheDocument()
    expect(screen.getByText('Tarea abierta')).toBeInTheDocument()
  })

  it('con ?hideDone=1 en la URL el checkbox arranca marcado y las completadas no aparecen', () => {
    renderBaseAt('/tareas?view=base&hideDone=1')
    const checkbox = screen.getByRole('checkbox', { name: /ocultar completadas/i })
    expect(checkbox).toBeChecked()
    expect(screen.queryByText('Tarea terminada')).not.toBeInTheDocument()
    expect(screen.getByText('Tarea abierta')).toBeInTheDocument()
  })

  it('"Limpiar filtros" desmarca el checkbox y vuelve a mostrar las completadas', async () => {
    const user = userEvent.setup()
    renderBaseAt('/tareas?view=base&hideDone=1')
    expect(screen.queryByText('Tarea terminada')).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /limpiar filtros/i }))
    expect(screen.getByRole('checkbox', { name: /ocultar completadas/i })).not.toBeChecked()
    expect(screen.getByText('Tarea terminada')).toBeInTheDocument()
  })
})
