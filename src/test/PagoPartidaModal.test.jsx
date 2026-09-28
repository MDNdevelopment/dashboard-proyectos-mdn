/**
 * Cubre el flujo de "pagar con traspaso": si el monto excede el disponible de la
 * partida, el modal debe pedir de qué otra partida tomar la diferencia y registrar
 * los 3 movimientos (traspaso salida + traspaso entrada + pago) en un solo batch.
 */
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { vi } from 'vitest'

vi.mock('../context/AuthContext', () => ({
  useAuth: () => ({ userProfile: { user_id: 'u-1' } }),
}))

const mockCreateDistribution = vi.fn().mockResolvedValue({ data: {}, error: null })
const mockCreateDistributionsBatch = vi.fn().mockResolvedValue({ data: [], error: null })
const mockResolveRateBcv = vi.fn().mockResolvedValue({
  data: { rate: 816, rateDate: '2026-09-23', source: 'bcv' },
  error: null,
})
const mockUpsertRate = vi.fn().mockResolvedValue({ data: {}, error: null })
vi.mock('../components/finanzas/finanzasApi', () => ({
  createDistribution: (...a) => mockCreateDistribution(...a),
  createDistributionsBatch: (...a) => mockCreateDistributionsBatch(...a),
  resolveRateBcv: (...a) => mockResolveRateBcv(...a),
  upsertRate: (...a) => mockUpsertRate(...a),
}))

import PagoPartidaModal from '../components/finanzas/PagoPartidaModal'
import { NOTA_TRASPASO_PARTIDA } from '../components/finanzas/constants'

const saldos = { gastos: 100, socios: 500, ganancia: 300 }

function fillCommon() {
  fireEvent.change(screen.getByPlaceholderText('Ej. nómina de septiembre'), {
    target: { value: 'Nómina' },
  })
}

describe('PagoPartidaModal — pago con saldo suficiente', () => {
  it('registra un único movimiento (sin traspaso)', async () => {
    const onSaved = vi.fn()
    render(
      <PagoPartidaModal
        monthId="m-1"
        partida="gastos"
        saldos={saldos}
        onClose={() => {}}
        onSaved={onSaved}
      />,
    )
    fillCommon()
    fireEvent.change(screen.getByRole('spinbutton'), { target: { value: '80' } })
    fireEvent.click(screen.getByRole('button', { name: 'Registrar pago' }))

    await waitFor(() => expect(onSaved).toHaveBeenCalled())
    expect(mockCreateDistribution).toHaveBeenCalledWith(
      'm-1',
      expect.objectContaining({ partida: 'gastos', kind: 'out', amount: 80 }),
    )
    expect(mockCreateDistributionsBatch).not.toHaveBeenCalled()
  })
})

describe('PagoPartidaModal — pago que excede el disponible', () => {
  it('pide elegir la partida origen y bloquea el envío hasta elegir una', async () => {
    render(
      <PagoPartidaModal
        monthId="m-1"
        partida="gastos"
        saldos={saldos}
        onClose={() => {}}
        onSaved={() => {}}
      />,
    )
    fillCommon()
    fireEvent.change(screen.getByRole('spinbutton'), { target: { value: '150' } })

    expect(
      await screen.findByText(/Excede el disponible de Gastos operativos por \$50\.00/),
    ).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Registrar pago' }))
    expect(await screen.findByText('Elige de qué partida tomar la diferencia')).toBeInTheDocument()
    expect(mockCreateDistributionsBatch).not.toHaveBeenCalled()
  })

  it('con partida origen elegida, registra el traspaso y el pago en un solo batch', async () => {
    const onSaved = vi.fn()
    render(
      <PagoPartidaModal
        monthId="m-1"
        partida="gastos"
        saldos={saldos}
        onClose={() => {}}
        onSaved={onSaved}
      />,
    )
    fillCommon()
    fireEvent.change(screen.getByRole('spinbutton'), { target: { value: '150' } })
    fireEvent.click(await screen.findByRole('button', { name: /Ganancia/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Registrar pago' }))

    await waitFor(() => expect(onSaved).toHaveBeenCalled())
    expect(mockCreateDistributionsBatch).toHaveBeenCalledWith('m-1', [
      expect.objectContaining({
        partida: 'ganancia',
        kind: 'out',
        amount: 50,
        note: NOTA_TRASPASO_PARTIDA,
      }),
      expect.objectContaining({
        partida: 'gastos',
        kind: 'in',
        amount: 50,
        note: NOTA_TRASPASO_PARTIDA,
      }),
      expect.objectContaining({
        partida: 'gastos',
        kind: 'out',
        amount: 150,
        concept: 'Nómina',
      }),
    ])
  })

  it('no deja elegir una partida origen que tampoco alcanza', async () => {
    render(
      <PagoPartidaModal
        monthId="m-1"
        partida="gastos"
        saldos={{ gastos: 100, socios: 30, ganancia: 300 }}
        onClose={() => {}}
        onSaved={() => {}}
      />,
    )
    fillCommon()
    fireEvent.change(screen.getByRole('spinbutton'), { target: { value: '150' } })

    const socios = await screen.findByRole('button', { name: /Socios/ })
    expect(socios).toBeDisabled()
  })
})

describe('PagoPartidaModal — pago en bolívares (§6.5)', () => {
  it('deriva el monto en USD a la BCV y escribe currency/amount_bs/rate', async () => {
    const onSaved = vi.fn()
    render(
      <PagoPartidaModal
        monthId="m-1"
        companyId="co-1"
        partida="gastos"
        saldos={saldos}
        onClose={() => {}}
        onSaved={onSaved}
      />,
    )
    fillCommon()
    fireEvent.click(screen.getByRole('button', { name: 'Pagué en Bs' }))

    await waitFor(() => expect(mockResolveRateBcv).toHaveBeenCalled())
    // 81.600 Bs @ 816 = $100, dentro del saldo disponible de gastos (100).
    // El primer spinbutton es "Monto en Bs"; el segundo es el USD derivado (readOnly).
    fireEvent.change(screen.getAllByRole('spinbutton')[0], { target: { value: '81600' } })

    fireEvent.click(screen.getByRole('button', { name: 'Registrar pago' }))

    await waitFor(() => expect(onSaved).toHaveBeenCalled())
    expect(mockCreateDistribution).toHaveBeenCalledWith(
      'm-1',
      expect.objectContaining({
        partida: 'gastos',
        kind: 'out',
        amount: 100,
        currency: 'Bs',
        amountBs: 81600,
        rate: 816,
      }),
    )
  })

  it('el traspaso entre partidas sigue siendo USD aunque el pago sea en Bs', async () => {
    const onSaved = vi.fn()
    render(
      <PagoPartidaModal
        monthId="m-1"
        companyId="co-1"
        partida="gastos"
        saldos={saldos}
        onClose={() => {}}
        onSaved={onSaved}
      />,
    )
    fillCommon()
    fireEvent.click(screen.getByRole('button', { name: 'Pagué en Bs' }))
    await waitFor(() => expect(mockResolveRateBcv).toHaveBeenCalled())
    // 122.400 Bs @ 816 = $150 (excede el disponible de gastos, 100).
    fireEvent.change(screen.getAllByRole('spinbutton')[0], { target: { value: '122400' } })

    const ganancia = await screen.findByRole('button', { name: /Ganancia/ })
    fireEvent.click(ganancia)
    fireEvent.click(screen.getByRole('button', { name: 'Registrar pago' }))

    await waitFor(() => expect(onSaved).toHaveBeenCalled())
    const rows = mockCreateDistributionsBatch.mock.calls.at(-1)[1]
    expect(rows[0]).toEqual(expect.objectContaining({ partida: 'ganancia', kind: 'out' }))
    expect(rows[0].currency).toBeUndefined() // no se manda: createDistributionsBatch default a USD
    expect(rows[1]).toEqual(expect.objectContaining({ partida: 'gastos', kind: 'in' }))
    expect(rows[2]).toEqual(
      expect.objectContaining({ partida: 'gastos', kind: 'out', currency: 'Bs', amountBs: 122400 }),
    )
  })
})
