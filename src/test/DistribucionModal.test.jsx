/**
 * Cubre el bug: al abrir el modal con un cobro ya preseleccionado (botón
 * "Distribuir" de una fila en DistribucionView), los inputs de partida deben
 * salir precargados con los montos recomendados (72/18/10 del mes), no vacíos.
 */
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { vi } from 'vitest'

vi.mock('../context/AuthContext', () => ({
  useAuth: () => ({ userProfile: { user_id: 'u-1' } }),
}))

const mockCreateSplit = vi.fn().mockResolvedValue({ data: [], error: null })
vi.mock('../components/finanzas/finanzasApi', () => ({
  createDistributionSplit: (...a) => mockCreateSplit(...a),
  createDistribution: vi.fn(),
}))

import DistribucionModal from '../components/finanzas/DistribucionModal'

const finMonth = { pctGastos: 0.72, pctSocios: 0.18, pctGanancia: 0.1 }

const invoice = {
  id: 'inv-1',
  clientName: 'Turbopre',
  concept: 'Gestión de redes',
  amount: 1000,
  payments: [{ id: 'p-1', amount: 1000 }],
}

describe('DistribucionModal — precarga de montos recomendados', () => {
  it('con un cobro preseleccionado, los inputs salen con el split 72/18/10, no vacíos', () => {
    render(
      <DistribucionModal
        monthId="m-1"
        invoice={invoice}
        invoices={[invoice]}
        distributions={[]}
        finMonth={finMonth}
        onClose={() => {}}
        onSaved={() => {}}
      />,
    )

    const inputs = screen.getAllByRole('spinbutton')
    expect(inputs.map((i) => i.value)).toEqual(['720.00', '180.00', '100.00'])
  })

  it('sin cobro preseleccionado (crear desde cero), no muestra inputs de partida todavía', () => {
    render(
      <DistribucionModal
        monthId="m-1"
        invoice={null}
        invoices={[invoice]}
        distributions={[]}
        finMonth={finMonth}
        onClose={() => {}}
        onSaved={() => {}}
      />,
    )

    expect(screen.queryAllByRole('spinbutton')).toHaveLength(0)
  })
})

describe('DistribucionModal — ingreso extra (parte del tercero)', () => {
  const extra = { ...invoice, esIngresoExtra: true, margenMdn: 100 }

  function renderExtra(onSaved = () => {}) {
    render(
      <DistribucionModal
        monthId="m-1"
        invoice={extra}
        invoices={[extra]}
        distributions={[]}
        finMonth={finMonth}
        onClose={() => {}}
        onSaved={onSaved}
      />,
    )
  }

  it('precarga solo el margen 72/18/10 y avisa de la parte del tercero', () => {
    renderExtra()
    expect(screen.getAllByRole('spinbutton').map((i) => i.value)).toEqual([
      '72.00',
      '18.00',
      '10.00',
    ])
    expect(screen.getByText(/Parte del tercero: \$900\.00/)).toBeInTheDocument()
  })

  it('al guardar manda el tercero aparte y el reparto del margen', async () => {
    const onSaved = vi.fn()
    renderExtra(onSaved)
    fireEvent.click(screen.getByRole('button', { name: 'Registrar distribución' }))
    await waitFor(() => expect(mockCreateSplit).toHaveBeenCalled())
    expect(mockCreateSplit).toHaveBeenCalledWith(
      'm-1',
      expect.objectContaining({
        invoiceId: 'inv-1',
        tercero: 900,
        amounts: { gastos: 72, socios: 18, ganancia: 10 },
      }),
    )
    await waitFor(() => expect(onSaved).toHaveBeenCalled())
  })

  it('una factura normal no muestra aviso de tercero ni manda tercero', async () => {
    render(
      <DistribucionModal
        monthId="m-1"
        invoice={invoice}
        invoices={[invoice]}
        distributions={[]}
        finMonth={finMonth}
        onClose={() => {}}
        onSaved={() => {}}
      />,
    )
    expect(screen.queryByText(/Parte del tercero/)).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Registrar distribución' }))
    await waitFor(() => expect(mockCreateSplit).toHaveBeenCalled())
    expect(mockCreateSplit.mock.calls.at(-1)[1].tercero).toBe(0)
  })
})
