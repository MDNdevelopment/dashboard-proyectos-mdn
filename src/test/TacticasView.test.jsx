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
  camp(), // vence en 2 días → urgente
  camp({
    id: 'c2',
    name: 'Plan Capitas',
    client: 'Capitas',
    client_id: 'b2',
    end_date: '2026-12-31', // al día
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

const bodyRows = () => screen.getAllByRole('row').slice(1)
const legend = () => screen.getByRole('group', { name: 'Grupos' })

describe('TacticasView', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    vi.setSystemTime(new Date('2026-11-19T12:00:00'))
  })
  afterEach(() => {
    vi.useRealTimers()
    window.sessionStorage.clear()
  })

  it('mientras carga muestra un spinner y ninguna subvista', () => {
    const { container } = renderView({ loading: true })
    expect(container.querySelector('.animate-spin')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Dashboard' })).not.toBeInTheDocument()
  })

  it('tiene dos subvistas, Dashboard y Base, y abre en el Dashboard', () => {
    renderView()
    const group = screen.getByRole('group', { name: 'Vista de tácticas' })
    expect(
      within(group)
        .getAllByRole('button')
        .map((b) => b.textContent),
    ).toEqual(['Dashboard', 'Base'])
    expect(screen.getByRole('button', { name: 'Dashboard', pressed: true })).toBeInTheDocument()
  })

  describe('Dashboard', () => {
    it('muestra la torta, las tortas por team y la tarjeta Por hacer, sin filtros ni tabla', () => {
      renderView()
      expect(screen.getByRole('region', { name: 'Resumen de tácticas' })).toBeInTheDocument()
      expect(screen.getByRole('group', { name: 'Team Línea A' })).toBeInTheDocument()
      expect(screen.getByRole('group', { name: 'Team Línea B' })).toBeInTheDocument()
      expect(screen.getByRole('region', { name: 'Por hacer' })).toBeInTheDocument()
      expect(screen.queryByRole('table')).not.toBeInTheDocument()
      expect(screen.queryByLabelText('Estado')).not.toBeInTheDocument()
    })

    it('la torta resume marcas, tácticas vigentes y cumplimiento promedio', () => {
      renderView()
      const resumen = screen.getByRole('region', { name: 'Resumen de tácticas' })
      expect(resumen).toHaveTextContent(
        '3 marcas · 2 tácticas vigentes · cumplimiento promedio 100%',
      )
      expect(
        within(resumen).getByRole('img', { name: '2 de 3 marcas con táctica vigente' }),
      ).toBeInTheDocument()
      // RE/MAX vence en 2 días (urgente), Capitas en 42 (al día) y Flexmed no tiene vigente.
      expect(within(legend()).getByRole('button', { name: /Urgente/ })).toHaveTextContent('1')
      expect(within(legend()).getByRole('button', { name: /Por vencer/ })).toBeDisabled()
      expect(within(legend()).getByRole('button', { name: /Al día/ })).toHaveTextContent('1')
      expect(within(legend()).getByRole('button', { name: /Sin táctica/ })).toHaveTextContent('1')
    })

    it('clic en "Urgente" abre Base filtrada por urgentes', async () => {
      const user = userEvent.setup()
      renderView()
      await user.click(within(legend()).getByRole('button', { name: /Urgente/ }))

      expect(screen.getByRole('button', { name: 'Base', pressed: true })).toBeInTheDocument()
      expect(screen.getByLabelText('Estado')).toHaveValue('urgentes')
      expect(bodyRows()).toHaveLength(1)
      expect(bodyRows()[0]).toHaveTextContent('Plan RE/MAX')
    })

    it('clic en "Sin táctica" abre Base con la lista de marcas sin táctica', async () => {
      const user = userEvent.setup()
      renderView()
      await user.click(within(legend()).getByRole('button', { name: /Sin táctica/ }))

      expect(screen.getByLabelText('Estado')).toHaveValue('sin_tactica')
      expect(bodyRows()).toHaveLength(1)
      expect(bodyRows()[0]).toHaveTextContent('Flexmed')
    })

    it('clic en un team elige ese team en las pills de línea y abre Base', async () => {
      const user = userEvent.setup()
      const onSelectLine = vi.fn()
      renderView({ onSelectLine })
      await user.click(screen.getByRole('button', { name: 'Al día de Línea B: 1' }))

      expect(onSelectLine).toHaveBeenCalledWith('l2', { view: 'base' })
    })

    it('la tarjeta Por hacer muestra los logos; clic en uno abre su ficha', async () => {
      const user = userEvent.setup()
      renderView()
      const porHacer = screen.getByRole('region', { name: 'Por hacer' })
      expect(within(porHacer).queryByRole('button', { name: /RE\/MAX/ })).not.toBeInTheDocument()

      await user.click(within(porHacer).getByRole('button', { name: 'Ver ficha de Flexmed' }))
      expect(screen.getByRole('dialog', { name: 'Ficha de Flexmed' })).toBeInTheDocument()
    })

    it('"Ver en Base" de Por hacer abre Base con el Estado "Sin táctica"', async () => {
      const user = userEvent.setup()
      renderView()
      const porHacer = screen.getByRole('region', { name: 'Por hacer' })
      await user.click(within(porHacer).getByRole('button', { name: 'Ver en Base' }))

      expect(screen.getByRole('button', { name: 'Base', pressed: true })).toBeInTheDocument()
      expect(screen.getByLabelText('Estado')).toHaveValue('sin_tactica')
    })

    it('las tácticas sin marca no cuentan para "Sin táctica"', () => {
      renderView({
        campaigns: [...campaigns, camp({ id: 'huerfana', client: 'X', client_id: null })],
      })
      expect(within(legend()).getByRole('button', { name: /Sin táctica/ })).toHaveTextContent('1')
    })

    it('una táctica programada cubre a la marca: no entra en Por hacer', () => {
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
      expect(screen.queryByRole('region', { name: 'Por hacer' })).not.toBeInTheDocument()
    })
  })

  describe('tarjeta "Vencen pronto"', () => {
    const tarjeta = () => screen.getByRole('region', { name: '1 táctica vence en 10 días o menos' })

    it('está en el Dashboard, debajo de la torta, sin ventana emergente', () => {
      renderView()
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
      const resumen = screen.getByRole('region', { name: 'Resumen de tácticas' })
      expect(
        resumen.compareDocumentPosition(tarjeta()) & Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy()
      expect(within(tarjeta()).getByText('Plan RE/MAX')).toBeInTheDocument()
      expect(within(tarjeta()).getByText('2 días')).toBeInTheDocument()
      expect(within(tarjeta()).queryByText('Plan Capitas')).not.toBeInTheDocument()
    })

    it('"Ver urgentes" abre Base filtrada', async () => {
      const user = userEvent.setup()
      renderView()
      await user.click(screen.getByRole('button', { name: 'Ver urgentes (1)' }))

      expect(screen.getByLabelText('Estado')).toHaveValue('urgentes')
      expect(bodyRows()).toHaveLength(1)
    })

    it('clic en una táctica abre su detalle', async () => {
      const user = userEvent.setup()
      const onSelect = vi.fn()
      renderView({ onSelect })
      await user.click(within(tarjeta()).getByText('Plan RE/MAX'))
      expect(onSelect).toHaveBeenCalledWith(campaigns[0])
    })

    it('no sale en Base, ni si nada vence pronto', () => {
      const { unmount } = renderView({}, '/ads?view=base')
      expect(screen.queryByText('Vencen pronto')).not.toBeInTheDocument()
      unmount()

      renderView({ campaigns: campaigns.slice(1) })
      expect(screen.queryByText('Vencen pronto')).not.toBeInTheDocument()
    })
  })

  describe('Base', () => {
    it('abre con ?view=base (y con el viejo ?view=historial) y lista todas las tácticas', () => {
      const { unmount } = renderView({}, '/ads?view=base')
      expect(screen.getByRole('button', { name: 'Base', pressed: true })).toBeInTheDocument()
      // Abre en "Vigentes": la finalizada no sale hasta elegir "Todas".
      expect(bodyRows()).toHaveLength(2)
      expect(screen.queryByText('Plan viejo Flexmed')).not.toBeInTheDocument()
      expect(screen.queryByRole('region', { name: 'Resumen de tácticas' })).not.toBeInTheDocument()
      unmount()

      renderView({}, '/ads?view=historial')
      expect(screen.getByRole('button', { name: 'Base', pressed: true })).toBeInTheDocument()
    })

    it('solo filtra por búsqueda, marca y estado (sin Jefa ni "Vence en")', () => {
      renderView({}, '/ads?view=base')
      expect(screen.getByLabelText('Buscar')).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Marca' })).toBeInTheDocument()
      expect(screen.getByLabelText('Estado')).toHaveValue('vigentes')
      expect(screen.queryByLabelText('Jefa')).not.toBeInTheDocument()
      expect(screen.queryByLabelText('Vence en')).not.toBeInTheDocument()
      expect(screen.getByText('2 de 3 tácticas')).toBeInTheDocument()
    })

    it('"Todas" muestra también las finalizadas; la leyenda del avance tiene 5 tramos', async () => {
      const user = userEvent.setup()
      renderView({}, '/ads?view=base')
      await user.selectOptions(screen.getByLabelText('Estado'), 'todas')
      expect(bodyRows()).toHaveLength(3)
      expect(screen.getByText('3 tácticas')).toBeInTheDocument()

      const leyenda = screen.getByRole('list', { name: 'Escala de avance' })
      for (const t of ['Sin comenzar', 'Iniciada', 'En curso', 'Avanzada', 'Completada']) {
        expect(within(leyenda).getByText(t)).toBeInTheDocument()
      }
    })

    it('filtra por estado: al día, urgentes y finalizadas', async () => {
      const user = userEvent.setup()
      renderView({}, '/ads?view=base')

      await user.selectOptions(screen.getByLabelText('Estado'), 'al_dia')
      expect(bodyRows()).toHaveLength(1)
      expect(bodyRows()[0]).toHaveTextContent('Plan Capitas')
      expect(screen.getByText('1 de 3 tácticas')).toBeInTheDocument()

      await user.selectOptions(screen.getByLabelText('Estado'), 'urgentes')
      expect(bodyRows()[0]).toHaveTextContent('Plan RE/MAX')

      await user.selectOptions(screen.getByLabelText('Estado'), 'finalizadas')
      expect(bodyRows()).toHaveLength(1)
      expect(bodyRows()[0]).toHaveTextContent('Plan viejo Flexmed')
    })

    it('"Sin táctica" cambia la tabla a una fila por marca, con "Cargar táctica"', async () => {
      const user = userEvent.setup()
      const onCreate = vi.fn()
      renderView({ onCreate }, '/ads?view=base')
      await user.selectOptions(screen.getByLabelText('Estado'), 'sin_tactica')

      expect(screen.getByText('1 marca sin táctica')).toBeInTheDocument()
      expect(bodyRows()).toHaveLength(1)
      expect(bodyRows()[0]).toHaveTextContent('Flexmed')
      expect(bodyRows()[0]).toHaveTextContent('Plan viejo Flexmed')

      await user.click(screen.getByRole('button', { name: 'Cargar táctica de Flexmed' }))
      expect(onCreate).toHaveBeenCalledWith('b3')
    })

    it('la búsqueda también encuentra por jefa', async () => {
      const user = userEvent.setup()
      renderView({}, '/ads?view=base')
      await user.selectOptions(screen.getByLabelText('Estado'), 'todas')
      await user.type(screen.getByLabelText('Buscar'), 'daniellys')

      expect(bodyRows()).toHaveLength(2)
      expect(screen.queryByText('Plan RE/MAX')).not.toBeInTheDocument()
    })

    it('filtra por marca y "Limpiar" vuelve a Vigentes sin marca ni búsqueda', async () => {
      const user = userEvent.setup()
      renderView({}, '/ads?view=base')
      await user.selectOptions(screen.getByLabelText('Estado'), 'todas')
      await user.click(screen.getByRole('button', { name: 'Marca' }))
      await user.click(screen.getByRole('option', { name: /Capitas/ }))

      expect(bodyRows()).toHaveLength(1)
      // Elegir la marca filtra, no abre la ficha.
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()

      await user.click(screen.getByRole('button', { name: 'Limpiar' }))
      expect(screen.getByLabelText('Estado')).toHaveValue('vigentes')
      expect(bodyRows()).toHaveLength(2)
    })

    it('sin coincidencias muestra el estado vacío con "Limpiar filtros"', async () => {
      const user = userEvent.setup()
      renderView({}, '/ads?view=base')
      await user.type(screen.getByLabelText('Buscar'), 'zzz')

      expect(screen.getByText('No hay tácticas con esos filtros')).toBeInTheDocument()
      await user.click(screen.getByRole('button', { name: 'Limpiar filtros' }))
      expect(bodyRows()).toHaveLength(2)
    })
  })

  describe('ficha de la marca (ventana emergente)', () => {
    it('clic en una marca de la tabla abre su ficha en una ventana', async () => {
      const user = userEvent.setup()
      renderView({}, '/ads?view=base')
      await user.click(screen.getByRole('button', { name: 'Ver ficha de Capitas' }))

      const dialog = screen.getByRole('dialog', { name: 'Ficha de Capitas' })
      expect(within(dialog).getByRole('heading', { name: /Capitas/ })).toBeInTheDocument()
      // La tabla sigue detrás.
      expect(screen.getByRole('table')).toBeInTheDocument()
    })

    it('se abre directo desde la URL con ?client= y se cierra con la X', async () => {
      const user = userEvent.setup()
      renderView({}, '/ads?client=b3')
      const dialog = screen.getByRole('dialog', { name: 'Ficha de Flexmed' })
      // Flexmed no tiene vigente: avisa.
      expect(within(dialog).getByRole('alert')).toHaveTextContent('Sin táctica vigente')

      await user.click(screen.getByRole('button', { name: 'Cerrar ficha' }))
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })

    it('Escape cierra la ficha', async () => {
      const user = userEvent.setup()
      renderView({}, '/ads?client=b3')
      await user.keyboard('{Escape}')
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })
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

    it('la tarjeta Por hacer marca a la marca que tiene insumo', () => {
      renderView({ insumos })
      const porHacer = screen.getByRole('region', { name: 'Por hacer' })
      expect(
        within(porHacer).getByRole('button', { name: 'Ver ficha de Flexmed (con insumo)' }),
      ).toBeInTheDocument()
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
