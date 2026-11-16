import { render, screen, fireEvent } from '@testing-library/react'
import { vi } from 'vitest'
import TemporadaGrid from '../components/chequeo/temporada/TemporadaGrid'

const SLOTS = [
  { key: '2026-12-24', label: '24/12', kind: 'post' },
  { key: 'tarjeta_navidad', label: 'Tarjeta navidad', kind: 'tarjeta' },
]
const LINES = [
  { id: 'l1', name: 'Línea Uno', lead_user_id: 'u-jefe' },
  { id: 'gen', name: 'Independientes', is_general: true, lead_user_id: null },
]
const CLIENTS = [
  { id: 'c1', name: 'Flexmed', line_id: 'l1', social_manager_id: 'u-sm' },
  { id: 'c2', name: 'Suelta', line_id: null, social_manager_id: null },
]
const USERS = new Map([
  ['u-jefe', { user_id: 'u-jefe', first_name: 'Daniellys', last_name: 'X' }],
  ['u-sm', { user_id: 'u-sm', first_name: 'Maria', last_name: 'Y' }],
])
const PIECES = [
  { id: 'p1', client_id: 'c1', slot_key: '2026-12-24', piece_type: 'foto', status: 'aprobado' },
]

function renderGrid(props = {}) {
  const handlers = { onAdd: vi.fn(), onStatusChange: vi.fn(), onRemove: vi.fn() }
  render(
    <TemporadaGrid
      lines={LINES}
      clients={CLIENTS}
      pieces={PIECES}
      slots={SLOTS}
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
  it('deriva Jefe y SM de la línea y de la cuenta; Independientes queda sin jefe', () => {
    renderGrid()
    expect(screen.getByText('Daniellys')).toBeInTheDocument()
    expect(screen.getByText('Maria')).toBeInTheDocument()
    // Suelta cae en la línea general (sin jefe ni SM): dos celdas vacías «—».
    expect(screen.getAllByText('—').length).toBeGreaterThanOrEqual(2)
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

  it('sin permiso de gestión es solo lectura: no hay botones de agregar ni quitar', () => {
    renderGrid({ canManage: false })
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
