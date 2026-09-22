/**
 * Cubre:
 * - Orden de "Movimientos": deben salir los más recientes primero. Ordenar solo
 *   por `movedOn` (fecha manual, sin hora) deja empatados los movimientos del
 *   mismo día — el desempate debe usar `createdAt`.
 * - Orden de las secciones: Acumulado por partida → Cobros por distribuir →
 *   Movimientos.
 * - Paginación de Movimientos: máximo 30 por página, con controles Anterior/Siguiente.
 */
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { vi } from 'vitest'

vi.mock('../components/finanzas/finanzasApi', () => ({
  loadDistributionsBefore: vi.fn().mockResolvedValue({ data: [], error: null }),
  updateMonthPcts: vi.fn(),
}))

import DistribucionView from '../components/finanzas/DistribucionView'

const finMonth = {
  id: 'm-1',
  closed: false,
  pctGastos: 0.72,
  pctSocios: 0.18,
  pctGanancia: 0.1,
}

function dist({ id, concept, createdAt }) {
  return {
    id,
    monthId: 'm-1',
    partida: 'gastos',
    kind: 'in',
    movedOn: '2026-09-22',
    concept,
    beneficiary: null,
    amount: 100,
    invoiceId: null,
    note: null,
    createdAt,
  }
}

function renderView(distributions) {
  return render(
    <MemoryRouter>
      <DistribucionView
        companyId="co-1"
        year={2026}
        month={9}
        finMonth={finMonth}
        invoices={[]}
        distributions={distributions}
        clients={[]}
        loading={false}
        refetch={() => {}}
        canManage={false}
        canCerrarMes={false}
        canManagePartidas={false}
      />
    </MemoryRouter>,
  )
}

describe('DistribucionView — orden de Movimientos', () => {
  it('con varios movimientos del mismo día, muestra primero el que se creó más tarde', async () => {
    // Cargados en el mismo orden en que llegan de loadDistributions (moved_on asc,
    // que para el mismo día equivale al orden de inserción real).
    const distributions = [
      dist({ id: 'd-1', concept: 'Primero', createdAt: '2026-09-22T10:00:00Z' }),
      dist({ id: 'd-2', concept: 'Segundo', createdAt: '2026-09-22T11:00:00Z' }),
      dist({ id: 'd-3', concept: 'Tercero', createdAt: '2026-09-22T12:00:00Z' }),
    ]
    renderView(distributions)

    const cells = await screen.findAllByText(/Primero|Segundo|Tercero/)
    expect(cells.map((c) => c.textContent)).toEqual(['Tercero', 'Segundo', 'Primero'])
  })
})

describe('DistribucionView — orden de las secciones', () => {
  it('Acumulado por partida va antes que Cobros por distribuir y que Movimientos', async () => {
    renderView([dist({ id: 'd-1', concept: 'Único', createdAt: '2026-09-22T10:00:00Z' })])

    const headings = (
      await screen.findAllByText(/^(Acumulado por partida|Cobros por distribuir|Movimientos)$/)
    ).map((h) => h.textContent)
    expect(headings).toEqual(['Acumulado por partida', 'Cobros por distribuir', 'Movimientos'])
  })
})

describe('DistribucionView — paginación de Movimientos', () => {
  it('muestra máximo 30 filas por página, con controles para avanzar', async () => {
    const distributions = Array.from({ length: 35 }, (_, i) =>
      dist({
        id: `d-${i}`,
        concept: `Movimiento ${i}`,
        createdAt: `2026-09-22T${String(10 + Math.floor(i / 6)).padStart(2, '0')}:${String((i % 6) * 10).padStart(2, '0')}:00Z`,
      }),
    )
    renderView(distributions)

    // i=34 tiene el createdAt más tardío (el más reciente) → debe salir primero.
    await screen.findByText('Movimiento 34')
    // Con 35 movimientos y tope de 30, la primera página debe mostrar solo 30 y
    // dejar el más viejo (Movimiento 0, createdAt más temprano) para la página 2.
    expect(screen.queryByText('Movimiento 0')).not.toBeInTheDocument()
    expect(screen.getAllByText(/^Movimiento \d+$/)).toHaveLength(30)

    expect(screen.getByText('Página 1 de 2 · 35 movimientos')).toBeInTheDocument()
    const anterior = screen.getByRole('button', { name: '‹ Anterior' })
    const siguiente = screen.getByRole('button', { name: 'Siguiente ›' })
    expect(anterior).toBeDisabled()
    expect(siguiente).not.toBeDisabled()

    fireEvent.click(siguiente)
    expect(await screen.findByText('Página 2 de 2 · 35 movimientos')).toBeInTheDocument()
    expect(screen.getByText('Movimiento 0')).toBeInTheDocument()
    expect(siguiente).toBeDisabled()
  })
})
