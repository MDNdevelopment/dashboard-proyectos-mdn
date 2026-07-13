/**
 * Tests de AdsSpendDetail (modal de vista de un Ad): el estado se puede
 * cambiar directamente desde el modal de visualización, y se muestra el
 * aviso de sobrepaso de presupuesto cuando corresponde.
 */
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi } from 'vitest'

const mockUpdateAd = vi.fn()

vi.mock('../components/ads/campaignSpendApi', async () => {
  const actual = await vi.importActual('../components/ads/campaignSpendApi')
  return {
    ...actual,
    updateAd: (...a) => mockUpdateAd(...a),
  }
})

import AdsSpendDetail from '../components/ads/AdsSpendDetail'

const AD = {
  id: 'ad-1', client_id: 'c-1', client: 'Banco Exterior', name: 'Ad Julio',
  objective: 'Alcance', piece_url: 'https://example.com/post', amount: 80,
  start_date: '2026-07-05', end_date: '2026-07-15', status: 'Pendiente',
}

function renderDetail(props = {}) {
  return render(
    <AdsSpendDetail
      ad={AD}
      ads={[AD]}
      client={{ id: 'c-1', name: 'Banco Exterior', campaign_budget: 100 }}
      canManage={true}
      onClose={() => {}}
      onUpdated={() => {}}
      onEdit={() => {}}
      onRequestDelete={() => {}}
      {...props}
    />
  )
}

describe('AdsSpendDetail — cambio de estado en modo visualización', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockUpdateAd.mockResolvedValue({ data: { ...AD, status: 'Aprobado' }, error: null })
  })

  it('muestra los datos del ad en modo lectura', () => {
    renderDetail()
    expect(screen.getByText('Ad Julio')).toBeInTheDocument()
    expect(screen.getByText('Banco Exterior')).toBeInTheDocument()
    expect(screen.getByText('$80.00')).toBeInTheDocument()
    expect(screen.getByText('Alcance')).toBeInTheDocument()
  })

  it('resuelve y muestra el nombre del responsable a partir de responsable_id', () => {
    renderDetail({
      ad: { ...AD, responsable_id: 'r-1' },
      responsables: [{ user_id: 'r-1', first_name: 'Katherine', last_name: 'Mora' }],
    })
    expect(screen.getByText('Katherine Mora')).toBeInTheDocument()
  })

  it('sin responsable_id, muestra "—"', () => {
    renderDetail({ ad: { ...AD, responsable_id: null } })
    expect(screen.getByText('—')).toBeInTheDocument()
  })

  it('muestra el estado como StatusPill editable (botón) cuando canManage=true', () => {
    renderDetail()
    expect(screen.getByRole('button', { name: 'Pendiente' })).toBeInTheDocument()
  })

  it('sin canManage, el estado se muestra como texto estático', () => {
    renderDetail({ canManage: false })
    expect(screen.queryByRole('button', { name: 'Pendiente' })).not.toBeInTheDocument()
  })

  it('elegir un estado en el StatusPill llama a updateAd y a onUpdated con la fila actualizada', async () => {
    const user = userEvent.setup()
    const onUpdated = vi.fn()
    renderDetail({ onUpdated })

    await user.click(screen.getByRole('button', { name: 'Pendiente' }))
    await user.click(screen.getByRole('button', { name: 'Aprobado' }))

    await waitFor(() => {
      expect(mockUpdateAd).toHaveBeenCalledWith('ad-1', { status: 'Aprobado' })
      expect(onUpdated).toHaveBeenCalledWith(expect.objectContaining({ status: 'Aprobado' }))
    })
  })

  it('"Editar" y "Eliminar" llaman a sus callbacks respectivos', async () => {
    const user = userEvent.setup()
    const onEdit = vi.fn()
    const onRequestDelete = vi.fn()
    renderDetail({ onEdit, onRequestDelete })

    await user.click(screen.getByRole('button', { name: 'Editar' }))
    expect(onEdit).toHaveBeenCalled()

    await user.click(screen.getByRole('button', { name: 'Eliminar' }))
    expect(onRequestDelete).toHaveBeenCalled()
  })
})

describe('AdsSpendDetail — aviso de sobrepaso de presupuesto', () => {
  beforeEach(() => vi.clearAllMocks())

  it('NO muestra el aviso cuando lo invertido está dentro del presupuesto', () => {
    renderDetail({
      ad: AD, // amount 80
      ads: [AD],
      client: { id: 'c-1', name: 'Banco Exterior', campaign_budget: 100 },
    })
    expect(screen.queryByText(/Te estás pasando del presupuesto aprobado/)).not.toBeInTheDocument()
  })

  it('muestra el aviso cuando la suma de ads del cliente ese mes supera el presupuesto', () => {
    const otherAd = { id: 'ad-2', client_id: 'c-1', amount: 40, start_date: '2026-07-20' }
    renderDetail({
      ad: AD, // amount 80, este ad ya está incluido en `ads`
      ads: [AD, otherAd], // 80 + 40 = 120 > 100
      client: { id: 'c-1', name: 'Banco Exterior', campaign_budget: 100 },
    })
    expect(screen.getByText(/Te estás pasando del presupuesto aprobado para este cliente/)).toBeInTheDocument()
    expect(screen.getByText(/\$120\.00 de \$100\.00 este mes/)).toBeInTheDocument()
  })

  it('sin presupuesto configurado en el cliente, no muestra el aviso', () => {
    renderDetail({
      ad: AD,
      ads: [AD],
      client: { id: 'c-1', name: 'Banco Exterior', campaign_budget: null },
    })
    expect(screen.queryByText(/Te estás pasando del presupuesto aprobado/)).not.toBeInTheDocument()
  })
})
