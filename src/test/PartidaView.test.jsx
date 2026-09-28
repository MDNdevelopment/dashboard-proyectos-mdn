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
  deleteDistribution: vi.fn(),
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
