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
const ROWS = [
  {
    id: 'r1',
    client_id: 'c1',
    slot_key: '2026-12-24',
    formato: 'foto',
    diseno_status: 'enviado_cliente',
    audiovisual_status: 'aprobado',
  },
]

function renderGrid(props = {}) {
  const handlers = {
    onCellChange: vi.fn(),
    onAssign: vi.fn(),
  }
  render(
    <TemporadaGrid
      lines={LINES}
      clients={CLIENTS}
      rows={ROWS}
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

  it('cada fecha tiene un header con la fecha y debajo Formato, Diseño y Audiovisual', () => {
    renderGrid({ clients: [CLIENTS[0]] })
    const date = screen.getByRole('columnheader', { name: '24/12' })
    expect(date).toHaveAttribute('colspan', '3')
    expect(date).toHaveAttribute('rowspan', '1')
    const [, subheaders] = screen.getAllByRole('row')
    expect(
      within(subheaders)
        .getAllByRole('columnheader')
        .map((th) => th.textContent),
    ).toEqual(['Formato', 'Diseño', 'Audiovisual'])
  })

  it('la tarjeta es una sola columna de estado, sin subcolumnas', () => {
    renderGrid({ clients: [CLIENTS[0]] })
    const tarjeta = screen.getByRole('columnheader', { name: 'Tarjeta navidad' })
    expect(tarjeta).toHaveAttribute('colspan', '1')
    expect(tarjeta).toHaveAttribute('rowspan', '2')
    // Cliente + Jefe + SM + 3 de la fecha + 1 de la tarjeta.
    expect(within(screen.getAllByRole('row')[2]).getAllByRole('cell')).toHaveLength(7)
  })

  it('muestra el formato y el estado de cada columna; lo no tocado queda «Sin estado»', () => {
    renderGrid({ clients: [CLIENTS[0]] })
    expect(screen.getByText('Audiovisual - Foto')).toBeInTheDocument()
    expect(screen.getByText('Enviado al cliente')).toBeInTheDocument()
    expect(screen.getByText('Aprobado')).toBeInTheDocument()
    // La tarjeta de Flexmed no tiene fila todavía.
    expect(screen.getByText('Sin estado')).toBeInTheDocument()
  })

  it('elegir un estado dispara onCellChange con cliente, slot, columna y valor', () => {
    const { onCellChange } = renderGrid({ clients: [CLIENTS[0]] })
    fireEvent.click(screen.getByRole('button', { name: /Aprobado/ }))
    fireEvent.click(screen.getByRole('button', { name: 'N/A' }))
    expect(onCellChange).toHaveBeenCalledWith(CLIENTS[0], SLOTS[0], 'audiovisual_status', 'na')
  })

  it('cada columna ofrece su propia lista: Audiovisual y Diseño no son iguales', () => {
    renderGrid({ clients: [CLIENTS[0]] })
    const menuOf = (pill) => {
      fireEvent.click(pill)
      const menu = document.body.querySelector('div[style*="position: fixed"]')
      const labels = within(menu)
        .getAllByRole('button')
        .map((b) => b.textContent)
      fireEvent.mouseDown(document.body)
      return labels
    }
    // El portal es de posición fija: se distingue de las píldoras de la tabla.
    expect(menuOf(screen.getByRole('button', { name: /Aprobado/ }))).toEqual([
      'N/A',
      'Pendiente por grabar',
      'Agendado',
      'En edición',
      'Enviado al cliente',
      'Aprobado',
      'Pendiente cliente',
      'En diseño',
    ])
    expect(menuOf(screen.getByRole('button', { name: /Enviado al cliente/ }))).toEqual([
      'N/A',
      'Pendiente por redes',
      'Enviado a diseño',
      'En modificación',
      'Enviado al cliente',
      'Aprobado',
      'Pendiente cliente',
    ])
  })

  it('elegir un formato dispara onCellChange con la columna formato', () => {
    const { onCellChange } = renderGrid({ clients: [CLIENTS[0]] })
    fireEvent.click(screen.getByRole('button', { name: /Audiovisual - Foto/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Audiovisual - Reel' }))
    expect(onCellChange).toHaveBeenCalledWith(CLIENTS[0], SLOTS[0], 'formato', 'reel')
  })

  it('sin permiso de gestión es solo lectura: nombres y estados como texto, sin botones', () => {
    renderGrid({ canManage: false, clients: [CLIENTS[0]] })
    expect(screen.queryByLabelText('Jefe de Flexmed')).not.toBeInTheDocument()
    expect(screen.getByText('Daniellys')).toBeInTheDocument()
    expect(screen.getByText('Maria')).toBeInTheDocument()
    expect(screen.getByText('Aprobado')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Aprobado/ })).not.toBeInTheDocument()
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

  it('separa las columnas con líneas verticales (la última sin línea)', () => {
    renderGrid({ clients: [CLIENTS[0]] })
    const headers = screen.getAllByRole('columnheader')
    // Cliente (fija) usa sombra interior; el resto, borde derecho.
    expect(headers[0].className).toContain('shadow-[inset_-1px_0_0_#e8e4d8]')
    for (const th of headers.slice(1)) expect(th.className).toContain('border-r')
    expect(headers.at(-1).className).toContain('last:border-r-0')
    const cells = within(screen.getAllByRole('row')[2]).getAllByRole('cell')
    expect(cells[0].className).toContain('shadow-[inset_-1px_0_0_#e8e4d8]')
    for (const td of cells.slice(1)) expect(td.className).toContain('border-r')
  })

  it('los grupos de columnas se intercalan con fondo amarillo suave, encabezado y celdas', () => {
    renderGrid({ clients: [CLIENTS[0]] })
    // 24/12 (grupo 1, con fondo) y Tarjeta navidad (grupo 2, sin fondo).
    expect(screen.getByRole('columnheader', { name: '24/12' }).className).toContain('bg-[#fff4cf]')
    expect(screen.getByRole('columnheader', { name: 'Formato' }).className).toContain(
      'bg-[#fff4cf]',
    )
    expect(screen.getByRole('columnheader', { name: 'Tarjeta navidad' }).className).not.toContain(
      'bg-[#fff4cf]',
    )
    const cells = within(screen.getAllByRole('row')[2]).getAllByRole('cell')
    // Cliente, Jefe, SM sin fondo; las 3 de la fecha con fondo y hover; la tarjeta sin fondo.
    for (const td of cells.slice(0, 3)) expect(td.className).not.toContain('bg-[#fffbec]')
    for (const td of cells.slice(3, 6)) {
      expect(td.className).toContain('bg-[#fffbec]')
      expect(td.className).toContain('group-hover:bg-[#fff5d6]')
    }
    expect(cells[6].className).not.toContain('bg-[#fffbec]')
  })

  it('no hay líneas horizontales; la fila se sombrea con hover, también la celda fija', () => {
    renderGrid({ clients: [CLIENTS[0]] })
    const [header, , row] = screen.getAllByRole('row')
    expect(header.className).not.toContain('border-b')
    expect(row.className).not.toContain('border-b')
    expect(row.className).toContain('hover:bg-[#faf9f5]')
    expect(row.className).toContain('group')
    // La celda de Cliente tiene fondo propio (sticky): debe seguir al hover de la fila.
    expect(within(row).getAllByRole('cell')[0].className).toContain('group-hover:bg-[#faf9f5]')
  })
})
