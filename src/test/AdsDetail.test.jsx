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
  id: 'camp-1',
  name: 'Táctica Julio',
  client: 'Banco Exterior',
  assignee: 'u1',
  priority: 'Media',
  status: 'Pendiente',
  notes: '',
  start_date: '2026-07-05',
  end_date: '2026-07-20',
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
    />,
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

describe('AdsDetail — objetivo, Drive, avance y cumplimiento', () => {
  const FOLDER = 'https://drive.google.com/drive/folders/1AbCdEfGhIjKlMnOpQrStUvWxYz012345'

  it('ya no muestra la prioridad', () => {
    renderDetail()
    expect(screen.queryByText('Media')).not.toBeInTheDocument()
  })

  it('muestra el objetivo general si lo tiene', () => {
    renderDetail({ campaign: { ...CAMPAIGN, objective: 'Posicionar la marca' } })
    expect(screen.getByText('Objetivo general')).toBeInTheDocument()
    expect(screen.getByText('Posicionar la marca')).toBeInTheDocument()
  })

  it('sin objetivo no deja un encabezado vacío', () => {
    renderDetail()
    expect(screen.queryByText('Objetivo general')).not.toBeInTheDocument()
  })

  it('el botón de Drive abre la carpeta en una pestaña nueva', () => {
    renderDetail({ campaign: { ...CAMPAIGN, drive_url: FOLDER } })
    const link = screen.getByRole('link', { name: 'Abrir carpeta de Drive' })
    expect(link).toHaveAttribute('href', FOLDER)
    expect(link).toHaveAttribute('target', '_blank')
    expect(link).toHaveAttribute('rel', expect.stringContaining('noreferrer'))
  })

  it('sin link de Drive no muestra el botón', () => {
    renderDetail()
    expect(screen.queryByRole('link', { name: 'Abrir carpeta de Drive' })).not.toBeInTheDocument()
  })

  it('muestra el % de cumplimiento solo si hay acciones', () => {
    const { unmount } = renderDetail({
      campaign: {
        ...CAMPAIGN,
        checklist: [
          { id: '1', title: 'a', done: true },
          { id: '2', title: 'b', done: false },
        ],
      },
    })
    expect(screen.getByText('Cumplimiento 50%')).toBeInTheDocument()
    unmount()

    renderDetail()
    expect(screen.queryByText(/Cumplimiento \d+%/)).not.toBeInTheDocument()
  })

  it('muestra la barra de avance del período', () => {
    renderDetail({ campaign: { ...CAMPAIGN, start_date: '2020-01-01', end_date: '2020-01-31' } })
    // Período ya terminado: 100 %.
    expect(screen.getByRole('img', { name: 'Avance del período: 100%' })).toBeInTheDocument()
  })
})
