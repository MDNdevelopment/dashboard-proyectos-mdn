import { render, screen, fireEvent, within, waitFor } from '@testing-library/react'
import { vi } from 'vitest'

const { mockLotes } = vi.hoisted(() => ({ mockLotes: vi.fn() }))
vi.mock('../components/pautas/avPautasApi', async (importOriginal) => ({
  ...(await importOriginal()),
  loadLotesListasAFecha: (...a) => mockLotes(...a),
}))
import AvDatosView from '../components/pautas/AvDatosView'
import { pendientesPorEditar } from '../utils/audiovisual'

const users = new Map([
  ['u1', { user_id: 'u1', first_name: 'Diego', last_name: '' }],
  ['u2', { user_id: 'u2', first_name: 'Nadia', last_name: '' }],
])
const lines = [{ id: 'l1', name: 'Georgina' }]

// Octubre: 26 capturadas, 22 editadas (85 %), 1 realizada, 1 solicitada pendiente.
const OCT = [
  {
    id: 'p1',
    status: 'realizada',
    line_id: 'l1',
    pauta_date: '2026-10-05',
    formats: ['R', 'F'],
    recurso_ids: ['u1', 'u2'],
    grabacion_por_formato: { R: { u1: 6 }, F: { u2: 20 } },
    piezas_por_formato: { R: { salieron: 6, editadas: 2 }, F: { salieron: 20, editadas: 20 } },
    piezas_totales: 26,
    piezas_editadas: 22,
    deleted_at: null,
  },
  {
    id: 's1',
    status: 'solicitada',
    submitted: true,
    line_id: 'l1',
    pauta_date: null,
    formats: ['R'],
    deleted_at: null,
  },
]
// Septiembre: 10 capturadas, 5 editadas (50 %), 2 realizadas.
const SEP = [
  {
    id: 'q1',
    status: 'realizada',
    line_id: 'l1',
    pauta_date: '2026-09-10',
    formats: ['R'],
    recurso_ids: ['u1'],
    grabacion_por_formato: { R: { u1: 10 } },
    piezas_por_formato: { R: { salieron: 10, editadas: 5 } },
    deleted_at: null,
  },
  {
    id: 'q2',
    status: 'realizada',
    line_id: 'l1',
    pauta_date: '2026-09-20',
    formats: ['F'],
    recurso_ids: ['u2'],
    grabacion_por_formato: {},
    piezas_por_formato: {},
    deleted_at: null,
  },
]
const piezas = new Map([
  [
    'p1',
    [
      {
        es_lote: true,
        editor_user_id: 'u1',
        formato: 'R',
        cantidad: 6,
        listas: 2,
        status: 'en_edicion',
      },
      {
        es_lote: true,
        editor_user_id: 'u2',
        formato: 'F',
        cantidad: 20,
        listas: 20,
        status: 'listo',
      },
    ],
  ],
  ['q1', [{ es_lote: true, editor_user_id: 'u1', formato: 'R', cantidad: 10, listas: 5 }]],
])
const cnp = [
  {
    assignee_id: 'u1',
    status: 'Terminado',
    pieces: [{ done: true }, { done: true }, { done: true }],
  },
]

function setup(props = {}) {
  const onSelectPendiente = vi.fn()
  const onSelectLine = vi.fn()
  const onMonthChange = vi.fn()
  const onSelectPersona = vi.fn()
  render(
    <AvDatosView
      pautas={OCT}
      allPautas={[...OCT, ...SEP]}
      year={2026}
      month={10}
      lines={lines}
      generalLineId={null}
      usersById={users}
      piezasByPauta={piezas}
      cnpAv={cnp}
      pendientes={pendientesPorEditar(OCT, piezas, lines)}
      onMonthChange={onMonthChange}
      onSelectPendiente={onSelectPendiente}
      onSelectLine={onSelectLine}
      onSelectPersona={onSelectPersona}
      {...props}
    />,
  )
  return { onSelectPendiente, onSelectLine, onMonthChange, onSelectPersona }
}

const kpi = (label) =>
  within(screen.getByRole('region', { name: 'Resumen del mes' })).getByLabelText(label)

describe('AvDatosView — resumen del mes', () => {
  it('muestra los KPIs del mes con su delta contra el mes anterior', () => {
    setup()
    expect(screen.getByRole('heading', { name: 'octubre 2026' })).toBeInTheDocument()
    expect(screen.getByText('Comparado con septiembre.')).toBeInTheDocument()
    expect(kpi('% editado')).toHaveTextContent('85%')
    expect(kpi('% editado')).toHaveTextContent('▲ +35 pts')
    expect(kpi('piezas capturadas')).toHaveTextContent('26')
    expect(kpi('piezas capturadas')).toHaveTextContent('▲ +16')
    expect(kpi('por editar')).toHaveTextContent('4')
    expect(kpi('por editar')).toHaveTextContent('▼ -1')
    expect(kpi('pautas realizadas')).toHaveTextContent('1')
    expect(kpi('pautas realizadas')).toHaveTextContent('▼ -1')
  })

  it('"por editar" lleva a la lista de pendientes; el selector cambia el mes', () => {
    const { onSelectPendiente, onMonthChange } = setup()
    fireEvent.click(kpi('por editar'))
    expect(onSelectPendiente).toHaveBeenCalledWith({ lineId: null, formato: null })
    fireEvent.click(screen.getByLabelText(/Mes anterior/i))
    expect(onMonthChange).toHaveBeenCalledWith('2026-09')
  })

  it('sin mes anterior, lo dice en vez de inventar un delta', () => {
    setup({ allPautas: OCT })
    expect(kpi('% editado')).toHaveTextContent('sin mes anterior')
    expect(kpi('pautas realizadas')).toHaveTextContent('▲ +1')
  })
})

describe('AvDatosView — paneles heredados de Rendimiento', () => {
  it('pendientes por línea: 4 reels pendientes; clic en la celda filtra', () => {
    const { onSelectPendiente } = setup()
    const table = screen.getByRole('table', { name: 'Pendiente por editar' })
    expect(table).toHaveTextContent('Georgina')
    fireEvent.click(
      screen.getByRole('button', { name: /Ver pautas con 4 pendientes de R en esta línea/ }),
    )
    expect(onSelectPendiente).toHaveBeenCalledWith({ lineId: 'l1', formato: 'R' })
  })

  it('ranking de videos: Diego (reel + CNP); Nadia solo en fotos', () => {
    setup()
    const videos = screen.getByRole('table', { name: 'Videos 4K + Reels' })
    expect(videos).toHaveTextContent('Diego')
    expect(videos).not.toHaveTextContent('Nadia')
    expect(videos).toHaveTextContent('🗂️ 3 CNP')
    const fotos = screen.getByRole('table', { name: 'Fotos' })
    expect(fotos).toHaveTextContent('Nadia')
    expect(fotos).not.toHaveTextContent('Diego')
  })

  it('piezas por línea: total crudo, realizadas, y clic lleva a la lista de esa línea', () => {
    const { onSelectLine } = setup()
    const row = screen.getByRole('button', { name: 'Ver pautas de Georgina' })
    expect(row).toHaveTextContent('22 / 26 ed.')
    expect(row).toHaveTextContent('1 realizadas')
    fireEvent.click(row)
    expect(onSelectLine).toHaveBeenCalledWith('l1')
  })

  it('estados vacíos', () => {
    setup({
      pautas: [],
      allPautas: [],
      piezasByPauta: new Map(),
      cnpAv: [],
      pendientes: { porLinea: [], porPauta: new Map() },
    })
    expect(screen.getByText(/Todo lo capturado este mes ya está editado/)).toBeInTheDocument()
    expect(screen.getByText(/no hay videos/)).toBeInTheDocument()
    expect(screen.getByText(/no hay fotos/)).toBeInTheDocument()
    expect(screen.getByText('Sin piezas registradas este mes.')).toBeInTheDocument()
    expect(kpi('% editado')).toHaveTextContent('—')
  })
})

describe('AvDatosView — videos vs fotos y panel de persona', () => {
  it('la tarjeta muestra piezas capturadas/editadas por grupo con delta', () => {
    setup()
    const card = within(screen.getByRole('region', { name: 'Videos vs. fotos del mes' }))
    const video = card.getByLabelText('Total de videos (4K + Reel)')
    expect(video).toHaveTextContent('6')
    expect(video).toHaveTextContent('2')
    expect(video).toHaveTextContent('33% editado')
    expect(video).toHaveTextContent('▼ -4')
    const foto = card.getByLabelText('Total de fotos')
    expect(foto).toHaveTextContent('20')
    expect(foto).toHaveTextContent('100% editado')
    expect(foto).toHaveTextContent('▲ +20')
  })

  it('clic en una persona abre el panel con totales y semanas', () => {
    setup()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    fireEvent.click(screen.getAllByRole('button', { name: 'Ver detalle de Diego' })[0])
    const panel = within(screen.getByRole('dialog', { name: 'Diego' }))
    expect(panel.getByText('Totales del mes')).toBeInTheDocument()
    expect(panel.getByLabelText('Semana 5/10 a 10/10')).toHaveTextContent('1')
    fireEvent.click(panel.getByLabelText('Cerrar panel'))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('un botón del panel llama a onSelectPersona con id, rol y grupo', () => {
    const { onSelectPersona } = setup()
    fireEvent.click(screen.getAllByRole('button', { name: 'Ver detalle de Diego' })[0])
    fireEvent.click(screen.getByRole('button', { name: 'Videos editados' }))
    expect(onSelectPersona).toHaveBeenCalledWith({ id: 'u1', rol: 'edicion', grupo: 'av' })
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('captura de fotos de Nadia', () => {
    const { onSelectPersona } = setup()
    fireEvent.click(screen.getByRole('button', { name: 'Ver detalle de Nadia' }))
    fireEvent.click(screen.getByRole('button', { name: 'Fotos capturadas' }))
    expect(onSelectPersona).toHaveBeenCalledWith({ id: 'u2', rol: 'captura', grupo: 'foto' })
  })
})

// ─── Desde nov-2026: en un mes terminado, lo editado al último día del mes ──

describe('AvDatosView — editadas al último día del mes (nov-2026 en adelante)', () => {
  const NOV = [
    {
      id: 'n1',
      status: 'realizada',
      line_id: 'l1',
      pauta_date: '2026-11-10',
      formats: ['V'],
      recurso_ids: ['u1'],
      grabacion_por_formato: { V: { u1: 4 } },
      // Contador vivo: hoy dice que las 4 están editadas (columnas crudas incluidas).
      piezas_por_formato: { V: { salieron: 4, editadas: 4 } },
      piezas_totales: 4,
      piezas_editadas: 4,
      deleted_at: null,
    },
  ]
  const lotes = new Map([
    [
      'n1',
      [
        {
          id: 'lote-n1',
          es_lote: true,
          editor_user_id: 'u1',
          formato: 'V',
          cantidad: 4,
          listas: 4,
          status: 'listo',
        },
      ],
    ],
  ])
  // Al 30-nov solo 1 de las 4 estaba lista.
  const filas = [{ pieza_id: 'lote-n1', pauta_id: 'n1', formato: 'V', listas: 1 }]

  beforeEach(() => {
    mockLotes.mockReset()
    mockLotes.mockResolvedValue({ data: filas, error: null })
    vi.useFakeTimers({ shouldAdvanceTime: true })
    vi.setSystemTime(new Date('2026-12-15T12:00:00'))
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  const setupNov = (props = {}) =>
    setup({
      pautas: NOV,
      allPautas: NOV,
      year: 2026,
      month: 11,
      piezasByPauta: lotes,
      pendientes: { porLinea: [], porPauta: new Map() },
      ...props,
    })

  it('noviembre ya terminó: toma lo editado al 30-nov, no el contador vivo', async () => {
    setupNov()
    await waitFor(() => expect(kpi('% editado')).toHaveTextContent('25%'))
    expect(mockLotes).toHaveBeenCalledWith(['n1'], '2026-11-30')
    expect(kpi('piezas editadas')).toHaveTextContent('1')
    expect(kpi('por editar')).toHaveTextContent('3')
  })

  it('explica que el mes quedó fijo', async () => {
    setupNov()
    expect(
      await screen.findByText(/Mes terminado: lo editado se mide al último día del mes/),
    ).toBeInTheDocument()
  })

  it('«Piezas por línea» también usa lo editado al último día del mes', async () => {
    setupNov()
    const row = await screen.findByRole('button', { name: 'Ver pautas de Georgina' })
    await waitFor(() => expect(row).toHaveTextContent('1 / 4 ed.'))
  })

  it('el ranking por persona sigue en vivo (trabajo real de hoy)', async () => {
    setupNov()
    await waitFor(() => expect(kpi('% editado')).toHaveTextContent('25%'))
    expect(screen.getByRole('table', { name: 'Videos 4K + Reels' })).toHaveTextContent('Diego')
  })

  it('el mes en curso no se consulta y usa el valor vivo', async () => {
    vi.setSystemTime(new Date('2026-11-20T12:00:00'))
    setupNov()
    await waitFor(() => expect(kpi('% editado')).toHaveTextContent('100%'))
    expect(mockLotes).not.toHaveBeenCalled()
    expect(screen.queryByText(/Mes terminado/)).not.toBeInTheDocument()
  })

  it('octubre y meses anteriores no se tocan', async () => {
    setup()
    await waitFor(() => expect(kpi('% editado')).toHaveTextContent('85%'))
    expect(mockLotes).not.toHaveBeenCalled()
    expect(screen.queryByText(/Mes terminado/)).not.toBeInTheDocument()
  })

  it('el delta contra el mes anterior también usa el mes anterior congelado', async () => {
    const DIC = [
      {
        ...NOV[0],
        id: 'd1',
        pauta_date: '2026-12-03',
        piezas_por_formato: { V: { salieron: 4, editadas: 4 } },
      },
    ]
    const lotesDic = new Map([
      ...lotes,
      ['d1', [{ ...lotes.get('n1')[0], id: 'lote-d1', listas: 4 }]],
    ])
    vi.setSystemTime(new Date('2027-01-10T12:00:00'))
    mockLotes.mockImplementation(async (ids, fecha) => ({
      data: ids.map((id) => ({
        pieza_id: id === 'n1' ? 'lote-n1' : 'lote-d1',
        pauta_id: id,
        formato: 'V',
        listas: fecha === '2026-11-30' ? 1 : 3,
      })),
      error: null,
    }))
    setupNov({
      pautas: DIC,
      allPautas: [...NOV, ...DIC],
      year: 2026,
      month: 12,
      piezasByPauta: lotesDic,
    })
    // Diciembre 75 % (3 de 4) contra noviembre 25 % (1 de 4): +50 pts.
    await waitFor(() => expect(kpi('% editado')).toHaveTextContent('75%'))
    expect(kpi('% editado')).toHaveTextContent('▲ +50 pts')
  })

  it('si la consulta falla, avisa y muestra los valores actuales', async () => {
    mockLotes.mockResolvedValue({ data: null, error: { message: 'boom' } })
    setupNov()
    expect(
      await screen.findByText(/No se pudo calcular lo editado al cierre de los meses/),
    ).toBeInTheDocument()
    expect(kpi('% editado')).toHaveTextContent('100%')
  })
})
