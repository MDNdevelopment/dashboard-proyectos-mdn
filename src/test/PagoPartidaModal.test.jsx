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

/**
 * La "Categoría" de Gastos es un selector de rubros con descripción, no texto libre:
 * se abre el menú y se elige una opción. Lo que se guarda en `concept` es el nombre
 * del rubro.
 */
function fillCommon() {
  fireEvent.click(screen.getByRole('button', { name: 'Categoría' }))
  fireEvent.click(screen.getByRole('option', { name: /Nómina y personal/ }))
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
        concept: 'Nómina y personal',
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

/**
 * El "¿En qué?" de Gastos pasó de texto libre a una lista cerrada de rubros: el mismo
 * gasto entraba escrito de cinco formas distintas y no se podía agrupar. Socios y
 * Ganancia siguen con texto libre porque ahí el campo es un nombre propio o un
 * detalle, no una clasificación.
 */
describe('PagoPartidaModal — rubro de gasto', () => {
  function renderPara(partida) {
    render(
      <PagoPartidaModal
        monthId="m-1"
        partida={partida}
        saldos={saldos}
        onClose={() => {}}
        onSaved={() => {}}
      />,
    )
  }

  it('Gastos ofrece los 10 rubros, cada uno con su descripción', () => {
    renderPara('gastos')
    fireEvent.click(screen.getByRole('button', { name: 'Categoría' }))

    const opciones = screen.getAllByRole('option')
    expect(opciones).toHaveLength(10)
    expect(opciones[0]).toHaveTextContent('Nómina y personal')
    expect(opciones[0]).toHaveTextContent(/Sueldos, quincenas, bonos/)
    // 'Sin clasificar' es la vía de escape, y va al final.
    expect(opciones.at(-1)).toHaveTextContent('Sin clasificar')
  })

  it('Gastos no acepta texto libre: no hay input de concepto', () => {
    renderPara('gastos')
    expect(screen.queryByPlaceholderText(/nómina de septiembre/i)).not.toBeInTheDocument()
  })

  it('guarda el nombre del rubro en concept, no su key interna', async () => {
    mockCreateDistribution.mockClear()
    renderPara('gastos')
    fireEvent.click(screen.getByRole('button', { name: 'Categoría' }))
    fireEvent.click(screen.getByRole('option', { name: /Conectividad y software/ }))
    fireEvent.change(screen.getByRole('spinbutton'), { target: { value: '50' } })
    fireEvent.click(screen.getByRole('button', { name: 'Registrar pago' }))

    await waitFor(() =>
      expect(mockCreateDistribution).toHaveBeenCalledWith(
        'm-1',
        expect.objectContaining({ concept: 'Conectividad y software' }),
      ),
    )
  })

  it('sin elegir rubro, no registra nada y avisa', async () => {
    mockCreateDistribution.mockClear()
    renderPara('gastos')
    fireEvent.change(screen.getByRole('spinbutton'), { target: { value: '50' } })
    fireEvent.click(screen.getByRole('button', { name: 'Registrar pago' }))

    expect(await screen.findByText('Este campo es obligatorio')).toBeInTheDocument()
    expect(mockCreateDistribution).not.toHaveBeenCalled()
  })

  it('Socios y Ganancia conservan el texto libre', () => {
    renderPara('socios')
    expect(screen.getByPlaceholderText('Ej. Marlon, Paola…')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '¿A qué socio?' })).not.toBeInTheDocument()
  })
})

/**
 * La nota es el detalle libre de ESE pago, aparte de la categoría que lo clasifica.
 * Va a `fin_distributions.note` — la misma columna donde vive el centinela de
 * traspaso, pero la fila del pago nunca lo lleva, así que no hay colisión.
 */
describe('PagoPartidaModal — nota del pago', () => {
  it('guarda la nota en note, junto a la categoría en concept', async () => {
    mockCreateDistribution.mockClear()
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
    fireEvent.change(screen.getByPlaceholderText(/quincena del 15/), {
      target: { value: 'Quincena del 15, Ovidio' },
    })
    fireEvent.change(screen.getByRole('spinbutton'), { target: { value: '50' } })
    fireEvent.click(screen.getByRole('button', { name: 'Registrar pago' }))

    await waitFor(() =>
      expect(mockCreateDistribution).toHaveBeenCalledWith(
        'm-1',
        expect.objectContaining({
          concept: 'Nómina y personal',
          note: 'Quincena del 15, Ovidio',
        }),
      ),
    )
  })

  it('es opcional: sin nota guarda null, no una cadena vacía', async () => {
    mockCreateDistribution.mockClear()
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
    fireEvent.change(screen.getByRole('spinbutton'), { target: { value: '50' } })
    fireEvent.click(screen.getByRole('button', { name: 'Registrar pago' }))

    await waitFor(() =>
      expect(mockCreateDistribution).toHaveBeenCalledWith(
        'm-1',
        expect.objectContaining({ note: null }),
      ),
    )
  })
})
