import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi } from 'vitest'

const MOCK_EMPLOYEES = [
  { user_id: 'u-1', first_name: 'Ana', last_name: 'Pérez', deleted_at: null },
  { user_id: 'u-2', first_name: 'Luis', last_name: 'Gómez', deleted_at: null },
]

const MOCK_SUBS = [
  {
    id: 's-1',
    name: 'Adobe Creative Cloud',
    category: 'conectividad',
    service_type: 'imagen',
    amount: 60,
    currency: 'USD',
    frequency: 'mensual',
    billing_day: 15,
    billing_month: null,
    card_last4: '4242',
    owner_user_id: 'u-1',
    account_email: 'disenio@mdn.com',
    status: 'activa',
    comment: 'Licencias de diseño',
  },
  {
    id: 's-2',
    name: 'Hosting antiguo',
    category: 'conectividad',
    service_type: 'otro',
    amount: 10,
    currency: 'USD',
    frequency: 'mensual',
    billing_day: 3,
    billing_month: null,
    card_last4: null,
    owner_user_id: null,
    status: 'cancelada',
    comment: null,
  },
  {
    id: 's-3',
    name: 'Dominio sin datos',
    category: 'conectividad',
    service_type: 'ia',
    amount: 0,
    currency: 'USD',
    frequency: 'mensual',
    billing_day: null,
    billing_month: null,
    card_last4: null,
    owner_user_id: null,
    status: 'activa',
    comment: null,
  },
]

const mockFetch = vi.fn().mockResolvedValue(MOCK_SUBS)
const mockDelete = vi.fn().mockResolvedValue(undefined)
vi.mock('../lib/subscriptions', () => ({
  fetchSubscriptions: (...a) => mockFetch(...a),
  deleteSubscription: (...a) => mockDelete(...a),
  createSubscription: vi.fn(),
  updateSubscription: vi.fn(),
}))

const mockLoadCompanyEmployees = vi.fn().mockResolvedValue({ data: MOCK_EMPLOYEES, error: null })
vi.mock('../components/metricas/metricsApi', () => ({
  loadCompanyEmployees: (...a) => mockLoadCompanyEmployees(...a),
}))

vi.mock('../supabase', () => {
  const channel = { on: vi.fn().mockReturnThis(), subscribe: vi.fn().mockReturnThis() }
  return { supabase: { channel: vi.fn(() => channel), removeChannel: vi.fn() } }
})

vi.mock('../context/AuthContext', () => ({
  useAuth: vi.fn(() => ({ userProfile: { user_id: 'u-1', company_id: 'co-1' } })),
}))

import SubscriptionsView from '../components/empresa/SubscriptionsView'

describe('SubscriptionsView', () => {
  it('muestra el aviso de que no se refleja en Finanzas', async () => {
    render(<SubscriptionsView companyId="co-1" canManage={false} />)
    expect(await screen.findByText(/aún no se reflejan en Finanzas/i)).toBeInTheDocument()
  })

  it('lista las suscripciones con los últimos 4 dígitos de la tarjeta', async () => {
    render(<SubscriptionsView companyId="co-1" canManage={false} />)
    expect(await screen.findByText('Adobe Creative Cloud')).toBeInTheDocument()
    expect(screen.getByText('•••• 4242')).toBeInTheDocument()
    expect(screen.getByText('Hosting antiguo')).toBeInTheDocument()
  })

  it('sin permiso de gestión no hay botones de escritura', async () => {
    render(<SubscriptionsView companyId="co-1" canManage={false} />)
    await screen.findByText('Adobe Creative Cloud')
    expect(screen.queryByText('+ Nueva')).not.toBeInTheDocument()
    expect(screen.queryByText('Editar')).not.toBeInTheDocument()
    expect(screen.queryByText('Eliminar')).not.toBeInTheDocument()
  })

  it('con permiso de gestión aparecen crear, editar y eliminar', async () => {
    render(<SubscriptionsView companyId="co-1" canManage />)
    await screen.findByText('Adobe Creative Cloud')
    expect(screen.getByText('+ Nueva')).toBeInTheDocument()
    expect(screen.getAllByText('Editar')).toHaveLength(3)
  })

  it('resalta las que no tienen tarjeta y marca la fecha por confirmar', async () => {
    render(<SubscriptionsView companyId="co-1" canManage={false} />)
    await screen.findByText('Dominio sin datos')
    // Solo la activa sin tarjeta dice "Sin tarjeta"; la cancelada muestra "—".
    expect(screen.getAllByText('Sin tarjeta')).toHaveLength(1)
    expect(screen.getByText('Fecha por confirmar')).toBeInTheDocument()
    const row = screen.getByText('Dominio sin datos').closest('div.flex-wrap')
    expect(row.className).toContain('border-[#FFB800]')
    const complete = screen.getByText('Adobe Creative Cloud').closest('div.flex-wrap')
    expect(complete.className).not.toContain('border-[#FFB800]')
  })

  it('el filtro de estado oculta las que no coinciden', async () => {
    const user = userEvent.setup()
    render(<SubscriptionsView companyId="co-1" canManage={false} />)
    await screen.findByText('Adobe Creative Cloud')
    const [statusSelect] = screen.getAllByRole('combobox')
    await user.selectOptions(statusSelect, 'cancelada')
    await waitFor(() => {
      expect(screen.queryByText('Adobe Creative Cloud')).not.toBeInTheDocument()
    })
    expect(screen.getByText('Hosting antiguo')).toBeInTheDocument()
  })

  it('el filtro de tipo de servicio muestra solo ese tipo', async () => {
    const user = userEvent.setup()
    render(<SubscriptionsView companyId="co-1" canManage={false} />)
    await screen.findByText('Adobe Creative Cloud')
    const typeSelect = screen.getByRole('combobox', { name: /tipo de servicio/i })
    await user.selectOptions(typeSelect, 'ia')
    await waitFor(() => {
      expect(screen.queryByText('Adobe Creative Cloud')).not.toBeInTheDocument()
    })
    expect(screen.getByText('Dominio sin datos')).toBeInTheDocument()
  })

  it('el total mensual solo suma las activas', async () => {
    render(<SubscriptionsView companyId="co-1" canManage={false} />)
    await screen.findByText('Adobe Creative Cloud')
    // $60 sale en la card de total y en la fila de Adobe; los $10 de la cancelada no suman.
    expect(screen.getAllByText(/\$60[.,]00/)).toHaveLength(2)
    expect(screen.queryByText(/\$70[.,]00/)).not.toBeInTheDocument()
  })

  it('muestra el correo de la cuenta debajo del tipo y responsable', async () => {
    render(<SubscriptionsView companyId="co-1" canManage={false} />)
    expect(await screen.findByText('disenio@mdn.com')).toBeInTheDocument()
  })

  it('la card Activas filtra por estado activa y un segundo click lo quita', async () => {
    const user = userEvent.setup()
    render(<SubscriptionsView companyId="co-1" canManage={false} />)
    await screen.findByText('Hosting antiguo')
    const card = screen.getByRole('button', { name: /activas/i })
    await user.click(card)
    await waitFor(() => {
      expect(screen.queryByText('Hosting antiguo')).not.toBeInTheDocument()
    })
    expect(screen.getByText('Adobe Creative Cloud')).toBeInTheDocument()
    expect(card).toHaveAttribute('aria-pressed', 'true')
    await user.click(card)
    expect(await screen.findByText('Hosting antiguo')).toBeInTheDocument()
  })

  it('la card Cobran en 7 días deja solo las que cobran pronto', async () => {
    const user = userEvent.setup()
    mockFetch.mockResolvedValueOnce(
      MOCK_SUBS.map((s) => (s.id === 's-1' ? { ...s, billing_day: new Date().getDate() } : s)),
    )
    render(<SubscriptionsView companyId="co-1" canManage={false} />)
    await screen.findByText('Hosting antiguo')
    await user.click(screen.getByRole('button', { name: /cobran en 7 días/i }))
    await waitFor(() => {
      expect(screen.queryByText('Hosting antiguo')).not.toBeInTheDocument()
    })
    expect(screen.queryByText('Dominio sin datos')).not.toBeInTheDocument()
    expect(screen.getByText('Adobe Creative Cloud')).toBeInTheDocument()
  })
})
