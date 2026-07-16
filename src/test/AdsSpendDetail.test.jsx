/**
 * Tests de AdsSpendDetail (modal de vista de un Ad): el cambio de estado se
 * delega al padre vía onStatusChange (la guardia de "Finalizado exige
 * resultados" vive en AdsSpendView), se muestra el aviso de sobrepaso de
 * presupuesto cuando corresponde, y los resultados solo aparecen cuando el
 * ad ya está Finalizado.
 */
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi } from 'vitest'

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
      onStatusChange={() => {}}
      onEdit={() => {}}
      onRequestDelete={() => {}}
      {...props}
    />
  )
}

describe('AdsSpendDetail — cambio de estado en modo visualización', () => {
  beforeEach(() => vi.clearAllMocks())

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

  it('elegir un estado en el StatusPill delega el cambio al padre vía onStatusChange', async () => {
    const user = userEvent.setup()
    const onStatusChange = vi.fn()
    renderDetail({ onStatusChange })

    await user.click(screen.getByRole('button', { name: 'Pendiente' }))
    await user.click(screen.getByRole('button', { name: 'Finalizado' }))

    await waitFor(() => {
      expect(onStatusChange).toHaveBeenCalledWith('Finalizado')
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

describe('AdsSpendDetail — sección de resultados', () => {
  beforeEach(() => vi.clearAllMocks())

  it('NO muestra la sección de resultados si el ad no está Finalizado', () => {
    renderDetail({ ad: { ...AD, status: 'Pendiente' } })
    expect(screen.queryByText('Resultados')).not.toBeInTheDocument()
  })

  it('muestra los resultados capturados cuando el ad está Finalizado', () => {
    renderDetail({
      // objective se pone en null para no chocar con la etiqueta "Alcance" de resultados
      ad: { ...AD, objective: null, status: 'Finalizado', reach: 1000, interactions: 200, followers: 30, impressions: 5000 },
    })
    expect(screen.getByText('Resultados')).toBeInTheDocument()
    expect(screen.getByText('Alcance')).toBeInTheDocument()
    expect(screen.getByText('1.000')).toBeInTheDocument()
    expect(screen.getByText('Interacciones')).toBeInTheDocument()
    expect(screen.getByText('200')).toBeInTheDocument()
    expect(screen.getByText('Seguidores')).toBeInTheDocument()
    expect(screen.getByText('30')).toBeInTheDocument()
    expect(screen.getByText('Impresiones')).toBeInTheDocument()
    expect(screen.getByText('5.000')).toBeInTheDocument()
  })

  it('solo muestra los indicadores que el ad tiene capturados, no todos los 6', () => {
    renderDetail({
      ad: { ...AD, objective: null, status: 'Finalizado', reach: 1000, views: null, profile_visits: null },
    })
    expect(screen.getByText('Alcance')).toBeInTheDocument()
    expect(screen.queryByText('Visualizaciones')).not.toBeInTheDocument()
    expect(screen.queryByText('Visitas al perfil')).not.toBeInTheDocument()
    expect(screen.queryByText('Interacciones')).not.toBeInTheDocument()
  })

  it('oculta la sección de resultados si el ad está Finalizado pero no tiene ningún indicador capturado', () => {
    renderDetail({
      ad: { ...AD, status: 'Finalizado' },
    })
    expect(screen.queryByText('Resultados')).not.toBeInTheDocument()
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
