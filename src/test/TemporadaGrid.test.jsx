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
    designer_id: 'u-dis',
    audiovisual_ids: ['u-av', 'u-av2'],
  },
  { id: 'c2', name: 'Suelta', line_id: null, social_manager_id: null },
]
const USER_LIST = [
  { user_id: 'u-jefe', first_name: 'Daniellys', last_name: 'X' },
  { user_id: 'u-sm', first_name: 'Maria', last_name: 'Y' },
  { user_id: 'u-dis', first_name: 'Diego', last_name: 'Z' },
  { user_id: 'u-av', first_name: 'Ana', last_name: 'V' },
  { user_id: 'u-beto', first_name: 'Beto', last_name: 'B' },
  { user_id: 'u-old', first_name: 'Archivado', last_name: 'Q', deleted_at: '2026-01-01' },
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

  it('las 4 casillas de personal muestran a la persona de MAPPI, sin texto extra', () => {
    renderGrid({ clients: [CLIENTS[0]] })
    expect(within(group('Jefe de Flexmed')).getByText('Daniellys X')).toBeInTheDocument()
    expect(within(group('SM de Flexmed')).getByText('Maria Y')).toBeInTheDocument()
    expect(within(group('Diseño de Flexmed')).getByText('Diego Z')).toBeInTheDocument()
    // de audiovisual (que admite varios) se toma el primero
    expect(within(group('Audiovisual de Flexmed')).getByText('Ana V')).toBeInTheDocument()
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
    expect(within(group('Jefe de Flexmed')).getByText('Maria Y')).toBeInTheDocument()
    expect(within(group('SM de Flexmed')).getByText('Sin asignar')).toBeInTheDocument()
    expect(within(group('Diseño de Flexmed')).getByText('Diego Z')).toBeInTheDocument()
    expect(screen.getByLabelText('Restablecer Jefe de Flexmed')).toBeInTheDocument()
    expect(screen.getByLabelText('Restablecer SM de Flexmed')).toBeInTheDocument()
    expect(screen.queryByLabelText('Restablecer Diseño de Flexmed')).not.toBeInTheDocument()
  })

  it('elegir una persona dispara onAssign con su id', () => {
    const { onAssign } = renderGrid({ clients: [CLIENTS[0]] })
    fireEvent.click(within(group('Jefe de Flexmed')).getAllByRole('button')[0])
    fireEvent.click(screen.getByRole('button', { name: /Beto B/ }))
    expect(onAssign).toHaveBeenCalledWith(CLIENTS[0], 'jefe', 'u-beto')
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
    expect(within(group('Jefe de Flexmed')).getByText('Archivado Q')).toBeInTheDocument()
    fireEvent.click(within(group('SM de Flexmed')).getAllByRole('button')[0])
    // Abierto el selector, el archivado no aparece como opción (solo como asignado arriba).
    expect(screen.getAllByText('Archivado Q')).toHaveLength(1)
  })

  it('muestra una columna por slot y la pieza existente con su estado', () => {
    renderGrid()
    expect(screen.getByText('24/12')).toBeInTheDocument()
    expect(screen.getByText('Tarjeta navidad')).toBeInTheDocument()
    expect(screen.getByText('Foto')).toBeInTheDocument()
    expect(screen.getByText('Aprobado')).toBeInTheDocument()
  })

  it('agregar un formato dispara onAdd con cliente, slot y tipo', () => {
    const { onAdd } = renderGrid()
    // c1 ya tiene Foto en el 24/12, así que ofrece + Diseño y + Reel.
    fireEvent.click(screen.getAllByText('+ Reel')[0])
    expect(onAdd).toHaveBeenCalledWith(CLIENTS[0], SLOTS[0], 'reel')
  })

  it('la tarjeta solo ofrece diseño', () => {
    renderGrid({ clients: [CLIENTS[0]] })
    // Foto existe en el 24/12 → Diseño y Reel; la tarjeta → solo Diseño: 2 de Diseño en total.
    expect(screen.getAllByText('+ Diseño')).toHaveLength(2)
    expect(screen.getAllByText('+ Reel')).toHaveLength(1)
    expect(screen.queryByText('+ Foto')).not.toBeInTheDocument()
  })

  it('quitar una pieza dispara onRemove', () => {
    const { onRemove } = renderGrid()
    fireEvent.click(screen.getByLabelText('Quitar Foto'))
    expect(onRemove).toHaveBeenCalledWith(PIECES[0])
  })

  it('sin permiso de gestión es solo lectura: nombres como texto, sin selectores ni botones', () => {
    renderGrid({ canManage: false, clients: [CLIENTS[0]] })
    expect(screen.queryByLabelText('Jefe de Flexmed')).not.toBeInTheDocument()
    expect(screen.getByText('Daniellys')).toBeInTheDocument()
    expect(screen.getByText('Maria')).toBeInTheDocument()
    expect(screen.queryByText(/^\+ /)).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Quitar Foto')).not.toBeInTheDocument()
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
