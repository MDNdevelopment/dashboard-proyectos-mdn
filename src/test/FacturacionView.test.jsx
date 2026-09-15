import { render, screen } from '@testing-library/react'
import { vi } from 'vitest'
import FacturacionView from '../components/finanzas/FacturacionView'

vi.mock('../components/finanzas/finanzasApi', () => ({
  loadOrCreateMonth: vi.fn(),
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
})
