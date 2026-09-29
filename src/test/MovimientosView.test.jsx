/**
 * Tab Movimientos: el diario consolidado del mes, con orden, filtros y paginado.
 * Es SOLO LECTURA — ningún camino de esta vista puede borrar ni editar.
 *
 * El aplanado en sí (qué fila sale de qué tabla y la deduplicación de las filas que
 * generan los triggers) se testea aparte en `finanzas.test.js` sobre
 * `movimientosDelMes()`; acá se prueba la UI.
 */
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { vi } from 'vitest'

const mockLoadInvoicesUpTo = vi.fn()
const mockLoadDistributionsUpTo = vi.fn()

vi.mock('../components/finanzas/finanzasApi', () => ({
  loadInvoicesUpTo: (...a) => mockLoadInvoicesUpTo(...a),
  loadDistributionsUpTo: (...a) => mockLoadDistributionsUpTo(...a),
}))
vi.mock('../context/AuthContext', () => ({
  useAuth: () => ({ userProfile: { user_id: 'u-1' } }),
}))

import MovimientosView from '../components/finanzas/MovimientosView'

const finMonth = { id: 'm-1', closed: false }

function dist({ id, movedOn, kind = 'out', partida = 'gastos', concept, amount, ...rest }) {
  return { id, movedOn, kind, partida, concept: concept ?? id, amount, currency: 'USD', ...rest }
}

function renderView({
  invoices = [],
  distributions = [],
  fxOperations = [],
  bsLedger = [],
  month = 9,
  ...rest
} = {}) {
  mockLoadInvoicesUpTo.mockResolvedValue({ data: invoices, error: null })
  mockLoadDistributionsUpTo.mockResolvedValue({ data: distributions, error: null })
  return render(
    <MovimientosView
      companyId="co-1"
      year={2026}
      month={month}
      finMonth={finMonth}
      fxOperations={fxOperations}
      bsLedger={bsLedger}
      loading={false}
      {...rest}
    />,
  )
}

/** Los conceptos de las filas visibles, en el orden en que se pintan. */
function conceptosVisibles() {
  return screen
    .getAllByRole('row')
    .slice(1) // la primera es el thead
    .map((tr) => tr.children[3].textContent)
}

const COBRO_USD = {
  id: 'inv-1',
  clientName: 'Nuvitt',
  concept: 'Gestión de redes',
  amount: 700,
  currency: 'USD',
  payments: [{ id: 'p-1', paidOn: '2026-09-05', amount: 700, createdAt: '2026-09-05T10:00:00Z' }],
}

const COBRO_BS = {
  id: 'inv-2',
  clientName: 'Drink Cola',
  concept: 'Pauta',
  amount: 500,
  currency: 'USD',
  payments: [
    {
      id: 'p-2',
      paidOn: '2026-09-08',
      amount: 500,
      amountBs: 428502.9,
      rate: 857.0058,
      createdAt: '2026-09-08T10:00:00Z',
    },
  ],
}

const PAGO = dist({
  id: 'd-pago',
  movedOn: '2026-09-20',
  concept: 'Pago proveedor',
  amount: 300,
  createdAt: '2026-09-20T10:00:00Z',
})

describe('MovimientosView — carga y estados', () => {
  it('pide invoices y distributions ACUMULADOS hasta el mes (no solo los del mes)', async () => {
    renderView()
    await waitFor(() => expect(mockLoadInvoicesUpTo).toHaveBeenCalledWith('co-1', 2026, 9))
    expect(mockLoadDistributionsUpTo).toHaveBeenCalledWith('co-1', 2026, 9)
  })

  it('sin movimientos en el mes, muestra el aviso de vacío', async () => {
    renderView()
    expect(await screen.findByText('Sin movimientos este mes.')).toBeInTheDocument()
  })

  it('con loading muestra "Cargando…"', () => {
    renderView({ loading: true })
    expect(screen.getByText('Cargando…')).toBeInTheDocument()
  })

  it('sin mes abierto remite a Facturación, que lo prepara sola', async () => {
    renderView({ finMonth: null })
    expect(await screen.findByText(/Entra a Facturación y se prepara solo/)).toBeInTheDocument()
  })

  it('un mes cargado como resumen no tiene movimientos fila por fila', async () => {
    renderView({ finMonth: { id: 'm-1', summaryOnly: true } })
    expect(await screen.findByText(/se cargó como resumen/)).toBeInTheDocument()
  })
})

describe('MovimientosView — orden', () => {
  it('por defecto ordena por fecha, de más reciente a más antigua', async () => {
    renderView({ invoices: [COBRO_USD, COBRO_BS], distributions: [PAGO] })
    await waitFor(() => expect(screen.getByText('Pago proveedor')).toBeInTheDocument())
    expect(conceptosVisibles()).toEqual(['Pago proveedor', 'Pauta', 'Gestión de redes'])
  })

  it('ordenar por Monto (USD) usa el monto firmado: los pagos quedan abajo', async () => {
    renderView({ invoices: [COBRO_USD, COBRO_BS], distributions: [PAGO] })
    await waitFor(() => expect(screen.getByText('Pago proveedor')).toBeInTheDocument())

    // Primer click: ascendente → el pago (−300) primero, luego 500 y 700.
    fireEvent.click(screen.getByText('Monto (USD)'))
    expect(conceptosVisibles()).toEqual(['Pago proveedor', 'Pauta', 'Gestión de redes'])

    // Segundo click en la misma columna: invierte.
    fireEvent.click(screen.getByText('Monto (USD)'))
    expect(conceptosVisibles()).toEqual(['Gestión de redes', 'Pauta', 'Pago proveedor'])
  })

  it('marca la columna activa con aria-sort', async () => {
    renderView({ invoices: [COBRO_USD] })
    await waitFor(() => expect(screen.getByText('Gestión de redes')).toBeInTheDocument())
    expect(screen.getByText('Fecha').closest('th')).toHaveAttribute('aria-sort', 'descending')
    expect(screen.getByText('Concepto').closest('th')).toHaveAttribute('aria-sort', 'none')
  })
})

describe('MovimientosView — filtros', () => {
  const setup = () =>
    renderView({
      invoices: [COBRO_USD, COBRO_BS],
      distributions: [
        PAGO,
        dist({
          id: 'd-asig',
          movedOn: '2026-09-02',
          kind: 'in',
          concept: 'Asignación a Gastos',
          amount: 720,
          createdAt: '2026-09-02T10:00:00Z',
        }),
      ],
    })

  it('el filtro de tipo deja solo ese tipo', async () => {
    setup()
    await waitFor(() => expect(screen.getByText('Pago proveedor')).toBeInTheDocument())

    fireEvent.change(screen.getByLabelText('Tipo'), { target: { value: 'cobro' } })
    expect(conceptosVisibles()).toEqual(['Pauta', 'Gestión de redes'])
    expect(screen.getByText('2 movimientos de 4')).toBeInTheDocument()
  })

  it('el filtro de moneda separa lo que entró en bolívares', async () => {
    setup()
    await waitFor(() => expect(screen.getByText('Pago proveedor')).toBeInTheDocument())

    fireEvent.change(screen.getByLabelText('Moneda'), { target: { value: 'Bs' } })
    expect(conceptosVisibles()).toEqual(['Pauta'])
  })

  it('el filtro de partida distingue "Sin partida" de una partida concreta', async () => {
    setup()
    await waitFor(() => expect(screen.getByText('Pago proveedor')).toBeInTheDocument())

    // Los cobros no tienen partida.
    fireEvent.change(screen.getByLabelText('Partida'), { target: { value: 'none' } })
    expect(conceptosVisibles()).toEqual(['Pauta', 'Gestión de redes'])

    fireEvent.change(screen.getByLabelText('Partida'), { target: { value: 'gastos' } })
    expect(conceptosVisibles()).toEqual(['Pago proveedor', 'Asignación a Gastos'])
  })

  it('el filtro de flujo separa el dinero real de los movimientos internos', async () => {
    setup()
    await waitFor(() => expect(screen.getByText('Pago proveedor')).toBeInTheDocument())

    fireEvent.change(screen.getByLabelText('Flujo'), { target: { value: 'real' } })
    expect(conceptosVisibles()).toEqual(['Pago proveedor', 'Pauta', 'Gestión de redes'])

    fireEvent.change(screen.getByLabelText('Flujo'), { target: { value: 'interno' } })
    expect(conceptosVisibles()).toEqual(['Asignación a Gastos'])
  })

  it('la búsqueda libre matchea concepto y contraparte', async () => {
    setup()
    await waitFor(() => expect(screen.getByText('Pago proveedor')).toBeInTheDocument())

    fireEvent.change(screen.getByLabelText('Buscar'), {
      target: { value: 'drink' },
    })
    expect(conceptosVisibles()).toEqual(['Pauta'])
  })

  it('"Limpiar" aparece solo con filtros activos y los restaura', async () => {
    setup()
    await waitFor(() => expect(screen.getByText('Pago proveedor')).toBeInTheDocument())
    expect(screen.queryByText('Limpiar')).not.toBeInTheDocument()

    fireEvent.change(screen.getByLabelText('Tipo'), { target: { value: 'cobro' } })
    fireEvent.click(screen.getByText('Limpiar'))
    expect(conceptosVisibles()).toHaveLength(4)
    expect(screen.queryByText('Limpiar')).not.toBeInTheDocument()
  })

  it('filtrar a cero distingue "sin resultados" de "sin movimientos este mes"', async () => {
    setup()
    await waitFor(() => expect(screen.getByText('Pago proveedor')).toBeInTheDocument())

    fireEvent.change(screen.getByLabelText('Buscar'), {
      target: { value: 'zzz' },
    })
    expect(screen.getByText('Sin resultados para los filtros aplicados.')).toBeInTheDocument()
    expect(screen.queryByText('Sin movimientos este mes.')).not.toBeInTheDocument()
  })

  /**
   * Las cards son del MES, no de la selección: si cambiaran al filtrar, el usuario
   * leería "el mes ingresó $700" tras filtrar un cliente.
   */
  it('las cards de totales NO cambian al filtrar', async () => {
    setup()
    await waitFor(() => expect(screen.getByText('Pago proveedor')).toBeInTheDocument())
    // Cobrado 700 + 500 = 1.200; pagado 300 (la asignación de 720 es interna).
    expect(screen.getByText('$1,200.00')).toBeInTheDocument()
    expect(screen.getByText('$900.00')).toBeInTheDocument() // neto

    fireEvent.change(screen.getByLabelText('Tipo'), { target: { value: 'pago' } })
    expect(screen.getByText('$1,200.00')).toBeInTheDocument()
    expect(screen.getByText('$900.00')).toBeInTheDocument()
  })
})

describe('MovimientosView — paginado', () => {
  const muchos = Array.from({ length: 35 }, (_, i) =>
    dist({
      id: `d-${i}`,
      movedOn: `2026-09-${String((i % 28) + 1).padStart(2, '0')}`,
      concept: `Movimiento ${i}`,
      amount: 10 + i,
      createdAt: `2026-09-01T00:${String(i).padStart(2, '0')}:00Z`,
    }),
  )

  it('muestra 30 por página y avanza a la siguiente', async () => {
    renderView({ distributions: muchos })
    await waitFor(() =>
      expect(screen.getByText('Página 1 de 2 · 35 movimientos')).toBeInTheDocument(),
    )
    expect(conceptosVisibles()).toHaveLength(30)

    fireEvent.click(screen.getByRole('button', { name: 'Siguiente ›' }))
    expect(conceptosVisibles()).toHaveLength(5)
    expect(screen.getByText('Página 2 de 2 · 35 movimientos')).toBeInTheDocument()
  })

  it('al cambiar un filtro vuelve a la página 1 (si no, la tabla saldría vacía)', async () => {
    renderView({ distributions: muchos })
    await waitFor(() =>
      expect(screen.getByText('Página 1 de 2 · 35 movimientos')).toBeInTheDocument(),
    )

    fireEvent.click(screen.getByRole('button', { name: 'Siguiente ›' }))
    expect(screen.getByText('Página 2 de 2 · 35 movimientos')).toBeInTheDocument()

    fireEvent.change(screen.getByLabelText('Tipo'), { target: { value: 'pago' } })
    expect(conceptosVisibles()).toHaveLength(30)
  })
})

describe('MovimientosView — solo lectura', () => {
  it('no ofrece ninguna acción de borrado ni edición', async () => {
    renderView({
      invoices: [COBRO_USD, COBRO_BS],
      distributions: [PAGO],
      fxOperations: [
        {
          id: 'fx-1',
          opType: 'compra',
          movedOn: '2026-09-28',
          amountBs: 637500,
          amountUsd: 708,
          rateReal: 900.42,
          rateBcv: 850,
        },
      ],
      bsLedger: [
        {
          id: 'l-aj',
          movedOn: '2026-09-10',
          kind: 'in',
          source: 'ajuste',
          amountBs: 1700,
          rate: 850,
          amountUsdRef: 2,
          concept: 'Intereses',
        },
      ],
    })
    await waitFor(() => expect(screen.getByText('Pago proveedor')).toBeInTheDocument())

    expect(screen.queryByText('Eliminar')).not.toBeInTheDocument()
    expect(screen.queryByText('Editar')).not.toBeInTheDocument()
    expect(screen.queryByText('Acciones')).not.toBeInTheDocument()
    expect(screen.queryByText('Quitar')).not.toBeInTheDocument()
  })

  it('una compra de divisas se ve como una sola fila, con su resultado por cambio', async () => {
    renderView({
      fxOperations: [
        {
          id: 'fx-1',
          opType: 'compra',
          movedOn: '2026-09-28',
          amountBs: 637500,
          amountUsd: 708,
          rateReal: 900.42,
          rateBcv: 850,
          purpose: 'Nómina',
        },
      ],
      distributions: [
        {
          id: 'd-cambio',
          partida: 'cambio',
          kind: 'out',
          movedOn: '2026-09-28',
          concept: 'Resultado por cambio · compra',
          amount: 42,
          currency: 'USD',
          fxOperationId: 'fx-1',
        },
      ],
      bsLedger: [
        {
          id: 'l-fx',
          movedOn: '2026-09-28',
          kind: 'out',
          source: 'compra_divisa',
          amountBs: 637500,
          rate: 900.42,
          amountUsdRef: 708,
          fxOperationId: 'fx-1',
          concept: 'Compra de divisas',
        },
      ],
    })
    await waitFor(() => expect(screen.getByText('1 movimiento')).toBeInTheDocument())
    // La columna Tipo dice "Compra de divisas"; el concepto es el destino del dinero,
    // no repite el tipo.
    // "Compra de divisas" también está en el <option> del filtro: se mira la celda.
    const celdas = screen.getAllByRole('row')[1].children
    expect(celdas[1]).toHaveTextContent('Compra de divisas')
    expect(celdas[3]).toHaveTextContent('Nómina')
    expect(celdas[3]).toHaveTextContent('Resultado por cambio − $42.00')
    expect(screen.getByText('Divisa + Caja Bs')).toBeInTheDocument()
    // Los $708 entran a la divisa física y los 637.500 Bs salen de la Caja Bs.
    expect(celdas[5]).toHaveTextContent('$708.00')
    expect(celdas[6]).toHaveTextContent('− 637.500,00 Bs')
  })
})

describe('MovimientosView — nota del movimiento', () => {
  const PAGO_CON_NOTA = dist({
    id: 'd-nota',
    movedOn: '2026-09-18',
    concept: 'Nómina y personal',
    amount: 200,
    note: 'Quincena del 15, Ovidio',
    createdAt: '2026-09-18T10:00:00Z',
  })

  it('muestra la nota bajo el concepto', async () => {
    renderView({ distributions: [PAGO_CON_NOTA] })
    await waitFor(() => expect(screen.getByText('Nómina y personal')).toBeInTheDocument())
    expect(screen.getByText('Quincena del 15, Ovidio')).toBeInTheDocument()
  })

  it('la búsqueda también matchea la nota', async () => {
    renderView({ distributions: [PAGO_CON_NOTA, PAGO] })
    await waitFor(() => expect(screen.getByText('Pago proveedor')).toBeInTheDocument())

    fireEvent.change(screen.getByLabelText('Buscar'), { target: { value: 'ovidio' } })
    expect(conceptosVisibles()).toEqual(['Nómina y personalQuincena del 15, Ovidio'])
  })

  it('el centinela de traspaso no se muestra como nota', async () => {
    renderView({
      distributions: [
        dist({
          id: 'd-tras',
          movedOn: '2026-09-12',
          concept: 'Traspaso a Gastos',
          amount: 100,
          note: 'traspaso_entre_partidas',
          createdAt: '2026-09-12T10:00:00Z',
        }),
      ],
    })
    await waitFor(() => expect(screen.getByText('Traspaso a Gastos')).toBeInTheDocument())
    expect(screen.queryByText('traspaso_entre_partidas')).not.toBeInTheDocument()
  })
})
