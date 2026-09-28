import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi } from 'vitest'
import FacturacionView from '../components/finanzas/FacturacionView'

const mockLoadOrCreateMonth = vi.fn()
const mockSeedRecurringInvoices = vi.fn().mockResolvedValue({ error: null })

vi.mock('../components/finanzas/finanzasApi', () => ({
  loadOrCreateMonth: (...a) => mockLoadOrCreateMonth(...a),
  seedRecurringInvoices: (...a) => mockSeedRecurringInvoices(...a),
  deleteInvoice: vi.fn(),
}))

const BASE_INVOICE = {
  id: 'inv-1',
  clientId: 'c-1',
  clientName: 'Turbopre',
  concept: 'Gestión de redes',
  amount: 2600,
  currency: 'USD',
  recurring: true,
  payments: [],
}

function renderView(invoices, overrides = {}) {
  return render(
    <FacturacionView
      companyId="co-1"
      year={2026}
      month={7}
      finMonth={{ id: 'm-1', closed: false }}
      invoices={invoices}
      clients={[]}
      loading={false}
      refetch={vi.fn()}
      canManage={false}
      canManageCobros={false}
      {...overrides}
    />,
  )
}

describe('FacturacionView', () => {
  it('muestra el estado "Pendiente" sin abonos', () => {
    renderView([BASE_INVOICE])
    expect(screen.getAllByText('Pendiente')).toHaveLength(2) // th "Pendiente" + pill de estado
  })

  it('muestra el estado "Abonado" con un abono parcial', () => {
    renderView([{ ...BASE_INVOICE, payments: [{ id: 'p1', amount: 1000 }] }])
    expect(screen.getByText('Abonado')).toBeInTheDocument()
  })

  it('muestra el estado "Cobrado" cuando el pago cubre el monto', () => {
    renderView([{ ...BASE_INVOICE, payments: [{ id: 'p1', amount: 2600 }] }])
    expect(screen.getAllByText('Cobrado')).toHaveLength(2) // th "Cobrado" + pill de estado
  })

  it('muestra el estado vacío sin facturas', () => {
    renderView([])
    expect(screen.getByText(/Sin facturación este mes/)).toBeInTheDocument()
  })

  it('oculta "Agregar facturación" sin permiso de gestión', () => {
    renderView([BASE_INVOICE], { canManage: false })
    expect(screen.queryByText('+ Agregar facturación')).not.toBeInTheDocument()
  })

  it('muestra "Agregar facturación" con permiso de gestión y el mes abierto', () => {
    renderView([BASE_INVOICE], { canManage: true })
    expect(screen.getByText('+ Agregar facturación')).toBeInTheDocument()
  })

  it('pide abrir el mes cuando finMonth es null', () => {
    renderView([], { finMonth: null, canManage: true })
    expect(screen.getByText(/Este mes aún no se ha abierto/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Abrir mes' })).toBeInTheDocument()
  })

  it('al abrir el mes, precarga la facturación recurrente de los clientes activos', async () => {
    mockLoadOrCreateMonth.mockResolvedValueOnce({
      data: { id: 'm-new' },
      error: null,
    })
    const clients = [{ id: 'c-1', name: 'Turbopre', monthly_fee: 2600, mdn_since: '2025-01-01' }]
    const refetch = vi.fn()
    renderView([], { finMonth: null, canManage: true, clients, refetch })

    await userEvent.click(screen.getByRole('button', { name: 'Abrir mes' }))

    await waitFor(() =>
      expect(mockSeedRecurringInvoices).toHaveBeenCalledWith({
        companyId: 'co-1',
        monthId: 'm-new',
        year: 2026,
        month: 7,
        clients,
      }),
    )
    expect(refetch).toHaveBeenCalled()
  })
})

describe('FacturacionView — card de composición y filtro por moneda', () => {
  const invoiceBs = {
    ...BASE_INVOICE,
    id: 'inv-2',
    clientId: 'c-2',
    clientName: 'Jugos Los Ángeles',
    amount: 750,
    currency: 'Bs',
    amountBs: 612000,
    rate: 816,
  }

  it('la card muestra el total facturado y el desglose USD/Bs, sin filtrar', () => {
    renderView([BASE_INVOICE, invoiceBs])
    expect(screen.getByText('Total facturado')).toBeInTheDocument()
    expect(screen.getAllByText('$3,350.00').length).toBeGreaterThan(0)
    expect(screen.getByText('Facturado en USD')).toBeInTheDocument()
    expect(screen.getAllByText('$2,600.00').length).toBeGreaterThan(0)
    expect(screen.getByText('Facturado en Bs')).toBeInTheDocument()
    expect(screen.getAllByText('$750.00').length).toBeGreaterThan(0)
  })

  it('la columna Moneda muestra el badge de cada factura', () => {
    renderView([BASE_INVOICE, invoiceBs])
    expect(screen.getByText('Moneda')).toBeInTheDocument()
    expect(screen.getAllByText('USD').length).toBeGreaterThan(0)
    // "Bs" también es el label del botón de filtro — se busca el badge por su rol de <span>.
    expect(screen.getAllByText('Bs').some((el) => el.tagName === 'SPAN')).toBe(true)
  })

  it('el filtro por moneda reduce las filas de la tabla sin tocar la card', async () => {
    renderView([BASE_INVOICE, invoiceBs])
    expect(screen.getByText('Jugos Los Ángeles')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'USD' }))

    expect(screen.getByText('Turbopre')).toBeInTheDocument()
    expect(screen.queryByText('Jugos Los Ángeles')).not.toBeInTheDocument()
    // La card sigue mostrando el total real, no el filtrado.
    expect(screen.getByText('$3,350.00')).toBeInTheDocument()
  })

  it('sin facturas en la moneda filtrada, muestra el aviso correspondiente', async () => {
    renderView([BASE_INVOICE])
    await userEvent.click(screen.getByRole('button', { name: 'Bs' }))
    expect(screen.getByText('Ninguna factura en Bs este mes.')).toBeInTheDocument()
  })
})

describe('FacturacionView — badge y columna Cobrado según la moneda del cobro', () => {
  it('factura en USD cobrada en Bs: el badge pasa a Bs y Cobrado muestra el monto en Bs', () => {
    renderView([
      {
        ...BASE_INVOICE,
        currency: 'USD',
        payments: [{ id: 'p1', amount: 2600, amountBs: 2121600, rate: 816 }],
      },
    ])
    // El badge de moneda (un <span>, no el botón de filtro) ya no dice "USD".
    expect(screen.queryAllByText('USD').some((el) => el.tagName === 'SPAN')).toBe(false)
    expect(screen.getAllByText('Bs').some((el) => el.tagName === 'SPAN')).toBe(true)
    expect(screen.getByText('Bs 2.121.600,00')).toBeInTheDocument()
  })

  it('factura en USD cobrada en USD: el badge y Cobrado se quedan en USD, sin cambios', () => {
    renderView([{ ...BASE_INVOICE, currency: 'USD', payments: [{ id: 'p1', amount: 2600 }] }])
    expect(screen.getAllByText('USD').some((el) => el.tagName === 'SPAN')).toBe(true)
    // El monto facturado y el cobrado coinciden ($2,600.00): aparece más de una vez.
    expect(screen.getAllByText('$2,600.00').length).toBeGreaterThan(0)
  })

  it('el filtro "USD" excluye una factura en USD cobrada en Bs (sigue el badge, no invoice.currency)', async () => {
    renderView([
      BASE_INVOICE, // USD facturado y cobrado en USD (sin abonos)
      {
        ...BASE_INVOICE,
        id: 'inv-3',
        clientId: 'c-3',
        clientName: 'Jugos Los Ángeles',
        currency: 'USD',
        payments: [{ id: 'p1', amount: 2600, amountBs: 2121600, rate: 816 }],
      },
    ])
    expect(screen.getByText('Jugos Los Ángeles')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'USD' }))

    expect(screen.getByText('Turbopre')).toBeInTheDocument()
    expect(screen.queryByText('Jugos Los Ángeles')).not.toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Bs' }))
    expect(screen.queryByText('Turbopre')).not.toBeInTheDocument()
    expect(screen.getByText('Jugos Los Ángeles')).toBeInTheDocument()
  })

  it('el monto Facturado siempre se queda en USD, sin importar la moneda del cobro', () => {
    renderView([
      {
        ...BASE_INVOICE,
        currency: 'USD',
        payments: [{ id: 'p1', amount: 2600, amountBs: 2121600, rate: 816 }],
      },
    ])
    expect(screen.getByText('Facturado')).toBeInTheDocument()
    // El monto facturado ($2,600.00) sigue en USD aunque el cobro se muestre en Bs.
    expect(screen.getAllByText('$2,600.00').length).toBeGreaterThan(0)
  })
})
