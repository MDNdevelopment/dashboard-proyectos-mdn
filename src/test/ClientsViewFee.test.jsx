import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { vi } from 'vitest'

vi.mock('../supabase', () => ({
  supabase: {
    channel: vi.fn(() => ({
      on: vi.fn().mockReturnThis(),
      subscribe: vi.fn().mockReturnThis(),
    })),
    removeChannel: vi.fn(),
  },
}))

const { MOCK_LINES, MOCK_CLIENTS } = vi.hoisted(() => ({
  MOCK_LINES: [{ id: 'l1', name: 'Línea Redes', color: '#FFB800' }],
  MOCK_CLIENTS: [
    {
      id: 'c1',
      name: 'Cliente Uno',
      line_id: 'l1',
      deleted_at: null,
      payment_day: 15,
      monthly_fee: 1500,
      social_links: [],
    },
  ],
}))

vi.mock('../components/metricas/metricsApi', () => ({
  loadLines: vi.fn().mockResolvedValue({ data: MOCK_LINES, error: null }),
  loadClients: vi.fn().mockResolvedValue({ data: MOCK_CLIENTS, error: null }),
  loadCompanyEmployees: vi.fn().mockResolvedValue({ data: [], error: null }),
  deleteClient: vi.fn(),
  restoreClient: vi.fn(),
  seedMetricsIfEmpty: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('../context/AuthContext', () => ({ useAuth: vi.fn() }))

import { useAuth } from '../context/AuthContext'
import ClientsView from '../components/empresa/ClientsView'
import ClientFichaContent from '../components/metricas/ClientFichaContent'

const LEVEL2 = { user_id: 'u-2', company_id: 'co-1', access_level: 2, admin: false }

function renderList() {
  return render(
    <MemoryRouter initialEntries={['/empresa/clientes']}>
      <ClientsView companyId="co-1" canManage={false} />
    </MemoryRouter>,
  )
}

describe('ClientsView — chip de mensualidad', () => {
  it('nivel 2 sin empresa.clientes.mensualidad no ve la mensualidad', async () => {
    useAuth.mockReturnValue({ userProfile: LEVEL2, can: () => false })
    renderList()
    await waitFor(() => expect(screen.getByText('Cliente Uno')).toBeInTheDocument())
    expect(screen.queryByText('$1,500.00')).not.toBeInTheDocument()
  })

  it('nivel 2 con empresa.clientes.mensualidad ve la mensualidad', async () => {
    useAuth.mockReturnValue({
      userProfile: LEVEL2,
      can: (k) => k === 'empresa.clientes.mensualidad',
    })
    renderList()
    await waitFor(() => expect(screen.getByText('Cliente Uno')).toBeInTheDocument())
    expect(screen.getByText('$1,500.00')).toBeInTheDocument()
  })

  it('nivel 3 la ve sin la capacidad', async () => {
    useAuth.mockReturnValue({
      userProfile: { ...LEVEL2, access_level: 3 },
      can: () => false,
    })
    renderList()
    await waitFor(() => expect(screen.getByText('$1,500.00')).toBeInTheDocument())
  })
})

describe('ClientFichaContent — bloque de mensualidad', () => {
  const renderFicha = () =>
    render(
      <MemoryRouter>
        <ClientFichaContent client={MOCK_CLIENTS[0]} line={MOCK_LINES[0]} onClose={vi.fn()} />
      </MemoryRouter>,
    )

  it('sin la capacidad, oculta mensualidad y día de pago', () => {
    useAuth.mockReturnValue({ userProfile: LEVEL2, can: () => false })
    renderFicha()
    expect(screen.queryByText('Mensualidad')).not.toBeInTheDocument()
    expect(screen.queryByText('$1,500.00')).not.toBeInTheDocument()
  })

  it('con empresa.clientes.mensualidad, muestra mensualidad y día de pago', () => {
    useAuth.mockReturnValue({
      userProfile: LEVEL2,
      can: (k) => k === 'empresa.clientes.mensualidad',
    })
    renderFicha()
    expect(screen.getByText('$1,500.00')).toBeInTheDocument()
    expect(screen.getByText('día 15')).toBeInTheDocument()
  })
})
