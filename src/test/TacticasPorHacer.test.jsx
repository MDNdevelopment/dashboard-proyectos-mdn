import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi } from 'vitest'
import TacticasPorHacer from '../components/ads/tacticas/TacticasPorHacer'

const brands = (n) =>
  Array.from({ length: n }, (_, i) => ({
    id: `b${i}`,
    name: `Marca ${String(i).padStart(2, '0')}`,
    logo_url: null,
  }))

function renderPorHacer(props = {}) {
  return render(
    <TacticasPorHacer
      brands={brands(3)}
      latestByBrand={new Map()}
      canManage
      onCreate={() => {}}
      onOpenBrand={() => {}}
      {...props}
    />,
  )
}

describe('TacticasPorHacer', () => {
  it('no renderiza nada si todas las marcas tienen táctica vigente', () => {
    const { container } = renderPorHacer({ brands: [] })
    expect(container).toBeEmptyDOMElement()
  })

  it('cuenta las marcas pendientes y las lista por orden alfabético', () => {
    renderPorHacer({
      brands: [
        { id: 'z', name: 'Zeta', logo_url: null },
        { id: 'a', name: 'Alfa', logo_url: null },
      ],
    })
    expect(screen.getByText(/Por hacer · 2 marcas sin táctica vigente/)).toBeInTheDocument()
    const items = screen.getAllByRole('listitem')
    expect(items[0]).toHaveTextContent('Alfa')
    expect(items[1]).toHaveTextContent('Zeta')
  })

  it('usa singular con una sola marca', () => {
    renderPorHacer({ brands: brands(1) })
    expect(screen.getByText(/Por hacer · 1 marca sin táctica vigente/)).toBeInTheDocument()
  })

  it('indica cuándo terminó la última táctica, o que no hay ninguna', () => {
    renderPorHacer({
      brands: brands(2),
      latestByBrand: new Map([['b0', { id: 'x', end_date: '2026-10-15' }]]),
    })
    expect(screen.getByText(/Última terminó el/)).toBeInTheDocument()
    expect(screen.getByText('Sin tácticas registradas')).toBeInTheDocument()
  })

  it('"Cargar táctica" abre el formulario con esa marca', async () => {
    const user = userEvent.setup()
    const onCreate = vi.fn()
    renderPorHacer({ onCreate })
    await user.click(screen.getByRole('button', { name: 'Cargar táctica de Marca 01' }))
    expect(onCreate).toHaveBeenCalledWith('b1')
  })

  it('sin ads.manage no ofrece cargar táctica', () => {
    renderPorHacer({ canManage: false })
    expect(screen.queryByRole('button', { name: /Cargar táctica/ })).not.toBeInTheDocument()
  })

  it('clic en la marca abre su ficha', async () => {
    const user = userEvent.setup()
    const onOpenBrand = vi.fn()
    renderPorHacer({ onOpenBrand })
    await user.click(screen.getByText('Marca 02'))
    expect(onOpenBrand).toHaveBeenCalledWith('b2')
  })

  it('con muchas marcas muestra solo las primeras y permite ver todas', async () => {
    const user = userEvent.setup()
    renderPorHacer({ brands: brands(10) })
    expect(screen.getAllByRole('listitem')).toHaveLength(6)

    await user.click(screen.getByRole('button', { name: 'Ver las 10' }))
    expect(screen.getAllByRole('listitem')).toHaveLength(10)

    await user.click(screen.getByRole('button', { name: 'Ver menos' }))
    expect(screen.getAllByRole('listitem')).toHaveLength(6)
  })

  it('marca con "Con insumo" las marcas que tienen un insumo pendiente', () => {
    renderPorHacer({ brands: brands(3), insumoClientIds: new Set(['b1']) })
    expect(screen.getAllByText('Con insumo')).toHaveLength(1)
    expect(screen.getByText('Marca 01').closest('li')).toHaveTextContent('Con insumo')
    expect(screen.getByText('Marca 00').closest('li')).not.toHaveTextContent('Con insumo')
  })

  it('sin insumos no muestra ningún badge', () => {
    renderPorHacer()
    expect(screen.queryByText('Con insumo')).not.toBeInTheDocument()
  })
})
