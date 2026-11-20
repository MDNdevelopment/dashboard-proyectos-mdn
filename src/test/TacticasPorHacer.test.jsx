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
      onOpenBrand={() => {}}
      onViewInBase={() => {}}
      {...props}
    />,
  )
}

describe('TacticasPorHacer', () => {
  it('no renderiza nada si todas las marcas tienen táctica vigente', () => {
    const { container } = renderPorHacer({ brands: [] })
    expect(container).toBeEmptyDOMElement()
  })

  it('cuenta las marcas sin táctica y muestra un logo por marca, en orden alfabético', () => {
    renderPorHacer({ brands: [...brands(3)].reverse() })
    expect(
      screen.getByRole('heading', { name: '3 marcas sin táctica vigente' }),
    ).toBeInTheDocument()
    const logos = screen.getAllByRole('button', { name: /^Ver ficha de/ })
    expect(logos.map((b) => b.getAttribute('aria-label'))).toEqual([
      'Ver ficha de Marca 00',
      'Ver ficha de Marca 01',
      'Ver ficha de Marca 02',
    ])
  })

  it('usa singular con una sola marca', () => {
    renderPorHacer({ brands: brands(1) })
    expect(screen.getByRole('heading', { name: '1 marca sin táctica vigente' })).toBeInTheDocument()
  })

  it('es solo una tarjeta: sin listas ni botones para cargar táctica', () => {
    renderPorHacer()
    expect(screen.queryByRole('button', { name: /Cargar táctica/ })).not.toBeInTheDocument()
    expect(screen.queryByText(/terminó/)).not.toBeInTheDocument()
  })

  it('muestra el logo si la marca lo tiene y la inicial si no', () => {
    const { container } = renderPorHacer({
      brands: [
        { id: 'a', name: 'Alfa', logo_url: 'https://cdn.example.com/alfa.png' },
        { id: 'b', name: 'Beta', logo_url: null },
      ],
    })
    expect(container.querySelector('img')).toHaveAttribute(
      'src',
      'https://cdn.example.com/alfa.png',
    )
    expect(screen.getByText('B')).toBeInTheDocument()
  })

  it('clic en un logo abre la ficha de la marca', async () => {
    const user = userEvent.setup()
    const onOpenBrand = vi.fn()
    renderPorHacer({ onOpenBrand })
    await user.click(screen.getByRole('button', { name: 'Ver ficha de Marca 01' }))
    expect(onOpenBrand).toHaveBeenCalledWith('b1')
  })

  it('"Ver en Base" lleva a la lista completa', async () => {
    const user = userEvent.setup()
    const onViewInBase = vi.fn()
    renderPorHacer({ onViewInBase })
    await user.click(screen.getByRole('button', { name: 'Ver en Base' }))
    expect(onViewInBase).toHaveBeenCalled()
  })

  it('con muchas marcas muestra los primeros logos y un "+N" que lleva a Base', async () => {
    const user = userEvent.setup()
    const onViewInBase = vi.fn()
    renderPorHacer({ brands: brands(30), onViewInBase })
    expect(screen.getAllByRole('button', { name: /^Ver ficha de/ })).toHaveLength(24)
    await user.click(screen.getByRole('button', { name: 'Ver las 6 marcas restantes en Base' }))
    expect(onViewInBase).toHaveBeenCalled()
  })

  it('marca las que tienen un insumo pendiente', () => {
    renderPorHacer({ insumoClientIds: new Set(['b1']) })
    expect(
      screen.getByRole('button', { name: 'Ver ficha de Marca 01 (con insumo)' }),
    ).toBeInTheDocument()
    expect(screen.getByText('Con insumo de la táctica anterior')).toBeInTheDocument()
  })

  it('sin insumos no muestra la leyenda de insumo', () => {
    renderPorHacer()
    expect(screen.queryByText('Con insumo de la táctica anterior')).not.toBeInTheDocument()
  })
})
