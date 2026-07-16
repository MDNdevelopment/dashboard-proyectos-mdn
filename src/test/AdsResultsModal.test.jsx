/**
 * Tests de AdsResultsModal: modal que exige elegir y capturar al menos 1 de
 * los 6 indicadores posibles (Alcance, Interacciones, Seguidores, Impresiones,
 * Visualizaciones, Visitas al perfil) para poder finalizar un Ad.
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

import AdsResultsModal from '../components/ads/AdsResultsModal'

const AD = { id: 'ad-1', name: 'Ad Julio', status: 'En Curso' }

function renderModal(props = {}) {
  return render(<AdsResultsModal ad={AD} onClose={() => {}} onSaved={() => {}} {...props} />)
}

describe('AdsResultsModal', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockUpdateAd.mockResolvedValue({
      data: { ...AD, status: 'Finalizado', reach: 1000 },
      error: null,
    })
  })

  it('renderiza los 6 indicadores disponibles para elegir', () => {
    renderModal()
    expect(screen.getByText('Alcance')).toBeInTheDocument()
    expect(screen.getByText('Interacciones')).toBeInTheDocument()
    expect(screen.getByText('Seguidores')).toBeInTheDocument()
    expect(screen.getByText('Impresiones')).toBeInTheDocument()
    expect(screen.getByText('Visualizaciones')).toBeInTheDocument()
    expect(screen.getByText('Visitas al perfil')).toBeInTheDocument()
  })

  it('el botón de guardar está deshabilitado hasta seleccionar y llenar al menos 1 indicador', async () => {
    const user = userEvent.setup()
    renderModal()

    const submit = screen.getByRole('button', { name: 'Guardar y finalizar' })
    expect(submit).toBeDisabled()

    await user.click(screen.getByRole('checkbox', { name: 'Incluir Alcance' }))
    expect(submit).toBeDisabled() // seleccionado pero sin valor todavía

    await user.type(screen.getByLabelText('Alcance'), '1000')
    expect(submit).not.toBeDisabled()
  })

  it('no muestra el input numérico de un indicador hasta que se seleccione', () => {
    renderModal()
    expect(screen.queryByLabelText('Alcance')).not.toBeInTheDocument()
  })

  it('al enviar con un solo indicador seleccionado, llama a updateAd con ese valor y el resto en null', async () => {
    const user = userEvent.setup()
    const onSaved = vi.fn()
    renderModal({ onSaved })

    await user.click(screen.getByRole('checkbox', { name: 'Incluir Alcance' }))
    await user.type(screen.getByLabelText('Alcance'), '1000')
    await user.click(screen.getByRole('button', { name: 'Guardar y finalizar' }))

    await waitFor(() => {
      expect(mockUpdateAd).toHaveBeenCalledWith('ad-1', {
        status: 'Finalizado',
        reach: 1000,
        interactions: null,
        followers: null,
        impressions: null,
        views: null,
        profile_visits: null,
      })
      expect(onSaved).toHaveBeenCalledWith(expect.objectContaining({ status: 'Finalizado' }))
    })
  })

  it('al enviar con varios indicadores seleccionados, todos se guardan con su valor', async () => {
    const user = userEvent.setup()
    renderModal()

    await user.click(screen.getByRole('checkbox', { name: 'Incluir Alcance' }))
    await user.click(screen.getByRole('checkbox', { name: 'Incluir Visualizaciones' }))
    await user.type(screen.getByLabelText('Alcance'), '1000')
    await user.type(screen.getByLabelText('Visualizaciones'), '3000')
    await user.click(screen.getByRole('button', { name: 'Guardar y finalizar' }))

    await waitFor(() => {
      expect(mockUpdateAd).toHaveBeenCalledWith('ad-1', expect.objectContaining({
        reach: 1000,
        views: 3000,
        interactions: null,
        followers: null,
        impressions: null,
        profile_visits: null,
      }))
    })
  })

  it('pre-selecciona y pre-llena los indicadores que el ad ya tiene guardados', () => {
    renderModal({ ad: { ...AD, reach: 500, followers: 10 } })
    expect(screen.getByRole('checkbox', { name: 'Incluir Alcance' })).toBeChecked()
    expect(screen.getByRole('checkbox', { name: 'Incluir Seguidores' })).toBeChecked()
    expect(screen.getByRole('checkbox', { name: 'Incluir Interacciones' })).not.toBeChecked()
    expect(screen.getByLabelText('Alcance')).toHaveValue(500)
    expect(screen.getByLabelText('Seguidores')).toHaveValue(10)
  })

  it('deseleccionar un indicador oculta su input (se guardará como null al enviar)', async () => {
    const user = userEvent.setup()
    renderModal({ ad: { ...AD, reach: 500 } })

    expect(screen.getByLabelText('Alcance')).toBeInTheDocument()
    await user.click(screen.getByRole('checkbox', { name: 'Incluir Alcance' }))
    expect(screen.queryByLabelText('Alcance')).not.toBeInTheDocument()
  })
})
