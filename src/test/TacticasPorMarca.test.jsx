import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi } from 'vitest'

const { mockUpdateCampaign } = vi.hoisted(() => ({ mockUpdateCampaign: vi.fn() }))
vi.mock('../components/ads/tacticas/tacticasApi', () => ({ updateCampaign: mockUpdateCampaign }))

import TacticasPorMarca from '../components/ads/tacticas/TacticasPorMarca'

const TODAY = '2026-11-19'
const FOLDER = 'https://drive.google.com/drive/folders/1AbCdEfGhIjKlMnOpQrStUvWxYz012345'

const brand = { id: 'b1', name: 'RE/MAX Hogar', logo_url: null, line_id: 'l1' }
const clientsById = new Map([['b1', brand]])
const linesById = new Map([['l1', { id: 'l1', name: 'Línea Sabrina', lead_user_id: 'u1' }]])
const usersMap = new Map([
  ['u1', 'Sabrina Pérez'],
  ['u2', 'Carlos López'],
])

const camp = (over = {}) => ({
  id: 'c1',
  name: 'Tácticas noviembre/diciembre',
  client: 'RE/MAX Hogar',
  client_id: 'b1',
  assignee: 'u2',
  status: 'En Curso',
  start_date: '2026-11-01',
  end_date: '2026-12-31',
  created_at: '2026-11-01T10:00:00Z',
  objective: null,
  drive_url: null,
  checklist: [],
  ...over,
})

function renderMarca(campaigns, props = {}) {
  return render(
    <TacticasPorMarca
      campaigns={campaigns}
      clientId="b1"
      clientsById={clientsById}
      linesById={linesById}
      usersMap={usersMap}
      today={TODAY}
      canManage
      onSelect={() => {}}
      onCreate={() => {}}
      onUpdated={() => {}}
      {...props}
    />,
  )
}

describe('TacticasPorMarca', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockUpdateCampaign.mockResolvedValue({ data: null, error: null })
  })

  it('una marca fuera del alcance del usuario avisa en vez de mostrar una ficha vacía', () => {
    renderMarca([], { clientId: 'otra' })
    expect(
      screen.getByText('Esta marca no está dentro de las líneas que puedes ver'),
    ).toBeInTheDocument()
  })

  it('muestra la duración de la táctica vigente y de las del historial', () => {
    renderMarca([
      camp(),
      camp({
        id: 'c2',
        name: 'Septiembre',
        status: 'Finalizado',
        start_date: '2026-09-01',
        end_date: '2026-09-21',
      }),
    ])
    // 01-nov → 31-dic, ambos inclusive: 61 días.
    expect(screen.getByText(/Duración: 61 días/)).toBeInTheDocument()
    expect(screen.getByText('Duración: 21 días')).toBeInTheDocument()
  })

  it('el encabezado muestra la línea, la jefa y cuántas tácticas tiene la marca', () => {
    renderMarca([camp(), camp({ id: 'c2', status: 'Finalizado', end_date: '2026-06-30' })])
    expect(
      screen.getByText(/Línea Sabrina · Jefa: Sabrina Pérez · 2 tácticas registradas/),
    ).toBeInTheDocument()
  })

  it('sin táctica vigente avisa y ofrece cargar la siguiente', async () => {
    const user = userEvent.setup()
    const onCreate = vi.fn()
    renderMarca([camp({ status: 'Finalizado', end_date: '2026-10-31' })], { onCreate })

    const alerta = screen.getByRole('alert')
    expect(alerta).toHaveTextContent('Sin táctica vigente')
    await user.click(within(alerta).getByRole('button', { name: 'Cargar táctica' }))
    expect(onCreate).toHaveBeenCalledWith('b1')
  })

  it('con una táctica vigente no muestra el aviso de "sin táctica vigente"', () => {
    renderMarca([camp()])
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('una marca sin ninguna táctica también avisa', () => {
    renderMarca([])
    expect(screen.getByRole('alert')).toHaveTextContent('Sin táctica vigente')
    expect(screen.getByText('Aún no hay tácticas anteriores.')).toBeInTheDocument()
  })

  it('la táctica vigente muestra objetivo, días y el documento de Drive (sin responsable)', () => {
    renderMarca([camp({ objective: 'Posicionar la marca', drive_url: FOLDER })])
    const sec = screen.getByRole('region', { name: /Táctica vigente: Tácticas noviembre/ })
    expect(within(sec).getByText('Posicionar la marca')).toBeInTheDocument()
    expect(within(sec).queryByText(/Carlos López/)).not.toBeInTheDocument()
    expect(within(sec).getByText('42 días')).toBeInTheDocument()
    const link = within(sec).getByRole('link', { name: 'Abrir documento' })
    expect(link).toHaveAttribute('href', FOLDER)
    expect(link).toHaveAttribute('target', '_blank')
  })

  it('la barra del período refleja los días transcurridos', () => {
    // 01-nov → 31-dic son 60 días; al 19-nov pasaron 18 → 30 %.
    renderMarca([camp()])
    expect(screen.getByRole('img', { name: 'Avance del período: 30%' })).toBeInTheDocument()
  })

  it('pide completar el link de Drive en la última táctica, solo con ads.manage', () => {
    const { unmount } = renderMarca([camp()])
    expect(screen.getByText('Completa el link de Drive')).toBeInTheDocument()
    unmount()

    renderMarca([camp()], { canManage: false })
    expect(screen.queryByText('Completa el link de Drive')).not.toBeInTheDocument()
  })

  it('una táctica programada se rotula como tal y cubre a la marca', () => {
    renderMarca([camp({ start_date: '2026-12-01', end_date: '2027-02-28' })])
    expect(screen.getByText('Programada')).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('con varias vigentes las muestra todas', () => {
    renderMarca([camp(), camp({ id: 'c2', name: 'Campaña de la Feria', start_date: '2026-11-10' })])
    expect(screen.getAllByRole('region', { name: /Táctica vigente/ })).toHaveLength(2)
  })

  it('el historial lista las anteriores con su % de cumplimiento', () => {
    renderMarca([
      camp(),
      camp({
        id: 'old',
        name: 'Septiembre/octubre',
        status: 'Finalizado',
        start_date: '2026-09-01',
        end_date: '2026-10-31',
        objective: 'Mapa inmobiliario',
        checklist: [
          { id: '1', title: 'a', done: true },
          { id: '2', title: 'b', done: false },
          { id: '3', title: 'c', done: true },
        ],
      }),
      camp({
        id: 'older',
        name: 'Julio/agosto',
        status: 'Finalizado',
        start_date: '2026-07-01',
        end_date: '2026-08-31',
      }),
    ])
    const hist = screen.getByRole('region', { name: 'Historial de tácticas' })
    const items = within(hist).getAllByRole('article')
    expect(items).toHaveLength(2)
    // Más reciente primero.
    expect(items[0]).toHaveTextContent('Septiembre/octubre')
    expect(items[0]).toHaveTextContent('Mapa inmobiliario')
    expect(items[0]).toHaveTextContent('Cumplimiento: 67%')
    expect(items[1]).toHaveTextContent('Julio/agosto')
    expect(items[1]).toHaveTextContent('Cumplimiento: sin acciones registradas')
  })

  it('el link de Drive de una táctica pasada abre en pestaña nueva', () => {
    renderMarca([
      camp(),
      camp({
        id: 'old',
        name: 'Anterior',
        status: 'Finalizado',
        end_date: '2026-10-31',
        drive_url: FOLDER,
      }),
    ])
    const hist = screen.getByRole('region', { name: 'Historial de tácticas' })
    const link = within(hist).getByRole('link', { name: 'Documento' })
    expect(link).toHaveAttribute('href', FOLDER)
    expect(link).toHaveAttribute('target', '_blank')
  })

  it('tildar una acción actualiza al instante y persiste el checklist', async () => {
    const user = userEvent.setup()
    const onUpdated = vi.fn()
    const saved = camp({ checklist: [{ id: '1', title: 'Reel semanal', done: true }] })
    mockUpdateCampaign.mockResolvedValue({ data: saved, error: null })
    renderMarca([camp({ checklist: [{ id: '1', title: 'Reel semanal', done: false }] })], {
      onUpdated,
    })

    await user.click(screen.getByRole('checkbox', { name: 'Completar Reel semanal' }))

    // Optimista: la UI no espera a la red.
    expect(onUpdated).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ checklist: [{ id: '1', title: 'Reel semanal', done: true }] }),
    )
    expect(mockUpdateCampaign).toHaveBeenCalledWith('c1', {
      checklist: [{ id: '1', title: 'Reel semanal', done: true }],
    })
    // Y se reemplaza por lo que devolvió la base.
    await vi.waitFor(() => expect(onUpdated).toHaveBeenLastCalledWith(saved))
  })

  it('si falla el guardado, no pisa la UI con un resultado vacío', async () => {
    const user = userEvent.setup()
    const onUpdated = vi.fn()
    mockUpdateCampaign.mockResolvedValue({ data: null, error: { message: 'rls' } })
    renderMarca([camp({ checklist: [{ id: '1', title: 'Reel semanal', done: false }] })], {
      onUpdated,
    })

    await user.click(screen.getByRole('checkbox', { name: 'Completar Reel semanal' }))

    await vi.waitFor(() => expect(mockUpdateCampaign).toHaveBeenCalled())
    // Solo la llamada optimista; el error no dispara una segunda con data nula.
    expect(onUpdated).toHaveBeenCalledTimes(1)
  })

  it('las acciones solo se pueden tildar con ads.manage', () => {
    renderMarca([camp({ checklist: [{ id: '1', title: 'Reel semanal', done: false }] })], {
      canManage: false,
    })
    expect(screen.getByRole('checkbox', { name: 'Completar Reel semanal' })).toBeDisabled()
  })

  it('"+ Nueva táctica" abre el formulario con la marca elegida; sin ads.manage no aparece', async () => {
    const user = userEvent.setup()
    const onCreate = vi.fn()
    const { unmount } = renderMarca([camp()], { onCreate })
    await user.click(screen.getByRole('button', { name: '+ Nueva táctica' }))
    expect(onCreate).toHaveBeenCalledWith('b1')
    unmount()

    renderMarca([camp()], { canManage: false })
    expect(screen.queryByRole('button', { name: '+ Nueva táctica' })).not.toBeInTheDocument()
  })

  it('clic en el nombre de una táctica abre su detalle', async () => {
    const user = userEvent.setup()
    const onSelect = vi.fn()
    const c = camp()
    renderMarca([c], { onSelect })
    await user.click(screen.getByRole('button', { name: 'Tácticas noviembre/diciembre' }))
    expect(onSelect).toHaveBeenCalledWith(c)
  })

  it('no mezcla tácticas de otras marcas', () => {
    renderMarca([camp(), camp({ id: 'x', name: 'De otra marca', client_id: 'b9' })])
    expect(screen.queryByText('De otra marca')).not.toBeInTheDocument()
  })

  describe('insumo para la siguiente táctica', () => {
    const source = camp({
      id: 'src',
      name: 'Septiembre/octubre',
      status: 'Finalizado',
      start_date: '2026-09-01',
      end_date: '2026-10-31',
      closed_at: '2026-10-31T15:00:00Z',
      checklist: [
        { id: '1', title: 'Reel semanal', done: true },
        { id: '2', title: 'Mapa inmobiliario', done: false },
        { id: '3', title: 'Vlog de asesores', done: false },
      ],
    })
    const insumo = (over = {}) => ({
      handoff: { id: 'h1', client_id: 'b1', source_campaign_id: 'src', status: 'pendiente' },
      source,
      content: {
        done: [source.checklist[0]],
        pending: [source.checklist[1], source.checklist[2]],
        total: 3,
        pct: 33,
      },
      ...over,
    })

    it('muestra el cumplimiento y las acciones que quedaron pendientes', () => {
      renderMarca([source], { insumos: [insumo()] })
      const card = screen.getByRole('region', { name: 'Insumo de Septiembre/octubre' })
      expect(within(card).getByText('Insumo para la siguiente táctica')).toBeInTheDocument()
      expect(within(card).getByText(/cerrada el/)).toBeInTheDocument()
      expect(within(card).getByText('Cumplimiento: 33% (1 de 3 acciones)')).toBeInTheDocument()
      expect(within(card).getByText('Quedaron pendientes (2)')).toBeInTheDocument()
      expect(within(card).getByText('Mapa inmobiliario')).toBeInTheDocument()
      expect(within(card).getByText('Vlog de asesores')).toBeInTheDocument()
      // Lo ya cumplido no se lista como pendiente.
      expect(within(card).queryByText('Reel semanal')).not.toBeInTheDocument()
    })

    it('si todo se cumplió, lo dice y no ofrece arrastrar nada', () => {
      renderMarca([source], {
        insumos: [
          insumo({
            content: { done: source.checklist, pending: [], total: 3, pct: 100 },
          }),
        ],
      })
      const card = screen.getByRole('region', { name: 'Insumo de Septiembre/octubre' })
      expect(within(card).getByText(/no hay nada que arrastrar/)).toBeInTheDocument()
      expect(
        within(card).queryByRole('button', { name: 'Cargar la siguiente táctica' }),
      ).not.toBeInTheDocument()
    })

    it('"Cargar la siguiente táctica" abre el formulario con la marca', async () => {
      const user = userEvent.setup()
      const onCreate = vi.fn()
      renderMarca([source], { insumos: [insumo()], onCreate })
      await user.click(screen.getByRole('button', { name: 'Cargar la siguiente táctica' }))
      expect(onCreate).toHaveBeenCalledWith('b1')
    })

    it('"Descartar insumo" avisa con el insumo elegido', async () => {
      const user = userEvent.setup()
      const onDiscardInsumo = vi.fn()
      const i = insumo()
      renderMarca([source], { insumos: [i], onDiscardInsumo })
      await user.click(screen.getByRole('button', { name: 'Descartar insumo' }))
      expect(onDiscardInsumo).toHaveBeenCalledWith(i.handoff)
    })

    it('sin ads.manage se ve el insumo pero no se puede actuar sobre él', () => {
      renderMarca([source], { insumos: [insumo()], canManage: false })
      expect(
        screen.getByRole('region', { name: 'Insumo de Septiembre/octubre' }),
      ).toBeInTheDocument()
      expect(screen.queryByRole('button', { name: 'Descartar insumo' })).not.toBeInTheDocument()
      expect(
        screen.queryByRole('button', { name: 'Cargar la siguiente táctica' }),
      ).not.toBeInTheDocument()
    })

    it('sin insumos no muestra la tarjeta', () => {
      renderMarca([source])
      expect(screen.queryByText('Insumo para la siguiente táctica')).not.toBeInTheDocument()
    })
  })
})

describe('TacticasPorMarca — carpeta de la marca y Sin fecha', () => {
  const MARCA = 'https://drive.google.com/drive/folders/1ZyXwVuTsRqPoNmLkJiHgFeDcBa98765'

  it('el encabezado trae el botón "Carpeta de la marca"', () => {
    renderMarca([camp({ drive_folder_url: MARCA })])
    const link = screen.getByRole('link', { name: 'Carpeta de la marca' })
    expect(link).toHaveAttribute('href', MARCA)
    expect(link).toHaveAttribute('target', '_blank')
  })

  it('sin carpeta cargada no muestra el botón', () => {
    renderMarca([camp()])
    expect(screen.queryByRole('link', { name: 'Carpeta de la marca' })).not.toBeInTheDocument()
  })

  it('una táctica sin fecha va arriba del historial con la etiqueta "Sin fecha"', () => {
    renderMarca([
      camp({ id: 'old', name: 'Anterior', status: 'Finalizado', end_date: '2026-10-31' }),
      camp({ id: 'nf', name: 'Por fechar', status: 'Pendiente', start_date: null, end_date: null }),
    ])
    const hist = screen.getByRole('region', { name: 'Historial de tácticas' })
    const items = within(hist).getAllByRole('article')
    expect(items[0]).toHaveTextContent('Por fechar')
    expect(items[0]).toHaveTextContent('Sin fecha')
  })
})
