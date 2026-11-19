import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { vi } from 'vitest'

vi.mock('../supabase', () => ({ supabase: { from: vi.fn() } }))

import TacticasView from '../components/ads/tacticas/TacticasView'

const brands = [
  { id: 'b1', name: 'RE/MAX', logo_url: null, line_id: 'l1' },
  { id: 'b2', name: 'Capitas', logo_url: null, line_id: 'l2' },
  { id: 'b3', name: 'Flexmed', logo_url: null, line_id: 'l2' },
]
const clientsById = new Map(brands.map((b) => [b.id, b]))
const linesById = new Map([
  ['l1', { id: 'l1', name: 'Línea A', lead_user_id: 'u1' }],
  ['l2', { id: 'l2', name: 'Línea B', lead_user_id: 'u2' }],
])
const usersMap = new Map([
  ['u1', 'Sabrina'],
  ['u2', 'Daniellys'],
])

const camp = (over = {}) => ({
  id: 'c1',
  name: 'Plan RE/MAX',
  client: 'RE/MAX',
  client_id: 'b1',
  assignee: 'u1',
  status: 'En Curso',
  start_date: '2026-11-01',
  end_date: '2026-11-21',
  created_at: '2026-11-01T10:00:00Z',
  checklist: [],
  ...over,
})

const campaigns = [
  camp(), // vence en 2 días → rojo, "vencen en 3 días"
  camp({
    id: 'c2',
    name: 'Plan Capitas',
    client: 'Capitas',
    client_id: 'b2',
    end_date: '2026-12-31',
    checklist: [
      { id: '1', title: 'a', done: true },
      { id: '2', title: 'b', done: true },
    ],
  }),
  camp({
    id: 'c3',
    name: 'Plan viejo Flexmed',
    client: 'Flexmed',
    client_id: 'b3',
    status: 'Finalizado',
    start_date: '2026-05-01',
    end_date: '2026-08-31',
  }),
]

function renderView(props = {}, route = '/ads') {
  return render(
    <MemoryRouter initialEntries={[route]}>
      <TacticasView
        campaigns={campaigns}
        brands={brands}
        clientsById={clientsById}
        linesById={linesById}
        usersMap={usersMap}
        loading={false}
        canManage
        onSelect={() => {}}
        onEdit={() => {}}
        onUpdated={() => {}}
        onDeleted={() => {}}
        onCreate={() => {}}
        {...props}
      />
    </MemoryRouter>,
  )
}

describe('TacticasView', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    vi.setSystemTime(new Date('2026-11-19T12:00:00'))
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('mientras carga muestra un spinner y ninguna subvista', () => {
    const { container } = renderView({ loading: true })
    expect(container.querySelector('.animate-spin')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Vigentes' })).not.toBeInTheDocument()
  })

  it('Vigentes lista solo las tácticas en marcha, con la más urgente primero', () => {
    renderView()
    const rows = screen.getAllByRole('row').slice(1)
    expect(rows).toHaveLength(2)
    expect(rows[0]).toHaveTextContent('Plan RE/MAX')
    expect(rows[1]).toHaveTextContent('Plan Capitas')
    expect(screen.queryByText('Plan viejo Flexmed')).not.toBeInTheDocument()
  })

  it('la torta resume marcas, tácticas vigentes y cumplimiento promedio', () => {
    renderView()
    const resumen = screen.getByRole('region', { name: 'Resumen de tácticas' })
    expect(resumen).toHaveTextContent('3 marcas · 2 tácticas vigentes · cumplimiento promedio 100%')
    expect(
      within(resumen).getByRole('img', { name: '2 de 3 marcas con táctica vigente' }),
    ).toBeInTheDocument()
    // RE/MAX vence en 2 días (urgente), Capitas en 42 (al día) y Flexmed no tiene vigente.
    expect(within(resumen).getByRole('button', { name: /Urgente/ })).toHaveTextContent('1')
    expect(within(resumen).getByRole('button', { name: /Por vencer/ })).toBeDisabled()
    expect(within(resumen).getByRole('button', { name: /Al día/ })).toHaveTextContent('1')
    expect(within(resumen).getByRole('button', { name: /Sin táctica/ })).toHaveTextContent('1')
  })

  it('la torta abre la táctica de una marca y, sin táctica, el formulario para cargarla', async () => {
    const user = userEvent.setup()
    const onSelect = vi.fn()
    const onCreate = vi.fn()
    renderView({ onSelect, onCreate })
    const resumen = screen.getByRole('region', { name: 'Resumen de tácticas' })

    // Arranca en el grupo más urgente con marcas: Urgente (RE/MAX).
    await user.click(within(resumen).getByRole('button', { name: /^RE\/MAX/ }))
    expect(onSelect).toHaveBeenCalledWith(campaigns[0])

    await user.click(within(resumen).getByRole('button', { name: /Sin táctica/ }))
    await user.click(within(resumen).getByRole('button', { name: /^Flexmed/ }))
    expect(onCreate).toHaveBeenCalledWith('b3')
  })

  it('"Por hacer" lista las marcas sin táctica vigente y abre el formulario con la marca', async () => {
    const user = userEvent.setup()
    const onCreate = vi.fn()
    renderView({ onCreate })

    const porHacer = screen.getByRole('region', { name: /Por hacer/ })
    expect(within(porHacer).getByText('Flexmed')).toBeInTheDocument()
    expect(within(porHacer).queryByText('RE/MAX')).not.toBeInTheDocument()

    await user.click(within(porHacer).getByRole('button', { name: 'Cargar táctica de Flexmed' }))
    expect(onCreate).toHaveBeenCalledWith('b3')
  })

  it('filtra por jefa, derivada de la línea de la marca', async () => {
    const user = userEvent.setup()
    renderView()
    await user.selectOptions(screen.getByLabelText('Jefa'), 'Daniellys')

    const rows = screen.getAllByRole('row').slice(1)
    expect(rows).toHaveLength(1)
    expect(rows[0]).toHaveTextContent('Plan Capitas')
  })

  it('filtra por búsqueda de texto', async () => {
    const user = userEvent.setup()
    renderView()
    await user.type(screen.getByLabelText('Buscar'), 'capitas')

    expect(screen.getByText('1 táctica de 2')).toBeInTheDocument()
    expect(screen.queryByText('Plan RE/MAX')).not.toBeInTheDocument()
  })

  it('filtra por "Vencen en 3 días" desde el filtro Estado y "Limpiar" restablece', async () => {
    const user = userEvent.setup()
    renderView()
    await user.selectOptions(screen.getByLabelText('Estado'), 'vencen3')

    expect(screen.getAllByRole('row').slice(1)).toHaveLength(1)

    await user.click(screen.getByRole('button', { name: 'Limpiar' }))
    expect(screen.getAllByRole('row').slice(1)).toHaveLength(2)
  })

  it('filtra por mes de vencimiento', async () => {
    const user = userEvent.setup()
    renderView()
    await user.selectOptions(screen.getByLabelText('Vence en'), '2026-12')

    const rows = screen.getAllByRole('row').slice(1)
    expect(rows).toHaveLength(1)
    expect(rows[0]).toHaveTextContent('Plan Capitas')
  })

  it('el filtro "Vencen este mes" deja solo las que vencen en el mes en curso', async () => {
    const user = userEvent.setup()
    renderView()
    await user.selectOptions(screen.getByLabelText('Estado'), 'vencen_mes')

    const rows = screen.getAllByRole('row').slice(1)
    expect(rows).toHaveLength(1)
    expect(rows[0]).toHaveTextContent('Plan RE/MAX')
  })

  it('ya no hay pestaña "Por marca": la marca es un filtro de Vigentes', () => {
    renderView()
    expect(screen.queryByRole('button', { name: 'Por marca' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Marca' })).toHaveTextContent('Todas las marcas')
  })

  it('elegir una marca en el filtro muestra solo su ficha (sin torta, por hacer ni tabla)', async () => {
    const user = userEvent.setup()
    renderView()
    await user.click(screen.getByRole('button', { name: 'Marca' }))
    await user.click(screen.getByRole('option', { name: /Capitas/ }))

    expect(screen.getByRole('heading', { name: /Capitas/ })).toBeInTheDocument()
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Resumen de tácticas' })).not.toBeInTheDocument()
    expect(screen.queryByRole('region', { name: /Por hacer/ })).not.toBeInTheDocument()

    // "Limpiar" vuelve al tablero.
    await user.click(screen.getByRole('button', { name: 'Limpiar' }))
    expect(screen.getByRole('table')).toBeInTheDocument()
  })

  it('clic en una marca de la tabla la elige en el filtro y abre su ficha', async () => {
    const user = userEvent.setup()
    renderView()
    await user.click(screen.getByRole('button', { name: 'Ver ficha de Capitas' }))

    expect(screen.getByRole('button', { name: 'Marca' })).toHaveTextContent('Capitas')
    expect(screen.getByRole('heading', { name: /Capitas/ })).toBeInTheDocument()
  })

  it('la ficha se abre directo desde la URL con ?client= (y con el viejo ?view=marca)', () => {
    const { unmount } = renderView({}, '/ads?client=b3')
    expect(screen.getByRole('heading', { name: /Flexmed/ })).toBeInTheDocument()
    // Flexmed no tiene vigente: avisa.
    expect(screen.getByRole('alert')).toHaveTextContent('Sin táctica vigente')
    unmount()

    renderView({}, '/ads?view=marca&client=b3')
    expect(screen.getByRole('heading', { name: /Flexmed/ })).toBeInTheDocument()
  })

  it('la torta va primero y los filtros quedan junto a la tabla que filtran', () => {
    renderView()
    const resumen = screen.getByRole('region', { name: 'Resumen de tácticas' })
    const buscar = screen.getByLabelText('Buscar')
    const tabla = screen.getByRole('table')
    const FOLLOWING = Node.DOCUMENT_POSITION_FOLLOWING
    expect(resumen.compareDocumentPosition(buscar) & FOLLOWING).toBeTruthy()
    expect(buscar.compareDocumentPosition(tabla) & FOLLOWING).toBeTruthy()
  })

  it('Historial muestra todas las tácticas, incluidas las finalizadas', async () => {
    const user = userEvent.setup()
    renderView()
    await user.click(screen.getByRole('button', { name: 'Historial' }))

    expect(screen.getByText('Plan viejo Flexmed')).toBeInTheDocument()
    expect(screen.getByText('Plan RE/MAX')).toBeInTheDocument()
    expect(screen.getByText('Plan Capitas')).toBeInTheDocument()
  })

  it('las tácticas sin marca no cuentan para "marcas por hacer"', () => {
    renderView({
      campaigns: [...campaigns, camp({ id: 'huerfana', client: 'X', client_id: null })],
    })
    const resumen = screen.getByRole('region', { name: 'Resumen de tácticas' })
    expect(within(resumen).getByRole('button', { name: /Sin táctica/ })).toHaveTextContent('1')
  })

  it('una táctica programada cubre a la marca: no entra en "por hacer"', () => {
    renderView({
      campaigns: [
        ...campaigns,
        camp({
          id: 'prog',
          name: 'Plan 2027',
          client: 'Flexmed',
          client_id: 'b3',
          status: 'Pendiente',
          start_date: '2027-01-01',
          end_date: '2027-03-31',
        }),
      ],
    })
    expect(screen.queryByRole('region', { name: /Por hacer/ })).not.toBeInTheDocument()
  })

  describe('insumos', () => {
    const source = camp({
      id: 'c3',
      name: 'Plan viejo Flexmed',
      client: 'Flexmed',
      client_id: 'b3',
      status: 'Finalizado',
      start_date: '2026-05-01',
      end_date: '2026-08-31',
      checklist: [
        { id: '1', title: 'Reel semanal', done: true },
        { id: '2', title: 'Mapa inmobiliario', done: false },
      ],
    })
    const insumos = [
      {
        handoff: { id: 'h1', client_id: 'b3', source_campaign_id: 'c3', status: 'pendiente' },
        source,
        content: { done: [source.checklist[0]], pending: [source.checklist[1]], total: 2, pct: 50 },
      },
    ]

    it('"Por hacer" marca con "Con insumo" a la marca que lo tiene', () => {
      renderView({ insumos })
      const porHacer = screen.getByRole('region', { name: /Por hacer/ })
      expect(within(porHacer).getByText('Con insumo')).toBeInTheDocument()
    })

    it('la ficha de esa marca muestra su insumo', () => {
      renderView({ insumos }, '/ads?client=b3')
      expect(
        screen.getByRole('region', { name: 'Insumo de Plan viejo Flexmed' }),
      ).toBeInTheDocument()
    })

    it('la ficha de otra marca no muestra insumos ajenos', () => {
      renderView({ insumos }, '/ads?client=b1')
      expect(screen.queryByText('Insumo para la siguiente táctica')).not.toBeInTheDocument()
    })

    it('descartar el insumo avisa al padre con ese insumo', async () => {
      const user = userEvent.setup()
      const onDiscardInsumo = vi.fn()
      renderView({ insumos, onDiscardInsumo }, '/ads?client=b3')
      await user.click(screen.getByRole('button', { name: 'Descartar insumo' }))
      expect(onDiscardInsumo).toHaveBeenCalledWith(insumos[0].handoff)
    })
  })
})
