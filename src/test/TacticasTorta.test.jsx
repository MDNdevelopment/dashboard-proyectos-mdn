import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi } from 'vitest'
import TacticasTorta from '../components/ads/tacticas/TacticasTorta'
import { brandCoverage } from '../utils/tacticas'

const TODAY = '2026-11-19'

const brands = [
  { id: 'b1', name: 'Urgentísima', line_id: 'l1' },
  { id: 'b2', name: 'Por Vencer', line_id: 'l1' },
  { id: 'b3', name: 'Tranquila', line_id: 'l2' },
  { id: 'b4', name: 'Zeta Sin Nada', line_id: 'l2' },
  { id: 'b5', name: 'Alfa Sin Nada', line_id: 'l2' },
]
const linesById = new Map([
  ['l1', { id: 'l1', name: 'Team Sabrina', lead_user_id: 'u1' }],
  ['l2', { id: 'l2', name: 'Team Bianca', lead_user_id: 'u2' }],
])

const camp = (over = {}) => ({
  id: 'c1',
  name: 'Plan',
  client_id: 'b1',
  status: 'En Curso',
  start_date: '2026-11-01',
  end_date: '2026-11-21',
  created_at: '2026-11-01T10:00:00Z',
  checklist: [],
  ...over,
})

const campaigns = [
  camp({ id: 'c1', name: 'Plan urgente', client_id: 'b1', end_date: '2026-11-21' }), // 2 días
  camp({ id: 'c2', name: 'Plan por vencer', client_id: 'b2', end_date: '2026-11-27' }), // 8 días
  camp({ id: 'c3', name: 'Plan tranquilo', client_id: 'b3', end_date: '2026-12-31' }), // 42 días
  camp({ id: 'c4', name: 'Plan viejo', client_id: 'b4', status: 'Finalizado' }),
]

function renderTorta(props = {}) {
  return render(
    <TacticasTorta
      brands={brands}
      campaigns={campaigns}
      today={TODAY}
      stats={{ vigentes: 3, avgPct: 40 }}
      linesById={linesById}
      onGoToBase={() => {}}
      {...props}
    />,
  )
}

describe('brandCoverage', () => {
  it('agrupa cada marca por su vigente que vence primero', () => {
    const g = brandCoverage(brands, campaigns, TODAY)
    expect(g.red.map((r) => r.brand.id)).toEqual(['b1'])
    expect(g.yellow.map((r) => r.brand.id)).toEqual(['b2'])
    expect(g.green.map((r) => r.brand.id)).toEqual(['b3'])
    // Las sin táctica van por nombre; una Finalizada no cubre a la marca.
    expect(g.none.map((r) => r.brand.name)).toEqual(['Alfa Sin Nada', 'Zeta Sin Nada'])
  })

  it('con varias vigentes, manda la que vence primero', () => {
    const g = brandCoverage(
      [brands[0]],
      [
        camp({ id: 'larga', end_date: '2027-01-31' }),
        camp({ id: 'corta', end_date: '2026-11-20' }),
      ],
      TODAY,
    )
    expect(g.red[0].campaign.id).toBe('corta')
    expect(g.red[0].days).toBe(1)
  })

  it('una táctica programada cubre a la marca y lo indica', () => {
    const g = brandCoverage(
      [brands[0]],
      [camp({ start_date: '2026-12-01', end_date: '2027-01-31' })],
      TODAY,
    )
    expect(g.green[0].programada).toBe(true)
    expect(g.none).toHaveLength(0)
  })

  it('dentro de un grupo ordena por los días que quedan e ignora tácticas sin marca', () => {
    const g = brandCoverage(
      brands.slice(0, 2),
      [
        camp({ id: 'a', client_id: 'b1', end_date: '2026-12-31' }),
        camp({ id: 'b', client_id: 'b2', end_date: '2026-12-15' }),
        camp({ id: 'x', client_id: null, end_date: '2026-11-20' }),
      ],
      TODAY,
    )
    expect(g.green.map((r) => r.campaign.id)).toEqual(['b', 'a'])
    expect(g.red).toHaveLength(0)
  })
})

describe('TacticasTorta', () => {
  it('resume marcas, tácticas vigentes y cumplimiento; la torta dice cuántas están cubiertas', () => {
    renderTorta()
    const resumen = screen.getByRole('region', { name: 'Resumen de tácticas' })
    expect(resumen).toHaveTextContent('5 marcas · 3 tácticas vigentes · cumplimiento promedio 40%')
    expect(
      screen.getByRole('img', { name: '3 de 5 marcas con táctica vigente' }),
    ).toBeInTheDocument()
  })

  it('la leyenda va en orden Al día, Sin táctica, Por vencer, Urgente, con su conteo', () => {
    renderTorta()
    const legend = screen.getByRole('group', { name: 'Grupos' })
    const items = within(legend).getAllByRole('button')
    expect(items.map((b) => b.textContent)).toEqual([
      'Al día1',
      'Sin táctica2',
      'Por vencer1',
      'Urgente1',
    ])
  })

  it('ya no lista las marcas al lado de la torta: esa lista vive en Base', () => {
    renderTorta()
    expect(screen.queryByText('Urgentísima')).not.toBeInTheDocument()
    expect(screen.queryByText('Plan urgente')).not.toBeInTheDocument()
  })

  it('clic en la leyenda lleva a Base con el estado de ese grupo', async () => {
    const user = userEvent.setup()
    const onGoToBase = vi.fn()
    renderTorta({ onGoToBase })
    const legend = screen.getByRole('group', { name: 'Grupos' })

    await user.click(within(legend).getByRole('button', { name: /Urgente/ }))
    expect(onGoToBase).toHaveBeenLastCalledWith('urgentes')
    await user.click(within(legend).getByRole('button', { name: /Sin táctica/ }))
    expect(onGoToBase).toHaveBeenLastCalledWith('sin_tactica')
    await user.click(within(legend).getByRole('button', { name: /Al día/ }))
    expect(onGoToBase).toHaveBeenLastCalledWith('al_dia')
    await user.click(within(legend).getByRole('button', { name: /Por vencer/ }))
    expect(onGoToBase).toHaveBeenLastCalledWith('por_vencer')
  })

  it('clic en una porción de la torta también lleva a Base', async () => {
    const user = userEvent.setup()
    const onGoToBase = vi.fn()
    const { container } = renderTorta({ onGoToBase })
    const big = screen.getByRole('img', { name: '3 de 5 marcas con táctica vigente' })
    const urgente = [...big.querySelectorAll('path')].find(
      (p) => p.querySelector('title')?.textContent === 'Urgente: 1',
    )
    expect(container).toContainElement(urgente)
    await user.click(urgente)
    expect(onGoToBase).toHaveBeenCalledWith('urgentes')
  })

  it('un grupo vacío no se puede elegir', () => {
    renderTorta({ campaigns: campaigns.filter((c) => c.id !== 'c1') })
    const legend = screen.getByRole('group', { name: 'Grupos' })
    expect(within(legend).getByRole('button', { name: /Urgente/ })).toBeDisabled()
  })

  describe('una torta chica por team', () => {
    it('muestra cada team con sus marcas cubiertas', () => {
      renderTorta()
      const sabrina = screen.getByRole('group', { name: 'Team Team Sabrina' })
      expect(
        within(sabrina).getByRole('img', {
          name: 'Team Sabrina: 2 de 2 marcas con táctica vigente',
        }),
      ).toBeInTheDocument()
      const bianca = screen.getByRole('group', { name: 'Team Team Bianca' })
      expect(
        within(bianca).getByRole('img', { name: 'Team Bianca: 1 de 3 marcas con táctica vigente' }),
      ).toBeInTheDocument()
      expect(
        within(bianca).getByRole('button', { name: 'Sin táctica de Team Bianca: 2' }),
      ).toBeInTheDocument()
    })

    it('clic en un color del team lleva a Base con ese estado y ese team', async () => {
      const user = userEvent.setup()
      const onGoToBase = vi.fn()
      renderTorta({ onGoToBase })
      await user.click(screen.getByRole('button', { name: 'Sin táctica de Team Bianca: 2' }))
      expect(onGoToBase).toHaveBeenCalledWith('sin_tactica', 'l2')
    })

    it('clic en el nombre del team lleva a Base con todas sus tácticas', async () => {
      const user = userEvent.setup()
      const onGoToBase = vi.fn()
      renderTorta({ onGoToBase })
      await user.click(screen.getByRole('button', { name: 'Ver tácticas de Team Sabrina en Base' }))
      expect(onGoToBase).toHaveBeenCalledWith('todas', 'l1')
    })

    it('con un solo team no repite la torta chica', () => {
      renderTorta({ brands: brands.filter((b) => b.line_id === 'l1') })
      expect(screen.queryByText('Por team')).not.toBeInTheDocument()
    })
  })

  describe('filtrado por un team', () => {
    // Team Bianca: Tranquila al día y dos marcas sin táctica.
    const soloBianca = () => renderTorta({ brands: brands.filter((b) => b.line_id === 'l2') })

    it('abre la leyenda en tarjetas grandes con el nombre del team, conteo y %', () => {
      soloBianca()
      expect(screen.getByText('Team Team Bianca')).toBeInTheDocument()
      const cards = within(screen.getByRole('group', { name: 'Grupos' })).getAllByRole('button')
      expect(cards).toHaveLength(4)
      expect(cards[0]).toHaveTextContent('Al día')
      expect(cards[0]).toHaveTextContent('1marca · 33%')
      expect(cards[1]).toHaveTextContent('Sin táctica')
      expect(cards[1]).toHaveTextContent('2marcas · 67%')
      expect(cards[1]).toHaveTextContent('Ver en Base')
    })

    it('las tarjetas vacías se deshabilitan y las otras llevan a Base', async () => {
      const user = userEvent.setup()
      const onGoToBase = vi.fn()
      renderTorta({ brands: brands.filter((b) => b.line_id === 'l2'), onGoToBase })
      const grupos = screen.getByRole('group', { name: 'Grupos' })
      expect(within(grupos).getByRole('button', { name: /Urgente/ })).toBeDisabled()

      await user.click(within(grupos).getByRole('button', { name: /Sin táctica/ }))
      expect(onGoToBase).toHaveBeenCalledWith('sin_tactica')
    })
  })

  it('sin marcas avisa en vez de dibujar una torta vacía', () => {
    renderTorta({ brands: [] })
    expect(screen.getByText('No hay marcas en esta línea')).toBeInTheDocument()
    expect(screen.queryByRole('img')).not.toBeInTheDocument()
  })
})
