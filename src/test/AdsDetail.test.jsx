/**
 * Tests de AdsDetail (modal de vista de una táctica/campaña): el estado se
 * puede cambiar directamente desde el modal de visualización, sin entrar a
 * modo edición.
 */
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi } from 'vitest'

const { mockUpdate } = vi.hoisted(() => ({ mockUpdate: vi.fn() }))

vi.mock('../supabase', () => ({
  supabase: {
    from: vi.fn(() => ({
      update: vi.fn(() => ({
        eq: vi.fn(() => ({
          select: vi.fn(() => ({
            single: mockUpdate,
          })),
        })),
      })),
      delete: vi.fn(() => ({ eq: vi.fn().mockResolvedValue({ error: null }) })),
    })),
  },
}))

import AdsDetail from '../components/ads/AdsDetail'

const CAMPAIGN = {
  id: 'camp-1', name: 'Táctica Julio', client: 'Banco Exterior',
  assignee: 'u1', priority: 'Media', status: 'Pendiente', notes: '',
  start_date: '2026-07-05', end_date: '2026-07-20',
}

function renderDetail(props = {}) {
  return render(
    <AdsDetail
      campaign={CAMPAIGN}
      usersMap={new Map([['u1', 'Ana García']])}
      onClose={() => {}}
      onUpdated={() => {}}
      onDeleted={() => {}}
      canManage={true}
      onEdit={() => {}}
      {...props}
    />
  )
}

describe('AdsDetail — cambio de estado en modo visualización', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockUpdate.mockResolvedValue({
      data: { ...CAMPAIGN, status: 'En Curso' },
      error: null,
    })
  })

  it('muestra el estado como un StatusPill editable (botón) cuando canManage=true', () => {
    renderDetail()
    expect(screen.getByRole('button', { name: 'Pendiente' })).toBeInTheDocument()
  })

  it('muestra el estado como texto estático (no editable) cuando canManage=false', () => {
    renderDetail({ canManage: false })
    expect(screen.queryByRole('button', { name: 'Pendiente' })).not.toBeInTheDocument()
    expect(screen.getByText('Pendiente')).toBeInTheDocument()
  })

  it('elegir un estado en el StatusPill actualiza el estado vía supabase y llama a onUpdated', async () => {
    const user = userEvent.setup()
    const onUpdated = vi.fn()
    renderDetail({ onUpdated })

    await user.click(screen.getByRole('button', { name: 'Pendiente' }))
    await user.click(screen.getByRole('button', { name: 'En Curso' }))

    await waitFor(() => {
      expect(mockUpdate).toHaveBeenCalled()
      expect(onUpdated).toHaveBeenCalledWith(expect.objectContaining({ status: 'En Curso' }))
    })
  })
})
