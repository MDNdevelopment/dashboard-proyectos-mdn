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
  id: 'camp-1', name: 'Táctica Julio', client: 'Banco Exterior', client_id: 'c-1',
  assignee: 'u1', priority: 'Media', status: 'Pendiente', notes: '',
  start_date: '2026-07-05', end_date: '2026-07-20',
}

describe('AdsList — click en fila abre detalle', () => {
  it('clic en la fila (fuera de los controles interactivos) llama a onSelect con la campaña', async () => {
    const user = userEvent.setup()
    const onSelect = vi.fn()
    render(<AdsList campaigns={[CAMPAIGN]} loading={false} canManage={true} usersMap={new Map()} clientsById={new Map()} onSelect={onSelect} onUpdated={() => {}} onDeleted={() => {}} onEdit={() => {}} />)

    // El texto del nombre tiene su propio onClick (edición inline); clicamos
    // en la celda del cliente, que no intercepta el click.
    await user.click(screen.getByText('Banco Exterior', { selector: 'span' }))
    expect(onSelect).toHaveBeenCalledWith(CAMPAIGN)
  })

  it('clic en el botón Editar (acciones) NO llama a onSelect', async () => {
    const user = userEvent.setup()
    const onSelect = vi.fn()
    const onEdit = vi.fn()
    render(<AdsList campaigns={[CAMPAIGN]} loading={false} canManage={true} usersMap={new Map()} clientsById={new Map()} onSelect={onSelect} onUpdated={() => {}} onDeleted={() => {}} onEdit={onEdit} />)

    await user.click(screen.getByTitle('Editar'))
    expect(onEdit).toHaveBeenCalledWith(CAMPAIGN)
    expect(onSelect).not.toHaveBeenCalled()
  })

  it('clic en el StatusPill (badge de estado) NO llama a onSelect', async () => {
    const user = userEvent.setup()
    const onSelect = vi.fn()
    render(<AdsList campaigns={[CAMPAIGN]} loading={false} canManage={true} usersMap={new Map()} clientsById={new Map()} onSelect={onSelect} onUpdated={() => {}} onDeleted={() => {}} onEdit={() => {}} />)

    await user.click(screen.getByRole('button', { name: 'Pendiente' }))
    expect(onSelect).not.toHaveBeenCalled()
  })
})

describe('AdsList — export', () => {
  it('ya no muestra el botón de export CSV (movido a la tab Ads como Excel)', () => {
    render(<AdsList campaigns={[CAMPAIGN]} loading={false} canManage={true} usersMap={new Map()} clientsById={new Map()} onSelect={() => {}} onUpdated={() => {}} onDeleted={() => {}} onEdit={() => {}} />)
    expect(screen.queryByRole('button', { name: /CSV/i })).not.toBeInTheDocument()
  })
})

describe('AdsList — texto "Táctica continua"', () => {
  const baseProps = { loading: false, canManage: true, usersMap: new Map(), clientsById: new Map(), onSelect: () => {}, onUpdated: () => {}, onDeleted: () => {}, onEdit: () => {} }

  it('NO se muestra cuando la táctica empezó en el período que se está viendo', () => {
    render(<AdsList campaigns={[CAMPAIGN]} periodo={{ month: 7, year: 2026 }} {...baseProps} />)
    expect(screen.queryByText('Táctica continua')).not.toBeInTheDocument()
  })

  it('se muestra cuando la táctica empezó en un mes distinto al período visto (rango multi-mes)', () => {
    const continua = { ...CAMPAIGN, id: 'camp-2', start_date: '2026-06-25', end_date: '2026-07-05' }
    render(<AdsList campaigns={[continua]} periodo={{ month: 7, year: 2026 }} {...baseProps} />)
    expect(screen.getByText('Táctica continua')).toBeInTheDocument()
  })

  it('sin periodo (prop no provista), no se muestra', () => {
    render(<AdsList campaigns={[CAMPAIGN]} {...baseProps} />)
    expect(screen.queryByText('Táctica continua')).not.toBeInTheDocument()
  })
})
