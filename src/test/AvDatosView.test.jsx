import { render, screen, fireEvent, within } from '@testing-library/react'
import { vi } from 'vitest'
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
      {...props}
    />,
  )
  return { onSelectPendiente, onSelectLine, onMonthChange }
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
