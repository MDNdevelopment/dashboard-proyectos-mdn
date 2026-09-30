import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { vi } from 'vitest'
import { createSupabaseMock, makeQuery } from './helpers/supabaseMock'

let fixedTaskMarksQuery = null

vi.mock('../supabase', () => ({
  supabase: createSupabaseMock({
    tables: {
      metric_lines: () => makeQuery(MOCK_LINES),
      metric_clients: () => makeQuery(MOCK_CLIENTS),
      users: () => makeQuery(MOCK_USERS),
      fixed_task_marks: () => {
        fixedTaskMarksQuery = makeQuery(MOCK_MARKS)
        return fixedTaskMarksQuery
      },
    },
  }),
}))

vi.mock('../context/AuthContext', () => ({
  useAuth: vi.fn(),
}))

const MOCK_LINES = [
  {
    id: 'line-1',
    name: 'Georgina',
    company_id: 'co-1',
    members: [{ user_id: 'u1', is_lead: true }],
  },
  {
    id: 'line-2',
    name: 'Sabrina',
    company_id: 'co-1',
    members: [{ user_id: 'u2', is_lead: true }],
  },
]
const MOCK_CLIENTS = [
  {
    id: 'c-1',
    name: 'Pepsi',
    line_id: 'line-1',
    social_manager_id: null,
    designer_id: null,
    fixed_tasks: null,
  },
  {
    id: 'c-2',
    name: 'Coca-Cola',
    line_id: 'line-2',
    social_manager_id: null,
    designer_id: null,
    fixed_tasks: null,
  },
]
const MOCK_USERS = [
  { user_id: 'u1', first_name: 'Georgina', last_name: 'Pérez', avatar_url: null, deleted_at: null },
]
// c-2 (Coca-Cola) cambió de línea: la marca de S1 quedó grabada con el line_id de
// la línea que hacía el trabajo antes del cambio (snapshot, no se recalcula) — ver
// 20260818000000_create_fixed_task_marks.sql. Debe seguir viéndose y siendo
// editable para Team Sabrina, que hoy es la dueña de la cuenta.
const MOCK_MARKS = [
  {
    id: 'mark-1',
    client_id: 'c-2',
    task_key: 'artes',
    period_week: 1,
    period_year: 2026,
    period_month: 9,
    status: 'si',
    line_id: 'line-old', // línea anterior, ya no visible para Sabrina
    link: null,
  },
]

import { useAuth } from '../context/AuthContext'
import TareasFijasPage from '../pages/TareasFijasPage'

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/tareas/fijas']}>
      <TareasFijasPage />
    </MemoryRouter>,
  )
}

describe('TareasFijasPage', () => {
  it('nivel 3 (jefe de línea) ve solo su línea, sin el botón "Todas"', async () => {
    useAuth.mockReturnValue({
      userProfile: { user_id: 'u1', company_id: 'co-1', access_level: 3, admin: false },
      can: () => true,
    })
    renderPage()
    await waitFor(() => {
      expect(screen.getByText('Georgina')).toBeInTheDocument()
    })
    expect(screen.queryByText('Sabrina')).not.toBeInTheDocument()
    expect(screen.queryByText('Todas')).not.toBeInTheDocument()
  })

  it('nivel 4 / admin ve el botón "Todas" y todas las líneas', async () => {
    useAuth.mockReturnValue({
      userProfile: { user_id: 'admin-1', company_id: 'co-1', access_level: 4, admin: false },
      can: () => true,
    })
    renderPage()
    await waitFor(() => {
      expect(screen.getByText('Todas')).toBeInTheDocument()
    })
    expect(screen.getAllByText('Georgina').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Sabrina').length).toBeGreaterThan(0)
  })

  it('muestra las cuentas de la línea activa en la grilla', async () => {
    useAuth.mockReturnValue({
      userProfile: { user_id: 'u1', company_id: 'co-1', access_level: 3, admin: false },
      can: () => true,
    })
    renderPage()
    await waitFor(() => {
      expect(screen.getByText('Pepsi')).toBeInTheDocument()
    })
  })

  it('sin permiso de escritura (tareas.fijas.manage=false), la grilla queda en solo lectura', async () => {
    useAuth.mockReturnValue({
      userProfile: { user_id: 'u1', company_id: 'co-1', access_level: 1, admin: false },
      can: (key) => key !== 'tareas.fijas.manage',
    })
    renderPage()
    await waitFor(() => {
      expect(screen.getByText('Solo lectura')).toBeInTheDocument()
    })
  })

  it('carga las marcas por cuenta en alcance (client_id), no por línea, y muestra el estado real de una cuenta que cambió de línea', async () => {
    useAuth.mockReturnValue({
      userProfile: { user_id: 'u2', company_id: 'co-1', access_level: 3, admin: false },
      can: () => true,
    })
    renderPage()

    await waitFor(() => {
      expect(screen.getByText('Coca-Cola')).toBeInTheDocument()
    })
    await waitFor(() => {
      expect(fixedTaskMarksQuery).not.toBeNull()
      expect(fixedTaskMarksQuery.in).toHaveBeenCalled()
    })
    // La marca se cargó filtrando por client_id (['c-2']), no por line_id — aunque
    // la fila esté grabada con line_id: 'line-old', que ya no está en el alcance de Sabrina.
    const inCalls = fixedTaskMarksQuery.in.mock.calls
    expect(inCalls.some(([field, ids]) => field === 'client_id' && ids.includes('c-2'))).toBe(true)
    expect(inCalls.some(([field]) => field === 'line_id')).toBe(false)
    // El estado real ("Entregado") se ve, en vez de "Pendiente" como pasaría si la
    // marca no se hubiera cargado.
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Entregado/i })).toBeInTheDocument()
    })
  })
})
