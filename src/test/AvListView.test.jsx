import { render, screen, fireEvent } from '@testing-library/react'
import { vi } from 'vitest'
import AvListView from '../components/pautas/AvListView'

const users = new Map([['r1', { user_id: 'r1', first_name: 'Rafa', last_name: 'Cam' }]])
const lines = [{ id: 'l1', name: 'Georgina' }]
const p = (o) => ({
  id: 'x',
  client_name: 'Cliente',
  line_id: 'l1',
  status: 'solicitada',
  lugar_tipo: 'locacion',
  place: '',
  pauta_date: null,
  salida: null,
  formats: ['R'],
  recurso_ids: [],
  deleted_at: null,
  piezas_por_formato: {},
  ...o,
})
const pautas = [
  p({ id: 'a', client_name: 'Solicitada A', tema: 'Lanzamiento' }),
  p({
    id: 'b',
    client_name: 'Agendada B',
    status: 'programada',
    pauta_date: '2026-10-10',
    recurso_ids: ['r1'],
  }),
  p({
    id: 'c',
    client_name: 'Realizada C',
    status: 'realizada',
    pauta_date: '2026-10-05',
    piezas_por_formato: { R: { salieron: 10, editadas: 4 } },
  }),
  p({ id: 'd', client_name: 'Borrada D', deleted_at: 'x' }),
]
const piezas = new Map([
  ['c', [{ es_lote: true, formato: 'R', cantidad: 6, listas: 4, status: 'en_edicion' }]],
])

function setup(filter = {}, props = {}) {
  const onFilterChange = vi.fn()
  const onPautaClick = vi.fn()
  render(
    <AvListView
      pautas={pautas}
      piezasByPauta={piezas}
      lines={lines}
      generalLineId={null}
      usersById={users}
      recursoUsers={[...users.values()]}
      filter={{ status: 'solicitadas', recursoId: null, query: '', pendiente: null, ...filter }}
      onFilterChange={onFilterChange}
      pendientes={{
        porLinea: [],
        porPauta: new Map([['c', { V: 0, R: 6, F: 0, sinDesglose: 0 }]]),
      }}
      onPautaClick={onPautaClick}
      {...props}
    />,
  )
  return { onFilterChange, onPautaClick }
}

describe('AvListView', () => {
  it('chips con conteo y filtro por estado; clic en fila abre el detalle', () => {
    const { onFilterChange, onPautaClick } = setup()
    expect(screen.getByRole('button', { name: /Solicitadas1/ })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    expect(screen.getByRole('button', { name: /Papelera1/ })).toBeInTheDocument()
    expect(screen.getByText('Solicitada A')).toBeInTheDocument()
    expect(screen.queryByText('Agendada B')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /Agendadas1/ }))
    expect(onFilterChange).toHaveBeenCalledWith(expect.objectContaining({ status: 'agendadas' }))
    fireEvent.click(screen.getByText('Solicitada A'))
    expect(onPautaClick).toHaveBeenCalledWith(expect.objectContaining({ id: 'a' }))
  })

  it('realizadas muestran la mini barra editadas/salieron por formato', () => {
    setup({ status: 'realizadas' })
    expect(screen.getByText('Realizada C')).toBeInTheDocument()
    expect(screen.getByText('4/10')).toBeInTheDocument()
  })

  it('filtra por recurso', () => {
    setup({ status: 'agendadas', recursoId: 'r1' })
    expect(screen.getByText('Agendada B')).toBeInTheDocument()
  })

  it('con texto que no coincide muestra el vacío', () => {
    setup({ query: 'zzz' })
    expect(screen.getByText(/No hay pautas/)).toBeInTheDocument()
  })

  it('el filtro de pendientes reemplaza los chips y se puede quitar', () => {
    const { onFilterChange } = setup({ pendiente: { lineId: 'l1', formato: 'R' } })
    expect(screen.getByText(/Pendiente por editar: Reel · Georgina/)).toBeInTheDocument()
    expect(screen.getByText('Realizada C')).toBeInTheDocument()
    expect(screen.queryByText('Solicitada A')).not.toBeInTheDocument()
    fireEvent.click(screen.getByLabelText('Quitar filtro de pendientes'))
    expect(onFilterChange).toHaveBeenCalledWith(expect.objectContaining({ pendiente: null }))
  })

  it('el filtro de línea (desde Datos) acota las pautas y se puede quitar', () => {
    const { onFilterChange } = setup(
      {
        status: 'agendadas',
        lineId: 'l1',
      },
      {
        pautas: [
          ...pautas,
          p({
            id: 'e',
            client_name: 'Otra línea E',
            status: 'programada',
            line_id: 'l2',
            pauta_date: '2026-10-11',
          }),
        ],
      },
    )
    expect(screen.getByText('Línea: Georgina')).toBeInTheDocument()
    expect(screen.getByText('Agendada B')).toBeInTheDocument()
    expect(screen.queryByText('Otra línea E')).not.toBeInTheDocument()
    fireEvent.click(screen.getByLabelText('Quitar filtro de línea'))
    expect(onFilterChange).toHaveBeenCalledWith(expect.objectContaining({ lineId: null }))
  })

  it('papelera lista solo las borradas', () => {
    setup({ status: 'papelera' })
    expect(screen.getByText('Borrada D')).toBeInTheDocument()
    expect(screen.getByText('En papelera')).toBeInTheDocument()
  })
})
