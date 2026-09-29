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
    // En Facturación no hay columna "Cobrado": el único "Cobrado" es el pill de estado.
    expect(screen.getAllByText('Cobrado')).toHaveLength(1)
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

  it('Facturación no tiene columna Moneda ni selector de moneda', () => {
    renderView([BASE_INVOICE, invoiceBs])
    expect(screen.queryByText('Moneda:')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'USD' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Todas' })).not.toBeInTheDocument()
    // Tampoco la columna "Cobrado": en Facturación solo Facturado / Pendiente / Estado.
    expect(screen.queryByRole('columnheader', { name: 'Cobrado' })).not.toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: 'Pendiente' })).toBeInTheDocument()
  })

  it('el selector de moneda aparece al cambiar a Cobros', async () => {
    renderView([{ ...BASE_INVOICE, payments: [{ id: 'p1', amount: 2600 }] }])
    await userEvent.click(screen.getByRole('button', { name: 'Cobros' }))
    expect(screen.getByText('Moneda:')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'USD' })).toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: 'Moneda' })).toBeInTheDocument()
  })
})

describe('FacturacionView — vista Cobros', () => {
  const cobradaEnBs = {
    ...BASE_INVOICE,
    id: 'inv-bs',
    clientId: 'c-2',
    clientName: 'Jugos Los Ángeles',
    currency: 'USD',
    payments: [{ id: 'p1', amount: 2600, amountBs: 2121600, rate: 816 }],
  }
  const cobradaEnUsd = {
    ...BASE_INVOICE,
    id: 'inv-usd',
    clientId: 'c-3',
    clientName: 'Smashack',
    currency: 'USD',
    payments: [{ id: 'p2', amount: 2600 }],
  }
  const cobroMixto = {
    ...BASE_INVOICE,
    id: 'inv-mix',
    clientId: 'c-4',
    clientName: 'Fein Kaffee',
    currency: 'USD',
    payments: [
      { id: 'p3', amount: 1600 },
      { id: 'p4', amount: 1000, amountBs: 816000, rate: 816 },
    ],
  }

  async function abrirCobros() {
    await userEvent.click(screen.getByRole('button', { name: 'Cobros' }))
  }

  it('excluye las facturas sin abonos, aunque estén facturadas en USD', async () => {
    renderView([BASE_INVOICE, cobradaEnUsd])
    await abrirCobros()
    // BASE_INVOICE es "Turbopre", pendiente y con currency USD: no es un cobro.
    expect(screen.queryByText('Turbopre')).not.toBeInTheDocument()
    expect(screen.getByText('Smashack')).toBeInTheDocument()
  })

  it('factura en USD cobrada en Bs: badge Bs y monto en bolívares', async () => {
    renderView([cobradaEnBs])
    await abrirCobros()
    expect(screen.getAllByText('Bs').some((el) => el.tagName === 'SPAN')).toBe(true)
    expect(screen.getByText('Bs 2.121.600,00')).toBeInTheDocument()
  })

  it('el filtro de moneda sigue el pago real, no invoice.currency', async () => {
    renderView([cobradaEnBs, cobradaEnUsd])
    await abrirCobros()

    await userEvent.click(screen.getByRole('button', { name: 'USD' }))
    expect(screen.getByText('Smashack')).toBeInTheDocument()
    expect(screen.queryByText('Jugos Los Ángeles')).not.toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Bs' }))
    expect(screen.queryByText('Smashack')).not.toBeInTheDocument()
    expect(screen.getByText('Jugos Los Ángeles')).toBeInTheDocument()
  })

  it('un cobro mixto se muestra como "USD + Bs" y aparece con ambos filtros', async () => {
    renderView([cobroMixto])
    await abrirCobros()
    expect(screen.getByText('USD + Bs')).toBeInTheDocument()
    expect(screen.getByText('$1,600.00 + Bs 816.000,00')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'USD' }))
    expect(screen.getByText('Fein Kaffee')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Bs' }))
    expect(screen.getByText('Fein Kaffee')).toBeInTheDocument()
  })

  it('sin ningún cobro del mes, muestra el aviso correspondiente', async () => {
    renderView([BASE_INVOICE])
    await abrirCobros()
    expect(screen.getByText('Aún no hay cobros registrados este mes.')).toBeInTheDocument()
  })

  it('sin cobros en la moneda filtrada, muestra el aviso de esa moneda', async () => {
    renderView([cobradaEnUsd])
    await abrirCobros()
    await userEvent.click(screen.getByRole('button', { name: 'Bs' }))
    expect(screen.getByText('Ningún cobro en Bs este mes.')).toBeInTheDocument()
  })

  it('el monto Facturado se queda en USD aunque el cobro entrara en Bs', async () => {
    renderView([cobradaEnBs])
    await abrirCobros()
    expect(screen.getByRole('columnheader', { name: 'Facturado' })).toBeInTheDocument()
    expect(screen.getAllByText('$2,600.00').length).toBeGreaterThan(0)
  })

  it('las cards pasan a mostrar el desglose de lo cobrado', async () => {
    renderView([cobradaEnBs, cobradaEnUsd])
    await abrirCobros()
    expect(screen.getByText('Total cobrado')).toBeInTheDocument()
    expect(screen.getByText('Cobrado en divisa')).toBeInTheDocument()
    expect(screen.getByText('Cobrado en Bs')).toBeInTheDocument()
    expect(screen.queryByText('Facturado en USD')).not.toBeInTheDocument()
  })

  it('en Cobros no se ofrece editar ni eliminar la facturación', async () => {
    renderView([cobradaEnUsd], { canManage: true, canManageCobros: true })
    expect(screen.getByText('Editar')).toBeInTheDocument()
    await abrirCobros()
    expect(screen.queryByText('Editar')).not.toBeInTheDocument()
    expect(screen.queryByText('Eliminar')).not.toBeInTheDocument()
    expect(screen.getByText('Ver cobro')).toBeInTheDocument()
  })
})
