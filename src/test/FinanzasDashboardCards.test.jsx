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

  it('las metas se miden contra lo cobrado propio, sin la parte de terceros del ingreso extra', async () => {
    renderDashboard({
      // $1.000 cobrados, $900 de un tercero: la base de MDN es $100.
      invoices: [
        {
          id: 'i1',
          clientName: 'Proveedor X',
          concept: 'Reventa',
          amount: 1000,
          currency: 'USD',
          esIngresoExtra: true,
          margenMdn: 100,
          payments: [{ id: 'p1', amount: 1000 }],
        },
      ],
      distributions: [
        {
          id: 'd0',
          partida: 'gastos',
          kind: 'in',
          amount: 900,
          invoiceId: 'i1',
          note: 'pase_tercero',
        },
        { id: 'd1', partida: 'gastos', kind: 'in', amount: 40, invoiceId: 'i1' },
        { id: 'd2', partida: 'socios', kind: 'in', amount: 30, invoiceId: 'i1' },
        { id: 'd3', partida: 'ganancia', kind: 'in', amount: 30, invoiceId: 'i1' },
      ],
    })
    await screen.findByText('Facturado')
    // Metas = 40/30/30% de $100 (no de $1.000): Gastos $40, Socios y Ganancia $30.
    expect(screen.getByText(/\/ meta \$40\.00/)).toBeInTheDocument()
    expect(screen.getAllByText(/\/ meta \$30\.00/)).toHaveLength(2)
    expect(screen.getByText(/\$900\.00 de terceros/)).toBeInTheDocument()
  })
})
