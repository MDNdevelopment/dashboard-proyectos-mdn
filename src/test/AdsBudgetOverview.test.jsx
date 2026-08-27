/**
 * Tests del modal "Presupuestos por cliente" — AdsBudgetOverview.
 * Cubre: orden alfabético, cálculo de invertido/disponible por cliente,
 * clientes sin presupuesto ("—"), y el filtro por línea.
 */
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi } from 'vitest'

const MOCK_LINES = [
  { id: 'l-1', name: 'Línea Retail' },
  { id: 'l-2', name: 'Línea Bancos' },
]

const mockLoadLines = vi.fn().mockResolvedValue({ data: MOCK_LINES, error: null })

vi.mock('../components/metricas/metricsApi', () => ({
  loadLines: (...a) => mockLoadLines(...a),
}))

import AdsBudgetOverview from '../components/ads/AdsBudgetOverview'

const MOCK_CLIENTS = [
  { id: 'c-2', name: 'Pepsi', campaign_budget: null, logo_url: null, line_id: 'l-1' },
  { id: 'c-1', name: 'Banco Exterior', campaign_budget: 100, logo_url: null, line_id: 'l-2' },
]

const MOCK_ADS = [
  { id: 'ad-1', client_id: 'c-1', amount: 80, start_date: '2026-07-05' },
  { id: 'ad-2', client_id: 'c-1', amount: 50, start_date: '2026-06-01' }, // otro periodo
  { id: 'ad-3', client_id: 'c-2', amount: 30, start_date: '2026-07-02' },
]

function renderOverview(props = {}) {
  return render(
    <AdsBudgetOverview
      companyId="co-1"
      periodo={{ month: 7, year: 2026 }}
      ads={MOCK_ADS}
      clients={MOCK_CLIENTS}
      onClose={() => {}}
      {...props}
    />,
  )
}

describe('AdsBudgetOverview', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockLoadLines.mockResolvedValue({ data: MOCK_LINES, error: null })
  })

  it('lista los clientes ordenados alfabéticamente', async () => {
    renderOverview()
    await waitFor(() => {
      expect(screen.getByText('Banco Exterior')).toBeInTheDocument()
    })

    const cells = screen.getAllByText(/Banco Exterior|Pepsi/)
    const names = cells.map((el) => el.textContent)
    expect(names.indexOf('Banco Exterior')).toBeLessThan(names.indexOf('Pepsi'))
  })

  it('calcula el invertido del periodo y el disponible restante', async () => {
    renderOverview()
    await waitFor(() => {
      expect(screen.getByText('Banco Exterior')).toBeInTheDocument()
    })

    // Banco Exterior: presupuesto 100, invertido en julio = 80 (se excluye el de junio), disponible = 20
    const row = screen.getByText('Banco Exterior').closest('tr')
    expect(row).toHaveTextContent('$100.00')
    expect(row).toHaveTextContent('$80.00')
    expect(row).toHaveTextContent('$20.00')
  })

  it('muestra "—" para clientes sin presupuesto', async () => {
    renderOverview()
    await waitFor(() => {
      expect(screen.getByText('Pepsi')).toBeInTheDocument()
    })

    const row = screen.getByText('Pepsi').closest('tr')
    expect(row).toHaveTextContent('—')
    expect(row).toHaveTextContent('$30.00') // invertido sí se calcula
  })

  it('el filtro por línea reduce la lista a los clientes de esa línea', async () => {
    const user = userEvent.setup()
    renderOverview()
    await waitFor(() => {
      expect(screen.getByText('Banco Exterior')).toBeInTheDocument()
    })

    await user.selectOptions(screen.getByDisplayValue('Todas las líneas'), 'l-2')

    expect(screen.getByText('Banco Exterior')).toBeInTheDocument()
    expect(screen.queryByText('Pepsi')).not.toBeInTheDocument()
  })

  it('initialLineScope abre el modal ya filtrado a esa línea', async () => {
    renderOverview({ initialLineScope: 'l-2' })

    await waitFor(() => {
      expect(screen.getByText('Banco Exterior')).toBeInTheDocument()
    })
    expect(screen.queryByText('Pepsi')).not.toBeInTheDocument()
    expect(screen.getByDisplayValue('Línea Bancos')).toBeInTheDocument()
  })
})
