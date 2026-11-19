/**
 * Tests de AdsList/AdsCard (tab Tácticas): click en una fila abre el modal de
 * detalle (onSelect), mientras que los controles internos (estado, editar,
 * eliminar, edición inline del nombre) no disparan esa apertura (stopPropagation).
 */
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi } from 'vitest'

vi.mock('../supabase', () => ({
  supabase: {
    from: vi.fn(() => ({
      update: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      delete: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: null, error: null }),
    })),
  },
}))

import AdsList from '../components/ads/AdsList'

const CAMPAIGN = {
  id: 'camp-1',
  name: 'Táctica Julio',
  client: 'Banco Exterior',
  client_id: 'c-1',
  assignee: 'u1',
  priority: 'Media',
  status: 'Pendiente',
  notes: '',
  start_date: '2026-07-05',
  end_date: '2026-07-20',
}

describe('AdsList — click en fila abre detalle', () => {
  it('clic en la fila (fuera de los controles interactivos) llama a onSelect con la campaña', async () => {
    const user = userEvent.setup()
    const onSelect = vi.fn()
    render(
      <AdsList
        campaigns={[CAMPAIGN]}
        loading={false}
        canManage={true}
        usersMap={new Map()}
        clientsById={new Map()}
        onSelect={onSelect}
        onUpdated={() => {}}
        onDeleted={() => {}}
        onEdit={() => {}}
      />,
    )

    // El texto del nombre tiene su propio onClick (edición inline); clicamos
    // en la celda del cliente, que no intercepta el click.
    await user.click(screen.getByText('Banco Exterior', { selector: 'span' }))
    expect(onSelect).toHaveBeenCalledWith(CAMPAIGN)
  })

  it('clic en el botón Editar (acciones) NO llama a onSelect', async () => {
    const user = userEvent.setup()
    const onSelect = vi.fn()
    const onEdit = vi.fn()
    render(
      <AdsList
        campaigns={[CAMPAIGN]}
        loading={false}
        canManage={true}
        usersMap={new Map()}
        clientsById={new Map()}
        onSelect={onSelect}
        onUpdated={() => {}}
        onDeleted={() => {}}
        onEdit={onEdit}
      />,
    )

    await user.click(screen.getByTitle('Editar'))
    expect(onEdit).toHaveBeenCalledWith(CAMPAIGN)
    expect(onSelect).not.toHaveBeenCalled()
  })

  it('clic en el StatusPill (badge de estado) NO llama a onSelect', async () => {
    const user = userEvent.setup()
    const onSelect = vi.fn()
    render(
      <AdsList
        campaigns={[CAMPAIGN]}
        loading={false}
        canManage={true}
        usersMap={new Map()}
        clientsById={new Map()}
        onSelect={onSelect}
        onUpdated={() => {}}
        onDeleted={() => {}}
        onEdit={() => {}}
      />,
    )

    await user.click(screen.getByRole('button', { name: 'Pendiente' }))
    expect(onSelect).not.toHaveBeenCalled()
  })
})

describe('AdsList — export', () => {
  it('ya no muestra el botón de export CSV (movido a la tab Ads como Excel)', () => {
    render(
      <AdsList
        campaigns={[CAMPAIGN]}
        loading={false}
        canManage={true}
        usersMap={new Map()}
        clientsById={new Map()}
        onSelect={() => {}}
        onUpdated={() => {}}
        onDeleted={() => {}}
        onEdit={() => {}}
      />,
    )
    expect(screen.queryByRole('button', { name: /CSV/i })).not.toBeInTheDocument()
  })
})

describe('AdsList — historial: cumplimiento, Drive y filtros', () => {
  const baseProps = {
    loading: false,
    canManage: true,
    usersMap: new Map(),
    clientsById: new Map(),
    onSelect: () => {},
    onUpdated: () => {},
    onDeleted: () => {},
    onEdit: () => {},
  }
  const FOLDER = 'https://drive.google.com/drive/folders/1AbCdEfGhIjKlMnOpQrStUvWxYz012345'

  it('ya no tiene la columna ni el filtro de Prioridad', () => {
    render(<AdsList campaigns={[CAMPAIGN]} {...baseProps} />)
    expect(screen.queryByText('Prioridad')).not.toBeInTheDocument()
    expect(screen.queryByText('Media')).not.toBeInTheDocument()
  })

  it('muestra el % de cumplimiento de las acciones', () => {
    const c = {
      ...CAMPAIGN,
      checklist: [
        { id: 'a', title: 'A', done: true },
        { id: 'b', title: 'B', done: false },
        { id: 'c', title: 'C', done: false },
        { id: 'd', title: 'D', done: true },
      ],
    }
    render(<AdsList campaigns={[c]} {...baseProps} />)
    expect(screen.getByText('50%')).toBeInTheDocument()
  })

  it('sin checklist no inventa un 0 %: muestra un guion', () => {
    render(<AdsList campaigns={[CAMPAIGN]} {...baseProps} />)
    expect(screen.queryByText('0%')).not.toBeInTheDocument()
  })

  it('el link de Drive abre en pestaña nueva y no abre el detalle de la fila', async () => {
    const user = userEvent.setup()
    const onSelect = vi.fn()
    render(
      <AdsList
        campaigns={[{ ...CAMPAIGN, drive_url: FOLDER }]}
        {...baseProps}
        onSelect={onSelect}
      />,
    )

    const link = screen.getByRole('link', { name: 'Carpeta' })
    expect(link).toHaveAttribute('href', FOLDER)
    expect(link).toHaveAttribute('target', '_blank')
    expect(link).toHaveAttribute('rel', expect.stringContaining('noreferrer'))

    await user.click(link)
    expect(onSelect).not.toHaveBeenCalled()
  })

  it('sin link de Drive no muestra ningún enlace', () => {
    render(<AdsList campaigns={[CAMPAIGN]} {...baseProps} />)
    expect(screen.queryByRole('link', { name: 'Carpeta' })).not.toBeInTheDocument()
  })

  it('busca también por el objetivo general', async () => {
    const user = userEvent.setup()
    const otra = { ...CAMPAIGN, id: 'camp-2', name: 'Otra', objective: 'Subir las ventas' }
    render(<AdsList campaigns={[CAMPAIGN, otra]} {...baseProps} />)

    await user.type(screen.getByLabelText('Buscar'), 'ventas')

    expect(screen.getByText('Otra')).toBeInTheDocument()
    expect(screen.queryByText('Táctica Julio')).not.toBeInTheDocument()
  })

  it('"Limpiar" aparece solo con filtros activos y los restablece', async () => {
    const user = userEvent.setup()
    render(<AdsList campaigns={[CAMPAIGN]} {...baseProps} />)
    expect(screen.queryByRole('button', { name: 'Limpiar' })).not.toBeInTheDocument()

    await user.selectOptions(screen.getByLabelText('Estado'), 'Finalizado')
    expect(screen.getByText('Sin resultados para los filtros aplicados')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Limpiar' }))
    expect(screen.getByText('Táctica Julio')).toBeInTheDocument()
  })

  it('ordena por cumplimiento y manda las tácticas sin checklist al final al ordenar de mayor a menor', async () => {
    const user = userEvent.setup()
    const alto = {
      ...CAMPAIGN,
      id: 'alto',
      name: 'Alto',
      checklist: [{ id: 'a', title: 'A', done: true }],
    }
    const bajo = {
      ...CAMPAIGN,
      id: 'bajo',
      name: 'Bajo',
      checklist: [
        { id: 'a', title: 'A', done: false },
        { id: 'b', title: 'B', done: true },
        { id: 'c', title: 'C', done: false },
      ],
    }
    const sin = { ...CAMPAIGN, id: 'sin', name: 'Sin acciones' }
    render(<AdsList campaigns={[sin, bajo, alto]} {...baseProps} />)

    // 1.er clic: ascendente (sin checklist = -1 va primero). 2.º clic: descendente.
    await user.click(screen.getByText('Cumplimiento'))
    await user.click(screen.getByText('Cumplimiento'))

    // La fila 0 es el encabezado.
    const rows = screen.getAllByRole('row').slice(1)
    expect(rows).toHaveLength(3)
    expect(rows[0]).toHaveTextContent('Alto')
    expect(rows[1]).toHaveTextContent('Bajo')
    expect(rows[2]).toHaveTextContent('Sin acciones')
  })

  it('lista vacía muestra el mensaje de "no hay tácticas"', () => {
    render(<AdsList campaigns={[]} {...baseProps} />)
    expect(screen.getByText('No hay tácticas aún')).toBeInTheDocument()
  })
})
