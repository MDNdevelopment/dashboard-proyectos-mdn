/**
 * Cubre el drill-down de partida (/finanzas/distribucion/:partida):
 * - Regresión: "Registrar pago" debía pasarle `saldos` (objeto por partida) a
 *   PagoPartidaModal, no `saldoDisponible` (un número) — antes de este fix
 *   `saldos[partida]` lanzaba TypeError al abrir el modal desde acá.
 * - La partida técnica 'cambio' se muestra en solo lectura: sin botón de pago.
 */
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { vi } from 'vitest'

vi.mock('../components/finanzas/finanzasApi', () => ({
  loadDistributionsBefore: vi.fn().mockResolvedValue({ data: [], error: null }),
  deleteDistribution: vi.fn().mockResolvedValue({ error: null }),
  deleteFxOperation: vi.fn().mockResolvedValue({ error: null }),
}))
vi.mock('../context/AuthContext', () => ({
  useAuth: () => ({ userProfile: { user_id: 'u-1' } }),
}))

import PartidaView from '../components/finanzas/PartidaView'

const finMonth = { id: 'm-1', closed: false, pctGastos: 0.72, pctSocios: 0.18, pctGanancia: 0.1 }

function renderView(partida, distributions = []) {
  return render(
    <MemoryRouter>
      <PartidaView
        companyId="co-1"
        year={2026}
        month={9}
        monthStr="2026-09"
        finMonth={finMonth}
        distributions={distributions}
        partida={partida}
        canManage={true}
        refetch={() => {}}
      />
    </MemoryRouter>,
  )
}

describe('PartidaView — abrir "Registrar pago" desde el drill-down', () => {
  it('no lanza al abrir el modal (regresión del prop saldos vs saldoDisponible)', async () => {
    renderView('gastos')
    const boton = await screen.findByText('+ Registrar pago')
    expect(() => fireEvent.click(boton)).not.toThrow()
    // El modal debe abrir mostrando el disponible de la partida activa.
    expect(await screen.findByText(/Registrar pago · Gastos operativos/)).toBeInTheDocument()
  })
})

describe('PartidaView — partida técnica "cambio" en solo lectura', () => {
  it('no muestra el botón de "Registrar pago"', async () => {
    renderView('cambio')
    expect(await screen.findByText(/Partida técnica/)).toBeInTheDocument()
    expect(screen.queryByText('+ Registrar pago')).not.toBeInTheDocument()
  })
})

describe('PartidaView — borrar un "Resultado por cambio" borra su operación de divisas', () => {
  const filaCambio = {
    id: 'd-cambio',
    partida: 'cambio',
    kind: 'out',
    movedOn: '2026-09-28',
    concept: 'Resultado por cambio · compra',
    amount: 42,
    fxOperationId: 'fx-1',
  }

  it('borra la operación de divisas (fuente), no solo la fila de la partida', async () => {
    const { deleteFxOperation, deleteDistribution } =
      await import('../components/finanzas/finanzasApi')
    deleteFxOperation.mockClear()
    deleteDistribution.mockClear()

    renderView('cambio', [filaCambio])
    fireEvent.click(await screen.findByText('Eliminar'))
    // El diálogo de Finanzas confirma con un solo botón, sin teclear nada.
    // Hay dos "Eliminar": el de la fila y el de confirmación del diálogo.
    fireEvent.click(screen.getAllByRole('button', { name: 'Eliminar' }).at(-1))

    await vi.waitFor(() => expect(deleteFxOperation).toHaveBeenCalledWith('fx-1'))
    // Si se borrara solo la distribución, la compra y su movimiento de Caja Bs
    // quedarían vivos y el cuadre nunca volvería a cero.
    expect(deleteDistribution).not.toHaveBeenCalled()
  })

  it('un movimiento normal (sin operación de divisas) sí borra la distribución', async () => {
    const { deleteFxOperation, deleteDistribution } =
      await import('../components/finanzas/finanzasApi')
    deleteFxOperation.mockClear()
    deleteDistribution.mockClear()

    const pago = {
      id: 'd-1',
      partida: 'gastos',
      kind: 'out',
      movedOn: '2026-09-10',
      concept: 'Pago de nómina',
      amount: 100,
      fxOperationId: null,
    }
    renderView('gastos', [pago])
    fireEvent.click(await screen.findByText('Eliminar'))
    // Hay dos "Eliminar": el de la fila y el de confirmación del diálogo.
    fireEvent.click(screen.getAllByRole('button', { name: 'Eliminar' }).at(-1))

    await vi.waitFor(() => expect(deleteDistribution).toHaveBeenCalledWith('d-1'))
    expect(deleteFxOperation).not.toHaveBeenCalled()
  })
})
