import { render, screen, fireEvent } from '@testing-library/react'
import { vi } from 'vitest'
import AvRendimientoView from '../components/pautas/AvRendimientoView'
import { pendientesPorEditar } from '../utils/audiovisual'

const users = new Map([
  ['u1', { user_id: 'u1', first_name: 'Diego', last_name: '' }],
  ['u2', { user_id: 'u2', first_name: 'Nadia', last_name: '' }],
])
const lines = [{ id: 'l1', name: 'Georgina' }]
const pautas = [
  {
    id: 'p1',
    status: 'realizada',
    line_id: 'l1',
    formats: ['R', 'F'],
    recurso_ids: ['u1', 'u2'],
    grabacion_por_formato: { R: { u1: 6 }, F: { u2: 20 } },
    piezas_por_formato: { R: { salieron: 6, editadas: 2 }, F: { salieron: 20, editadas: 20 } },
    piezas_totales: 26,
    piezas_editadas: 22,
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
  render(
    <AvRendimientoView
      pautas={pautas}
      lines={lines}
      generalLineId={null}
      usersById={users}
      piezasByPauta={piezas}
      cnpAv={cnp}
      pendientes={pendientesPorEditar(pautas, piezas, lines)}
      onSelectPendiente={onSelectPendiente}
      {...props}
    />,
  )
  return { onSelectPendiente }
}

describe('AvRendimientoView', () => {
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

  it('piezas por línea sigue mostrando el total crudo', () => {
    setup()
    expect(screen.getByText('22 / 26 ed.')).toBeInTheDocument()
  })

  it('estados vacíos', () => {
    setup({
      pautas: [],
      piezasByPauta: new Map(),
      cnpAv: [],
      pendientes: { porLinea: [], porPauta: new Map() },
    })
    expect(screen.getByText(/Todo lo capturado este mes ya está editado/)).toBeInTheDocument()
    expect(screen.getByText(/no hay videos/)).toBeInTheDocument()
    expect(screen.getByText(/no hay fotos/)).toBeInTheDocument()
    expect(screen.getByText('Sin piezas registradas este mes.')).toBeInTheDocument()
  })
})
