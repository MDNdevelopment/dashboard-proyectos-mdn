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
      jefaName="Ana García"
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

  it('el botón «Abrir documento» abre el Drive en una pestaña nueva', () => {
    renderDetail({ campaign: { ...CAMPAIGN, drive_url: FOLDER } })
    const link = screen.getByRole('link', { name: 'Abrir documento' })
    expect(link).toHaveAttribute('href', FOLDER)
    expect(link).toHaveAttribute('target', '_blank')
    expect(link).toHaveAttribute('rel', expect.stringContaining('noreferrer'))
  })

  it('el botón «Táctica presentación» abre la página en una pestaña nueva', () => {
    renderDetail({ campaign: { ...CAMPAIGN, presentation_url: 'https://superfina.netlify.app' } })
    const link = screen.getByRole('link', { name: 'Táctica presentación' })
    expect(link).toHaveAttribute('href', 'https://superfina.netlify.app')
    expect(link).toHaveAttribute('target', '_blank')
  })

  it('sin táctica presentación no muestra el botón', () => {
    renderDetail()
    expect(screen.queryByRole('link', { name: 'Táctica presentación' })).not.toBeInTheDocument()
  })

  it('sin link de Drive no muestra el botón', () => {
    renderDetail()
    expect(screen.queryByRole('link', { name: 'Abrir documento' })).not.toBeInTheDocument()
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

describe('AdsDetail — jefa, Sin fecha y carpeta de la marca', () => {
  const MARCA = 'https://drive.google.com/drive/folders/1ZyXwVuTsRqPoNmLkJiHgFeDcBa98765'

  it('muestra la jefa del team en lugar de un responsable', () => {
    renderDetail()
    expect(screen.getByText('Jefa del team')).toBeInTheDocument()
    expect(screen.getByText('Ana García')).toBeInTheDocument()
    expect(screen.queryByText('Responsable')).not.toBeInTheDocument()
  })

  it('una táctica sin fechas dice "Sin fecha" y "Agregar fecha" abre el formulario', async () => {
    const user = userEvent.setup()
    const onEdit = vi.fn()
    renderDetail({ campaign: { ...CAMPAIGN, start_date: null, end_date: null }, onEdit })

    expect(screen.getByText('Sin fecha')).toBeInTheDocument()
    expect(screen.queryByText('Fecha inicio')).not.toBeInTheDocument()
    expect(screen.queryByRole('img', { name: /Avance del período/ })).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Agregar fecha' }))
    expect(onEdit).toHaveBeenCalled()
  })

  it('sin ads.manage no ofrece "Agregar fecha"', () => {
    renderDetail({ campaign: { ...CAMPAIGN, start_date: null, end_date: null }, canManage: false })
    expect(screen.getByText('Sin fecha')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Agregar fecha' })).not.toBeInTheDocument()
  })

  it('el botón "Carpeta de la marca" abre la carpeta en una pestaña nueva', () => {
    renderDetail({ campaign: { ...CAMPAIGN, drive_folder_url: MARCA } })
    const link = screen.getByRole('link', { name: 'Carpeta de la marca' })
    expect(link).toHaveAttribute('href', MARCA)
    expect(link).toHaveAttribute('target', '_blank')
  })
})
