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
const clientsById = new Map(brands.map((b) => [b.id, b]))
const usersMap = new Map([
  ['u1', 'Sabrina'],
  ['u2', 'Bianca'],
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
      clientsById={clientsById}
      linesById={linesById}
      usersMap={usersMap}
      canManage
      onSelect={() => {}}
      onCreate={() => {}}
      onOpenBrand={() => {}}
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
    ).toHaveTextContent('3/5')
  })

  it('la leyenda cuenta cada grupo y arranca en el más urgente', () => {
    renderTorta()
    const grupos = screen.getByRole('group', { name: 'Grupos' })
    expect(within(grupos).getByRole('button', { name: /Urgente/ })).toHaveTextContent('1')
    expect(within(grupos).getByRole('button', { name: /Por vencer/ })).toHaveTextContent('1')
    expect(within(grupos).getByRole('button', { name: /Al día/ })).toHaveTextContent('1')
    expect(within(grupos).getByRole('button', { name: /Sin táctica/ })).toHaveTextContent('2')
    expect(within(grupos).getByRole('button', { name: /Urgente/ })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    expect(screen.getByRole('button', { name: /^Urgentísima/ })).toHaveTextContent('2 días')
  })

  it('cada marca muestra su táctica, línea y jefa, y abre la táctica al hacer clic', async () => {
    const user = userEvent.setup()
    const onSelect = vi.fn()
    renderTorta({ onSelect })
    const row = screen.getByRole('button', { name: /^Urgentísima/ })
    expect(row).toHaveTextContent('Plan urgente · Team Sabrina · Jefa: Sabrina')
    await user.click(row)
    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ id: 'c1' }))
  })

  it('clic en la leyenda cambia el grupo de la lista', async () => {
    const user = userEvent.setup()
    renderTorta()
    await user.click(screen.getByRole('button', { name: /Al día/ }))
    expect(screen.getByRole('button', { name: /^Tranquila/ })).toHaveTextContent('42 días')
    expect(screen.queryByRole('button', { name: /^Urgentísima/ })).not.toBeInTheDocument()
  })

  it('clic en una porción de la torta también elige el grupo', async () => {
    const user = userEvent.setup()
    const { container } = renderTorta()
    const yellow = container.querySelector('path[fill="#FFB800"]')
    await user.click(yellow)
    expect(screen.getByRole('button', { name: /Por vencer/ })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    expect(screen.getByRole('button', { name: /^Por Vencer/ })).toBeInTheDocument()
  })

  it('una marca sin táctica abre el formulario para cargarla (con ads.manage)', async () => {
    const user = userEvent.setup()
    const onCreate = vi.fn()
    renderTorta({ onCreate })
    await user.click(screen.getByRole('button', { name: /Sin táctica/ }))
    const row = screen.getByRole('button', { name: /^Alfa Sin Nada/ })
    expect(row).toHaveTextContent('Cargar')
    await user.click(row)
    expect(onCreate).toHaveBeenCalledWith('b5')
  })

  it('sin ads.manage, una marca sin táctica abre su ficha', async () => {
    const user = userEvent.setup()
    const onOpenBrand = vi.fn()
    const onCreate = vi.fn()
    renderTorta({ canManage: false, onOpenBrand, onCreate })
    await user.click(screen.getByRole('button', { name: /Sin táctica/ }))
    await user.click(screen.getByRole('button', { name: /^Alfa Sin Nada/ }))
    expect(onOpenBrand).toHaveBeenCalledWith('b5')
    expect(onCreate).not.toHaveBeenCalled()
  })

  it('un grupo vacío no se puede elegir', () => {
    renderTorta({ campaigns: [] })
    const grupos = screen.getByRole('group', { name: 'Grupos' })
    expect(within(grupos).getByRole('button', { name: /Urgente/ })).toBeDisabled()
    // Sin ninguna vigente, arranca en "Sin táctica".
    expect(within(grupos).getByRole('button', { name: /Sin táctica/ })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    expect(
      screen.getByRole('img', { name: '0 de 5 marcas con táctica vigente' }),
    ).toBeInTheDocument()
  })

  it('una programada se rotula como tal', async () => {
    const user = userEvent.setup()
    renderTorta({
      campaigns: [camp({ client_id: 'b3', start_date: '2026-12-01', end_date: '2027-01-31' })],
    })
    await user.click(screen.getByRole('button', { name: /Al día/ }))
    expect(screen.getByRole('button', { name: /^Tranquila/ })).toHaveTextContent('Programada')
  })

  it('sin marcas avisa en vez de dibujar una torta vacía', () => {
    renderTorta({ brands: [] })
    expect(screen.getByText('No hay marcas en esta línea')).toBeInTheDocument()
    expect(screen.queryByRole('img')).not.toBeInTheDocument()
  })
})
