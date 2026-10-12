import { render, screen, fireEvent } from '@testing-library/react'
import { vi } from 'vitest'
import DesgloseDivisasModal from '../components/finanzas/DesgloseDivisasModal'

const invoices = [
  {
    id: 'i1',
    clientName: 'Nuvitt',
    concept: 'Redes',
    payments: [{ id: 'p1', amount: 1000, currency: 'USD', paidOn: '2026-09-02' }],
  },
]
const fxOperations = [{ id: 'f1', opType: 'compra', amountUsd: 600, movedOn: '2026-09-05' }]
const distributions = [
  {
    id: 'd1',
    partida: 'gastos',
    kind: 'out',
    amount: 100,
    currency: 'USD',
    movedOn: '2026-09-07',
    concept: 'Hosting',
  },
  {
    id: 'd2',
    partida: 'cambio',
    kind: 'out',
    amount: 50,
    movedOn: '2026-09-08',
    concept: 'Diferencial',
  },
]
const bsLedger = [
  { id: 'l1', movedOn: '2026-09-01', kind: 'in', amountBs: 5000, concept: 'Cobro Nuvitt' },
  { id: 'l2', movedOn: '2026-09-03', kind: 'out', amountBs: 1000, concept: 'Nómina' },
]

function renderModal(tipo, onClose = vi.fn()) {
  render(
    <DesgloseDivisasModal
      tipo={tipo}
      invoices={invoices}
      distributions={distributions}
      fxOperations={fxOperations}
      bsLedger={bsLedger}
      rateBcv={40}
      onClose={onClose}
    />,
  )
  return onClose
}

describe('DesgloseDivisasModal', () => {
  it('divisa: lista cobro, compra y pago, y el total es el de la card (1000 + 600 − 100)', () => {
    renderModal('divisa')
    expect(screen.getByText('Redes')).toBeInTheDocument()
    expect(screen.getByText('Compra de divisa')).toBeInTheDocument()
    expect(screen.getByText('Hosting')).toBeInTheDocument()
    expect(screen.getByText('$1,500.00')).toBeInTheDocument()
  })

  it('cajaBs: muestra el saldo corrido y el saldo total con su equivalente en USD', () => {
    renderModal('cajaBs')
    expect(screen.getByText('Nómina')).toBeInTheDocument()
    expect(screen.getByText(/4\.000,00 Bs/)).toBeInTheDocument()
    expect(screen.getByText(/≈ \$100\.00/)).toBeInTheDocument()
  })

  it('cambio: solo los movimientos de la partida técnica', () => {
    renderModal('cambio')
    expect(screen.getByText('Diferencial')).toBeInTheDocument()
    expect(screen.queryByText('Hosting')).not.toBeInTheDocument()
  })

  it('cierra con la X y con Escape', () => {
    const onClose = renderModal('cambio')
    fireEvent.click(screen.getByRole('button', { name: 'Cerrar' }))
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(2)
  })
})
