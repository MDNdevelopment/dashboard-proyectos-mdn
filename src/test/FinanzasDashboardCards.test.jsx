import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import DashboardView from '../components/finanzas/DashboardView'

vi.mock('../components/finanzas/finanzasApi', () => ({
  loadAllInvoices: vi.fn().mockResolvedValue({ data: [], error: null }),
  loadAllMonthTotals: vi.fn().mockResolvedValue({ data: [], error: null }),
}))
vi.mock('recharts', () => {
  const Empty = () => null
  return {
    LineChart: Empty,
    Line: Empty,
    XAxis: Empty,
    YAxis: Empty,
    Tooltip: Empty,
    CartesianGrid: Empty,
    ResponsiveContainer: Empty,
  }
})

function renderDashboard(overrides = {}) {
  return render(
    <MemoryRouter>
      <DashboardView
        companyId="co-1"
        year={2026}
        month={9}
        finMonth={{ id: 'm-1', closed: false, pctGastos: 0.4, pctSocios: 0.3, pctGanancia: 0.3 }}
        invoices={[
          {
            id: 'i1',
            clientName: 'Nuvitt',
            concept: 'Redes',
            amount: 1000,
            currency: 'USD',
            payments: [],
          },
        ]}
        distributions={[]}
        monthTotals={null}
        clients={[]}
        lines={[]}
        loading={false}
        refetch={vi.fn()}
        canCerrarMes={false}
        fxOperations={[]}
        bsLedger={[]}
        rateBcv={{ rate: 40 }}
        {...overrides}
      />
    </MemoryRouter>,
  )
}

describe('Finanzas Dashboard — cards clickeables', () => {
  it('cada card de dinero enlaza a su lista conservando el mes', async () => {
    renderDashboard()
    await screen.findByText('Facturado')
    const href = (label) => screen.getByText(label).closest('a')?.getAttribute('href')
    expect(href('Facturado')).toBe('/finanzas/facturacion?mes=2026-09')
    expect(href('Cobrado')).toBe('/finanzas/facturacion?vista=cobros&mes=2026-09')
    expect(href('Por cobrar')).toBe('/finanzas/facturacion?estado=pendiente&mes=2026-09')
    expect(href('Ganancia real')).toBe('/finanzas/distribucion/ganancia?mes=2026-09')
    expect(href('Clientes activos')).toBe('/finanzas/clientes?mes=2026-09')
  })

  it('en un mes cargado como resumen las cards de dinero no enlazan a una lista vacía', async () => {
    renderDashboard({
      finMonth: {
        id: 'm-1',
        closed: true,
        summaryOnly: true,
        pctGastos: 0.4,
        pctSocios: 0.3,
        pctGanancia: 0.3,
      },
      invoices: [],
      monthTotals: { totalFacturado: 100, totalCobrado: 80, totalGanancia: 10 },
    })
    await screen.findByText('Facturado')
    expect(screen.getByText('Facturado').closest('a')).toBeNull()
    expect(screen.getByText('Clientes activos').closest('a')).not.toBeNull()
  })

  it('las cards de divisas abren el desglose', async () => {
    renderDashboard()
    await userEvent.click(await screen.findByRole('button', { name: /Resultado por cambio/ }))
    await waitFor(() =>
      expect(screen.getByRole('dialog', { name: /Resultado por cambio/ })).toBeInTheDocument(),
    )
    await userEvent.click(screen.getByRole('button', { name: 'Cerrar' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
})
