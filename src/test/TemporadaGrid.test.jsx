import { render, screen, fireEvent } from '@testing-library/react'
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
  it('las 4 casillas de personal son selectores que arrancan con lo de MAPPI', () => {
    renderGrid({ clients: [CLIENTS[0]] })
    for (const [label, name] of [
      ['Jefe de Flexmed', 'De MAPPI: Daniellys X'],
      ['SM de Flexmed', 'De MAPPI: Maria Y'],
      ['Diseño de Flexmed', 'De MAPPI: Diego Z'],
      // de audiovisual (que admite varios) se toma el primero
      ['Audiovisual de Flexmed', 'De MAPPI: Ana V'],
    ]) {
      const select = screen.getByLabelText(label)
      expect(select).toHaveValue(USE_MAPPI)
      expect(select).toHaveDisplayValue(name)
    }
  })

  it('Independientes arranca sin jefe', () => {
    renderGrid({ clients: [CLIENTS[1]] })
    expect(screen.getByLabelText('Jefe de Suelta')).toHaveDisplayValue('De MAPPI: sin asignar')
  })

  it('una asignación manual manda sobre MAPPI, incluso «sin asignar»', () => {
    renderGrid({
      clients: [CLIENTS[0]],
      assignments: [
        { id: 'a1', client_id: 'c1', role: 'jefe', user_id: 'u-sm' },
        { id: 'a2', client_id: 'c1', role: 'sm', user_id: null },
      ],
    })
    expect(screen.getByLabelText('Jefe de Flexmed')).toHaveValue('u-sm')
    expect(screen.getByLabelText('SM de Flexmed')).toHaveValue('')
    expect(screen.getByLabelText('Diseño de Flexmed')).toHaveValue(USE_MAPPI)
  })

  it('elegir una persona, «sin asignar» o «de MAPPI» dispara onAssign', () => {
    const { onAssign } = renderGrid({ clients: [CLIENTS[0]] })
    fireEvent.change(screen.getByLabelText('Jefe de Flexmed'), { target: { value: 'u-av' } })
    expect(onAssign).toHaveBeenLastCalledWith(CLIENTS[0], 'jefe', 'u-av')
    fireEvent.change(screen.getByLabelText('SM de Flexmed'), { target: { value: '' } })
    expect(onAssign).toHaveBeenLastCalledWith(CLIENTS[0], 'sm', '')
    fireEvent.change(screen.getByLabelText('SM de Flexmed'), { target: { value: USE_MAPPI } })
    expect(onAssign).toHaveBeenLastCalledWith(CLIENTS[0], 'sm', USE_MAPPI)
  })

  it('no ofrece empleados archivados salvo que sean la persona asignada', () => {
    renderGrid({ clients: [CLIENTS[0]] })
    expect(screen.queryByRole('option', { name: 'Archivado Q' })).not.toBeInTheDocument()
    renderGrid({
      clients: [CLIENTS[0]],
      assignments: [{ id: 'a1', client_id: 'c1', role: 'jefe', user_id: 'u-old' }],
    })
    expect(screen.getAllByRole('option', { name: 'Archivado Q' }).length).toBeGreaterThan(0)
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
