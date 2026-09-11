/**
 * Tests para CnpBaseView — orden de columnas al hacer click en el header (mismo patrón que
 * BaseView.jsx de Gestión de Tareas: click ordena ascendente, segundo click invierte).
 */
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import CnpBaseView from '../components/cnp/CnpBaseView'

const CLIENTS_BY_ID = new Map([
  ['c-zeta', { id: 'c-zeta', name: 'Zeta', logo_url: null }],
  ['c-alfa', { id: 'c-alfa', name: 'Alfa', logo_url: null }],
  ['c-medio', { id: 'c-medio', name: 'Medio', logo_url: null }],
])

const USERS_MAP = new Map([
  ['u1', { user_id: 'u1', first_name: 'Ana', last_name: 'Gómez', avatar_url: null }],
])

function makeCnp(overrides) {
  return {
    id: Math.random().toString(36).slice(2),
    client_id: 'c-zeta',
    title: 'CNP base',
    status: 'Pendiente',
    assignee_id: null,
    is_print: false,
    print_approved_at: null,
    created_at: '2026-01-10T00:00:00Z',
    closed_date: null,
    due_date: null,
    pieces: [],
    ...overrides,
  }
}

const CNPS = [
  makeCnp({
    id: 'cnp-zeta',
    client_id: 'c-zeta',
    title: 'Tarea Z',
    created_at: '2026-01-01T00:00:00Z',
  }),
  makeCnp({
    id: 'cnp-alfa',
    client_id: 'c-alfa',
    title: 'Tarea A',
    created_at: '2026-01-03T00:00:00Z',
  }),
  makeCnp({
    id: 'cnp-medio',
    client_id: 'c-medio',
    title: 'Tarea M',
    created_at: '2026-01-02T00:00:00Z',
  }),
]

function renderView(cnps = CNPS) {
  return render(
    <MemoryRouter>
      <CnpBaseView
        cnps={cnps}
        clientsById={CLIENTS_BY_ID}
        usersMap={USERS_MAP}
        onOpenCnp={() => {}}
      />
    </MemoryRouter>,
  )
}

describe('CnpBaseView — orden de columnas al hacer click en el header', () => {
  it('por defecto ordena por Solicitado, más reciente primero', () => {
    renderView()
    const rows = screen.getAllByRole('row').slice(1)
    expect(within(rows[0]).getByText('Alfa')).toBeInTheDocument()
  })

  it('click en "Cliente" ordena alfabéticamente ascendente; un segundo click invierte el orden', async () => {
    const user = userEvent.setup()
    renderView()

    await user.click(screen.getByText('Cliente'))
    let rows = screen.getAllByRole('row').slice(1)
    expect(within(rows[0]).getByText('Alfa')).toBeInTheDocument()
    expect(within(rows[2]).getByText('Zeta')).toBeInTheDocument()

    await user.click(screen.getByText('Cliente'))
    rows = screen.getAllByRole('row').slice(1)
    expect(within(rows[0]).getByText('Zeta')).toBeInTheDocument()
    expect(within(rows[2]).getByText('Alfa')).toBeInTheDocument()
  })

  it('click en "Solicitado" ordena por fecha ascendente', async () => {
    const user = userEvent.setup()
    renderView()
    await user.click(screen.getByText('Solicitado'))
    const rows = screen.getAllByRole('row').slice(1)
    expect(within(rows[0]).getByText('Zeta')).toBeInTheDocument()
    expect(within(rows[2]).getByText('Alfa')).toBeInTheDocument()
  })

  it('click en "Título" ordena alfabéticamente por título', async () => {
    const user = userEvent.setup()
    renderView()
    await user.click(screen.getByText('Título'))
    const rows = screen.getAllByRole('row').slice(1)
    expect(within(rows[0]).getByText(/Tarea A/)).toBeInTheDocument()
  })
})
