/**
 * Cubre §8.4: el libro de Caja Bs se filtra por mes para consultar, pero el
 * saldo mostrado es continuo (acumulado); "Ajuste de cuadre" solo aparece con
 * la capability y el mes abierto.
 */
import { render, screen, fireEvent } from '@testing-library/react'
import { vi } from 'vitest'

vi.mock('../components/finanzas/finanzasApi', () => ({
  createFxOperation: vi.fn(),
  upsertRate: vi.fn(),
  createBsAdjustment: vi.fn(),
  deleteFxOperation: vi.fn().mockResolvedValue({ error: null }),
  deleteBsLedgerEntry: vi.fn().mockResolvedValue({ error: null }),
}))
vi.mock('../context/AuthContext', () => ({
  useAuth: () => ({ userProfile: { user_id: 'u-1' } }),
}))

import CajaBsView from '../components/finanzas/CajaBsView'

const finMonth = { id: 'm-2', closed: false }

function ledgerEntry({ id, movedOn, kind, amountBs, source = 'cobro', fxOperationId = null }) {
  return {
    id,
    movedOn,
    kind,
    source,
    amountBs,
    rate: 850,
    amountUsdRef: amountBs / 850,
    fxOperationId,
    concept: `Movimiento ${id}`,
  }
}

const rateBcv = { rate: 850, rateDate: '2026-09-23', source: 'bcv' }

describe('CajaBsView — saldo acumulado y filtro por mes', () => {
  it('el libro filtra por mes pero el saldo mostrado es continuo (acumulado)', () => {
    const bsLedger = [
      // Agosto: entra 500.000 (saldo 500.000).
      ledgerEntry({ id: 'l-ago', movedOn: '2026-08-15', kind: 'in', amountBs: 500000 }),
      // Septiembre: entra 100.000 más (saldo 600.000).
      ledgerEntry({ id: 'l-sep', movedOn: '2026-09-05', kind: 'in', amountBs: 100000 }),
    ]
    render(
      <CajaBsView
        year={2026}
        month={9}
        finMonth={finMonth}
        invoices={[]}
        distributions={[]}
        fxOperations={[]}
        bsLedger={bsLedger}
        rates={[]}
        rateBcv={rateBcv}
        companyId="co-1"
        canManage={true}
        loading={false}
        refetch={() => {}}
      />,
    )

    // Solo se muestra la fila de septiembre (la de agosto queda filtrada)...
    expect(screen.getByText('Movimiento l-sep')).toBeInTheDocument()
    expect(screen.queryByText('Movimiento l-ago')).not.toBeInTheDocument()
    // ...pero su saldo arrastra el acumulado real: 500.000 + 100.000 = 600.000,00
    expect(screen.getByText('600.000,00')).toBeInTheDocument()
  })

  it('sin movimientos en el mes activo, muestra el aviso de vacío', () => {
    render(
      <CajaBsView
        year={2026}
        month={9}
        finMonth={finMonth}
        invoices={[]}
        distributions={[]}
        fxOperations={[]}
        bsLedger={[]}
        rates={[]}
        rateBcv={rateBcv}
        companyId="co-1"
        canManage={true}
        loading={false}
        refetch={() => {}}
      />,
    )
    expect(screen.getByText('Sin movimientos este mes.')).toBeInTheDocument()
  })
})

describe('CajaBsView — gating por capability', () => {
  it('"Ajuste de cuadre" y los botones de divisas se esconden sin canManage', () => {
    render(
      <CajaBsView
        year={2026}
        month={9}
        finMonth={finMonth}
        invoices={[]}
        distributions={[]}
        fxOperations={[]}
        bsLedger={[]}
        rates={[]}
        rateBcv={rateBcv}
        companyId="co-1"
        canManage={false}
        loading={false}
        refetch={() => {}}
      />,
    )
    expect(screen.queryByText('Ajuste de cuadre')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Comprar dólares' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Vender dólares' })).not.toBeInTheDocument()
  })

  it('con el mes cerrado, tampoco se pueden registrar operaciones aunque haya capability', () => {
    render(
      <CajaBsView
        year={2026}
        month={9}
        finMonth={{ id: 'm-2', closed: true }}
        invoices={[]}
        distributions={[]}
        fxOperations={[]}
        bsLedger={[]}
        rates={[]}
        rateBcv={rateBcv}
        companyId="co-1"
        canManage={true}
        loading={false}
        refetch={() => {}}
      />,
    )
    expect(screen.getByText('Este mes está cerrado — solo lectura.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Comprar dólares' })).not.toBeInTheDocument()
  })
})

describe('CajaBsView — borrar movimientos del libro', () => {
  function renderLibro({ bsLedger, canManage = true, fxOperations = [], distributions = [] }) {
    return render(
      <CajaBsView
        year={2026}
        month={9}
        finMonth={finMonth}
        invoices={[]}
        distributions={distributions}
        fxOperations={fxOperations}
        bsLedger={bsLedger}
        rates={[]}
        rateBcv={rateBcv}
        companyId="co-1"
        canManage={canManage}
        loading={false}
        refetch={() => {}}
      />,
    )
  }

  // El diálogo de Finanzas confirma con un solo botón, sin teclear nada.
  async function confirmar() {
    fireEvent.click(await screen.findByText('Eliminar'))
    // Hay dos "Eliminar": el de la fila y el de confirmación del diálogo.
    fireEvent.click(screen.getAllByRole('button', { name: 'Eliminar' }).at(-1))
  }

  /**
   * Regresión del bug reportado: se borraron todos los cobros de septiembre pero la
   * compra de divisas seguía viva (no había forma de borrarla desde la UI), así que
   * el mes quedaba con Caja Bs −637.500, divisa física $708 y resultado por cambio
   * −$42 imposibles de limpiar.
   */
  it('una compra de divisas se borra por su operación fuente, no por la fila del libro', async () => {
    const { deleteFxOperation, deleteBsLedgerEntry } =
      await import('../components/finanzas/finanzasApi')
    deleteFxOperation.mockClear()
    deleteBsLedgerEntry.mockClear()

    renderLibro({
      bsLedger: [
        ledgerEntry({
          id: 'l-fx',
          movedOn: '2026-09-28',
          kind: 'out',
          amountBs: 637500,
          source: 'compra_divisa',
          fxOperationId: 'fx-1',
        }),
      ],
    })
    await confirmar()

    await vi.waitFor(() => expect(deleteFxOperation).toHaveBeenCalledWith('fx-1'))
    // Borrar la fila derivada sola dejaría vivo el resultado por cambio.
    expect(deleteBsLedgerEntry).not.toHaveBeenCalled()
  })

  it('un ajuste de cuadre sí se borra por su propia fila (no tiene fuente)', async () => {
    const { deleteFxOperation, deleteBsLedgerEntry } =
      await import('../components/finanzas/finanzasApi')
    deleteFxOperation.mockClear()
    deleteBsLedgerEntry.mockClear()

    renderLibro({
      bsLedger: [
        ledgerEntry({
          id: 'l-aj',
          movedOn: '2026-09-10',
          kind: 'in',
          amountBs: 1000,
          source: 'ajuste',
        }),
      ],
    })
    await confirmar()

    await vi.waitFor(() => expect(deleteBsLedgerEntry).toHaveBeenCalledWith('l-aj'))
    expect(deleteFxOperation).not.toHaveBeenCalled()
  })

  it('un cobro en Bs no se borra desde acá: remite a Cobros', () => {
    renderLibro({
      bsLedger: [
        ledgerEntry({ id: 'l-cobro', movedOn: '2026-09-23', kind: 'in', amountBs: 637500 }),
      ],
    })
    expect(screen.queryByText('Eliminar')).not.toBeInTheDocument()
    expect(screen.getByText('desde Cobros')).toBeInTheDocument()
  })

  it('un pago directo en Bs remite a Distribución', () => {
    renderLibro({
      bsLedger: [
        ledgerEntry({
          id: 'l-pago',
          movedOn: '2026-09-15',
          kind: 'out',
          amountBs: 5000,
          source: 'pago_directo',
        }),
      ],
    })
    expect(screen.queryByText('Eliminar')).not.toBeInTheDocument()
    expect(screen.getByText('desde Distribución')).toBeInTheDocument()
  })

  it('sin canManage no aparece la columna de acciones', () => {
    renderLibro({
      canManage: false,
      bsLedger: [
        ledgerEntry({
          id: 'l-fx',
          movedOn: '2026-09-28',
          kind: 'out',
          amountBs: 637500,
          source: 'compra_divisa',
          fxOperationId: 'fx-1',
        }),
      ],
    })
    expect(screen.queryByText('Acciones')).not.toBeInTheDocument()
    expect(screen.queryByText('Eliminar')).not.toBeInTheDocument()
  })
})

describe('CajaBsView — badge de tasa vieja', () => {
  it('muestra la fecha de la tasa cuando es stale', () => {
    render(
      <CajaBsView
        year={2026}
        month={9}
        finMonth={finMonth}
        invoices={[]}
        distributions={[]}
        fxOperations={[]}
        bsLedger={[ledgerEntry({ id: 'l-1', movedOn: '2026-09-05', kind: 'in', amountBs: 100000 })]}
        rates={[]}
        rateBcv={{ rate: 800, rateDate: '2026-09-01', source: 'stale' }}
        companyId="co-1"
        canManage={true}
        loading={false}
        refetch={() => {}}
      />,
    )
    expect(screen.getByText(/tasa del 01\/09\/2026/)).toBeInTheDocument()
  })
})
