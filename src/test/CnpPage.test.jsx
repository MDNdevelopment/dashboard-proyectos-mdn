import { render, screen, waitFor, cleanup, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { vi } from 'vitest'
import { makeQuery, makeChannel } from './helpers/supabaseMock'

const { LINE, CLIENT, USER, CNP_ROW, insertPayloadHolder } = vi.hoisted(() => ({
  LINE: { id: 'line-1', name: 'Georgina', member_user_ids: ['u1'], is_general: false },
  CLIENT: { id: 'client-1', name: 'Punto Fit', line_id: 'line-1' },
  USER: {
    user_id: 'u1',
    first_name: 'Jesús',
    last_name: 'García',
    access_level: 2,
    admin: false,
    deleted_at: null,
    position: null,
  },
  CNP_ROW: {
    id: 'cnp-1',
    company_id: 'co-1',
    line_id: 'line-1',
    client_id: 'client-1',
    title: 'Creatina con sello de calidad',
    content: null,
    assignee_id: 'u1',
    refs: [],
    notes: null,
    is_print: false,
    status: 'Pendiente',
    team_checked_at: null,
    team_checked_by: null,
    print_approved_at: null,
    print_approved_by: null,
    due_date: null,
    created_by: 'u1',
    created_at: new Date().toISOString(),
    deleted_at: null,
  },
  insertPayloadHolder: { current: null },
}))

vi.mock('../supabase', () => {
  const channel = makeChannel()
  return {
    supabase: {
      channel: vi.fn(() => channel),
      removeChannel: vi.fn(),
      from: vi.fn((table) => {
        if (table === 'cnp_requests') {
          const q = makeQuery([CNP_ROW])
          q.insert = vi.fn((payload) => {
            insertPayloadHolder.current = payload
            return q
          })
          return q
        }
        if (table === 'users') return makeQuery([USER])
        return makeQuery([])
      }),
    },
  }
})

vi.mock('../components/metricas/metricsApi', () => ({
  loadLines: vi.fn().mockResolvedValue({ data: [LINE], error: null }),
  loadClients: vi.fn().mockResolvedValue({ data: [CLIENT], error: null }),
}))

vi.mock('../context/AuthContext', () => ({
  useAuth: vi.fn(),
}))

import { useAuth } from '../context/AuthContext'
import CnpPage from '../pages/CnpPage'

function renderPage(canOverride = null, profileOverride = {}) {
  useAuth.mockReturnValue({
    userProfile: {
      user_id: 'u1',
      company_id: 'co-1',
      access_level: 2,
      admin: false,
      ...profileOverride,
    },
    can: canOverride ?? (() => true),
  })
  return render(
    <MemoryRouter initialEntries={['/cnp']}>
      <CnpPage />
    </MemoryRouter>,
  )
}

describe('CnpPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    insertPayloadHolder.current = null
  })

  it('renders the page title', async () => {
    renderPage()
    expect(screen.getByRole('heading', { name: 'CNP' })).toBeInTheDocument()
  })

  it('renders Dashboard and Base tabs, hiding Base when can() denies it', async () => {
    renderPage()
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Dashboard' })).toBeInTheDocument()
    })
    expect(screen.getByRole('button', { name: 'Base' })).toBeInTheDocument()

    cleanup()
    renderPage((key) => key !== 'cnp.base')
    await waitFor(() => {
      expect(screen.getAllByRole('button', { name: 'Dashboard' })[0]).toBeInTheDocument()
    })
    expect(screen.queryAllByRole('button', { name: 'Base' })).toHaveLength(0)
  })

  it('shows the CNP loaded from cnp_requests in the Base view', async () => {
    const user = userEvent.setup()
    renderPage()
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Base' })).toBeInTheDocument()
    })
    await user.click(screen.getByRole('button', { name: 'Base' }))
    // "Punto Fit" también aparece como opción del filtro de cliente; se busca dentro
    // de la tabla para no ambigüar con ese <select>.
    const description = await screen.findByText('Creatina con sello de calidad')
    const table = description.closest('table')
    expect(within(table).getByText('Punto Fit')).toBeInTheDocument()
  })

  it('keeps showing a line\'s CNP when switching to "Todos" (regression: line_id, not team_id)', async () => {
    const user = userEvent.setup()
    renderPage(null, { access_level: 4 })
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Todos' })).toBeInTheDocument()
    })
    await user.click(screen.getByRole('button', { name: 'Base' }))
    expect(await screen.findByText('Creatina con sello de calidad')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Todos' }))
    expect(await screen.findByText('Creatina con sello de calidad')).toBeInTheDocument()
  })

  it('opens the create modal from "Nuevo CNP" and sends the expected payload on submit', async () => {
    const user = userEvent.setup()
    renderPage()
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /nuevo cnp/i })).toBeInTheDocument()
    })

    await user.click(screen.getByRole('button', { name: /nuevo cnp/i }))
    expect(screen.getByRole('heading', { name: 'Nuevo CNP' })).toBeInTheDocument()

    await user.selectOptions(screen.getByRole('combobox', { name: /cliente/i }), 'client-1')
    await user.type(
      screen.getByPlaceholderText(/creatina con sello de calidad/i),
      'Nuevo CNP de prueba',
    )
    // Responsable: UserPickerSingle — abrir y elegir el único miembro de la línea.
    await user.click(screen.getByRole('button', { name: /asignar diseñador/i }))
    await user.click(await screen.findByText('Jesús García'))

    await user.click(screen.getByRole('button', { name: 'Crear CNP' }))

    await waitFor(() => {
      expect(insertPayloadHolder.current).not.toBeNull()
    })
    expect(insertPayloadHolder.current).toMatchObject({
      company_id: 'co-1',
      line_id: 'line-1',
      client_id: 'client-1',
      title: 'Nuevo CNP de prueba',
      assignee_id: 'u1',
      is_print: false,
      status: 'Pendiente',
      created_by: 'u1',
    })
  })

  it('clicking the "Paralizados" KPI navigates to Base with that status filter applied', async () => {
    const user = userEvent.setup()
    renderPage()
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Paralizados/ })).toBeInTheDocument()
    })

    await user.click(screen.getByRole('button', { name: /Paralizados/ }))

    expect(await screen.findByDisplayValue('Paralizado')).toBeInTheDocument()
    // El CNP de prueba está en estatus Pendiente, así que con el filtro aplicado no aparece.
    expect(screen.getByText('No hay CNP que coincidan.')).toBeInTheDocument()
  })

  it('clicking a client row in the "por cliente" dashboard table navigates to Base filtered by that client', async () => {
    const user = userEvent.setup()
    renderPage()
    // La fila de "Por cliente" del dashboard solo muestra el nombre del cliente; se
    // espera a que cargue y se sube al <tr> clickeable.
    const clientCell = await screen.findByText('Punto Fit')
    await user.click(clientCell.closest('tr'))

    // La celda de la tabla de Base y el chip de filtro activo muestran ambos "Punto Fit".
    expect(await screen.findAllByText('Punto Fit')).not.toHaveLength(0)
    expect(screen.getByText('Creatina con sello de calidad')).toBeInTheDocument()
  })
})
