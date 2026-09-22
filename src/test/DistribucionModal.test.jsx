/**
 * Cubre el bug: al abrir el modal con un cobro ya preseleccionado (botón
 * "Distribuir" de una fila en DistribucionView), los inputs de partida deben
 * salir precargados con los montos recomendados (72/18/10 del mes), no vacíos.
 */
import { render, screen } from '@testing-library/react'
import { vi } from 'vitest'

vi.mock('../context/AuthContext', () => ({
  useAuth: () => ({ userProfile: { user_id: 'u-1' } }),
}))

vi.mock('../components/finanzas/finanzasApi', () => ({
  createDistributionSplit: vi.fn(),
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
