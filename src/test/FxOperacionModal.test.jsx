/**
 * Cubre §8.2/§8.3: tasa real/BCV/brecha en vivo, advertencia por saldo
 * insuficiente que NO bloquea el registro, y que compra/venta insertan la
 * operación en fin_fx_operations (el ledger y la fila 'cambio' las genera el
 * trigger, no este modal).
 */
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { vi } from 'vitest'

vi.mock('../context/AuthContext', () => ({
  useAuth: () => ({ userProfile: { user_id: 'u-1' } }),
}))

const mockCreateFxOperation = vi.fn().mockResolvedValue({ data: {}, error: null })
vi.mock('../components/finanzas/finanzasApi', () => ({
  createFxOperation: (...a) => mockCreateFxOperation(...a),
}))

import FxOperacionModal from '../components/finanzas/FxOperacionModal'

const rateBcv = { rate: 816, rateDate: '2026-09-23', source: 'bcv' }

beforeEach(() => {
  mockCreateFxOperation.mockClear()
})

function fillMontos(bs, usd) {
  const [bsInput, usdInput] = screen.getAllByRole('spinbutton')
  fireEvent.change(bsInput, { target: { value: bs } })
  fireEvent.change(usdInput, { target: { value: usd } })
}

describe('FxOperacionModal — tasa real, BCV y brecha en vivo', () => {
  it('compra: calcula tasa real y brecha sobre la BCV', () => {
    render(
      <FxOperacionModal
        companyId="co-1"
        monthId="m-1"
        opType="compra"
        rateBcv={rateBcv}
        saldoBs={612000}
        divisaFisica={0}
        onClose={() => {}}
        onSaved={() => {}}
      />,
    )
    fillMontos(612000, 600)

    expect(screen.getByText('Compra de dólares')).toBeInTheDocument()
    expect(screen.getByText('1.020,00')).toBeInTheDocument() // tasa real
    expect(screen.getByText('816,00')).toBeInTheDocument() // BCV
    expect(screen.getByText((_, el) => el?.textContent === '25.0%')).toBeInTheDocument() // brecha
  })

  it('venta: mismos campos, labels invertidos', () => {
    render(
      <FxOperacionModal
        companyId="co-1"
        monthId="m-1"
        opType="venta"
        rateBcv={rateBcv}
        saldoBs={0}
        divisaFisica={600}
        onClose={() => {}}
        onSaved={() => {}}
      />,
    )
    expect(screen.getByText('Venta de dólares')).toBeInTheDocument()
    expect(screen.getByText('Dólares que entregas')).toBeInTheDocument()
    expect(screen.getByText('Bs que recibes')).toBeInTheDocument()
  })
})

describe('FxOperacionModal — advertencia de saldo insuficiente, sin bloquear', () => {
  it('avisa si la compra excede el saldo de Caja Bs pero deja registrar', async () => {
    render(
      <FxOperacionModal
        companyId="co-1"
        monthId="m-1"
        opType="compra"
        rateBcv={rateBcv}
        saldoBs={100000} // menos de lo que se va a comprar
        divisaFisica={0}
        onClose={() => {}}
        onSaved={() => {}}
      />,
    )
    fillMontos(612000, 600)

    expect(screen.getByText(/Supera el saldo actual de Caja Bs/)).toBeInTheDocument()
    const submit = screen.getByRole('button', { name: 'Registrar compra' })
    expect(submit).not.toBeDisabled()

    fireEvent.click(submit)
    await waitFor(() => expect(mockCreateFxOperation).toHaveBeenCalled())
  })
})

describe('FxOperacionModal — registrar', () => {
  it('compra inserta la operación con los datos correctos', async () => {
    const onSaved = vi.fn()
    render(
      <FxOperacionModal
        companyId="co-1"
        monthId="m-1"
        opType="compra"
        rateBcv={rateBcv}
        saldoBs={612000}
        divisaFisica={0}
        onClose={() => {}}
        onSaved={onSaved}
      />,
    )
    fillMontos(612000, 600)
    fireEvent.click(screen.getByRole('button', { name: 'Registrar compra' }))

    await waitFor(() => expect(onSaved).toHaveBeenCalled())
    expect(mockCreateFxOperation).toHaveBeenCalledWith(
      'm-1',
      expect.objectContaining({
        companyId: 'co-1',
        opType: 'compra',
        amountBs: 612000,
        amountUsd: 600,
        rateBcv: 816,
      }),
    )
  })

  it('sin tasa BCV cargada, no deja registrar', async () => {
    render(
      <FxOperacionModal
        companyId="co-1"
        monthId="m-1"
        opType="compra"
        rateBcv={{ rate: null, rateDate: null, source: 'missing' }}
        saldoBs={0}
        divisaFisica={0}
        onClose={() => {}}
        onSaved={() => {}}
      />,
    )
    fillMontos(612000, 600)
    fireEvent.click(screen.getByRole('button', { name: 'Registrar compra' }))

    expect(
      await screen.findByText(
        'No hay tasa BCV cargada — carga la tasa del día antes de registrar la operación',
      ),
    ).toBeInTheDocument()
    expect(mockCreateFxOperation).not.toHaveBeenCalled()
  })
})
