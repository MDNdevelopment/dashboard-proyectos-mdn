import { render, screen, fireEvent, within } from '@testing-library/react'
import { vi } from 'vitest'
import TemporadaGrid from '../components/chequeo/temporada/TemporadaGrid'
import { USE_MAPPI } from '../utils/temporada'

const SLOTS = [
  { key: '2026-12-24', label: '24/12', kind: 'post' },
  { key: 'tarjeta_navidad', label: 'Tarjeta navidad', kind: 'tarjeta' },
]
const LINES = [
  { id: 'l1', name: 'Línea Uno', lead_user_id: 'u-jefe' },
  { id: 'gen', name: 'Independientes', is_general: true, lead_user_id: null },
]
const CLIENTS = [
  {
    id: 'c1',
    name: 'Flexmed',
    line_id: 'l1',
    social_manager_id: 'u-sm',
  },
  { id: 'c2', name: 'Suelta', line_id: null, social_manager_id: null },
]
const USER_LIST = [
  { user_id: 'u-jefe', first_name: 'Daniellys', last_name: 'X' },
  { user_id: 'u-sm', first_name: 'Maria', last_name: 'Y' },
  { user_id: 'u-sabrina', first_name: 'Sabrina', last_name: 'B' },
  { user_id: 'u-ajeno', first_name: 'Pedro', last_name: 'P' },
  { user_id: 'u-old', first_name: 'Katherine', last_name: 'Q', deleted_at: '2026-01-01' },
]
const USERS = new Map(USER_LIST.map((u) => [u.user_id, u]))
const PIECES = [
  { id: 'p1', client_id: 'c1', slot_key: '2026-12-24', piece_type: 'foto', status: 'aprobado' },
]

function renderGrid(props = {}) {
  const handlers = {
    onAdd: vi.fn(),
    onStatusChange: vi.fn(),
    onRemove: vi.fn(),
    onAssign: vi.fn(),
  }
  render(
    <TemporadaGrid
      lines={LINES}
      clients={CLIENTS}
      pieces={PIECES}
      assignments={[]}
      slots={SLOTS}
      users={USER_LIST}
      usersById={USERS}
      generalLineId="gen"
      groupByLine={false}
      canManage
      {...handlers}
      {...props}
    />,
  )
  return handlers
}

describe('TemporadaGrid', () => {
  const group = (label) => screen.getByRole('group', { name: label })

  it('solo hay dos casillas de personal, Jefe y SM, como la hoja', () => {
    renderGrid({ clients: [CLIENTS[0]] })
    expect(screen.getAllByRole('group')).toHaveLength(2)
    expect(within(group('Jefe de Flexmed')).getByText('Daniellys')).toBeInTheDocument()
    expect(within(group('SM de Flexmed')).getByText('Maria')).toBeInTheDocument()
    expect(screen.queryByRole('columnheader', { name: 'Diseño' })).not.toBeInTheDocument()
    expect(screen.queryByRole('columnheader', { name: 'Audiovisual' })).not.toBeInTheDocument()
    expect(screen.queryByText(/mappi/i)).not.toBeInTheDocument()
    expect(screen.queryByLabelText(/^Restablecer/)).not.toBeInTheDocument()
  })

  it('Independientes arranca sin jefe', () => {
    renderGrid({ clients: [CLIENTS[1]] })
    expect(within(group('Jefe de Suelta')).getByText('Sin asignar')).toBeInTheDocument()
  })

  it('una asignación manual manda sobre MAPPI, incluso «sin asignar», y se puede restablecer', () => {
    renderGrid({
      clients: [CLIENTS[0]],
      assignments: [
        { id: 'a1', client_id: 'c1', role: 'jefe', user_id: 'u-sm' },
        { id: 'a2', client_id: 'c1', role: 'sm', user_id: null },
      ],
    })
    expect(within(group('Jefe de Flexmed')).getByText('Maria')).toBeInTheDocument()
    expect(within(group('SM de Flexmed')).getByText('Sin asignar')).toBeInTheDocument()
    expect(screen.getByLabelText('Restablecer Jefe de Flexmed')).toBeInTheDocument()
    expect(screen.getByLabelText('Restablecer SM de Flexmed')).toBeInTheDocument()
  })

  it('elegir una persona dispara onAssign con su id', () => {
    const { onAssign } = renderGrid({ clients: [CLIENTS[0]] })
    fireEvent.click(within(group('Jefe de Flexmed')).getAllByRole('button')[0])
    fireEvent.click(screen.getByRole('button', { name: /Sabrina B/ }))
    expect(onAssign).toHaveBeenCalledWith(CLIENTS[0], 'jefe', 'u-sabrina')
  })

  it('solo ofrece a las personas del desplegable de la hoja', () => {
    renderGrid({ clients: [CLIENTS[0]] })
    fireEvent.click(within(group('Jefe de Flexmed')).getAllByRole('button')[0])
    expect(screen.getByRole('button', { name: /Sabrina B/ })).toBeInTheDocument()
    // Pedro no está en la lista de la hoja; Maria tampoco (la lista dice «Maria Fernanda»).
    expect(screen.queryByRole('button', { name: /Pedro P/ })).not.toBeInTheDocument()
  })

  it('«Ninguno» deja la casilla sin asignar a propósito', () => {
    const { onAssign } = renderGrid({ clients: [CLIENTS[0]] })
    fireEvent.click(within(group('SM de Flexmed')).getAllByRole('button')[0])
    fireEvent.click(screen.getByRole('button', { name: /Ninguno/ }))
    expect(onAssign).toHaveBeenCalledWith(CLIENTS[0], 'sm', '')
  })

  it('el ↺ vuelve a la persona original de MAPPI', () => {
    const { onAssign } = renderGrid({
      clients: [CLIENTS[0]],
      assignments: [{ id: 'a1', client_id: 'c1', role: 'jefe', user_id: 'u-sm' }],
    })
    fireEvent.click(screen.getByLabelText('Restablecer Jefe de Flexmed'))
    expect(onAssign).toHaveBeenCalledWith(CLIENTS[0], 'jefe', USE_MAPPI)
  })

  it('no ofrece empleados archivados, pero conserva al ya asignado', () => {
    renderGrid({
      clients: [CLIENTS[0]],
      assignments: [{ id: 'a1', client_id: 'c1', role: 'jefe', user_id: 'u-old' }],
    })
    expect(within(group('Jefe de Flexmed')).getByText('Katherine')).toBeInTheDocument()
    fireEvent.click(within(group('SM de Flexmed')).getAllByRole('button')[0])
    // Katherine está en la lista de la hoja, pero archivada: no se ofrece como opción nueva.
    expect(screen.getAllByRole('button', { name: /Katherine/ })).toHaveLength(1)
  })

  it('muestra una columna por slot y la pieza existente con su estado', () => {
    renderGrid()
    expect(screen.getByText('24/12')).toBeInTheDocument()
    expect(screen.getByText('Tarjeta navidad')).toBeInTheDocument()
    expect(screen.getByText('Audiovisual - Foto')).toBeInTheDocument()
    expect(screen.getByText('Aprobado')).toBeInTheDocument()
  })

  it('agregar un formato dispara onAdd con cliente, slot y tipo', () => {
    const { onAdd } = renderGrid()
    // c1 ya tiene Foto en el 24/12, así que ofrece + Diseño y + Audiovisual - Reel.
    fireEvent.click(screen.getAllByText('+ Audiovisual - Reel')[0])
    expect(onAdd).toHaveBeenCalledWith(CLIENTS[0], SLOTS[0], 'reel')
  })

  it('la tarjeta es un solo estado: se agrega como «+ Tarjeta», sin elegir formato', () => {
    const { onAdd } = renderGrid({ clients: [CLIENTS[0]] })
    expect(screen.getAllByText('+ Diseño')).toHaveLength(1)
    expect(screen.getAllByText('+ Audiovisual - Reel')).toHaveLength(1)
    expect(screen.queryByText('+ Audiovisual - Foto')).not.toBeInTheDocument()
    fireEvent.click(screen.getByText('+ Tarjeta'))
    expect(onAdd).toHaveBeenCalledWith(CLIENTS[0], SLOTS[1], 'diseno')
  })

  it('quitar una pieza dispara onRemove', () => {
    const { onRemove } = renderGrid()
    fireEvent.click(screen.getByLabelText('Quitar Audiovisual - Foto'))
    expect(onRemove).toHaveBeenCalledWith(PIECES[0])
  })

  it('sin permiso de gestión es solo lectura: nombres como texto, sin selectores ni botones', () => {
    renderGrid({ canManage: false, clients: [CLIENTS[0]] })
    expect(screen.queryByLabelText('Jefe de Flexmed')).not.toBeInTheDocument()
    expect(screen.getByText('Daniellys')).toBeInTheDocument()
    expect(screen.getByText('Maria')).toBeInTheDocument()
    expect(screen.queryByText(/^\+ /)).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Quitar Audiovisual - Foto')).not.toBeInTheDocument()
  })

  it('agrupado por línea muestra el encabezado de cada línea con cuentas', () => {
    renderGrid({ groupByLine: true })
    expect(screen.getByText('Línea Uno')).toBeInTheDocument()
    expect(screen.getByText('Independientes')).toBeInTheDocument()
  })

  it('sin cuentas muestra el estado vacío', () => {
    renderGrid({ clients: [] })
    expect(screen.getByText('No hay cuentas para mostrar')).toBeInTheDocument()
  })
})
