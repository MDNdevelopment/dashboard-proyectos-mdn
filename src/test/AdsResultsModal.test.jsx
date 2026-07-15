/**
 * Tests de AdsResultsModal: modal que exige los 4 resultados (Alcance,
 * Interacciones, Seguidores, Impresiones) para poder finalizar un Ad.
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
      data: { ...AD, status: 'Finalizado', reach: 1000, interactions: 200, followers: 30, impressions: 5000 },
      error: null,
    })
  })

  it('renderiza los 4 campos de resultado', () => {
    renderModal()
    expect(screen.getByText('Alcance')).toBeInTheDocument()
    expect(screen.getByText('Interacciones')).toBeInTheDocument()
    expect(screen.getByText('Seguidores')).toBeInTheDocument()
    expect(screen.getByText('Impresiones')).toBeInTheDocument()
  })

  it('el botón de guardar está deshabilitado hasta llenar los 4 campos', async () => {
    const user = userEvent.setup()
    renderModal()

    const submit = screen.getByRole('button', { name: 'Guardar y finalizar' })
    expect(submit).toBeDisabled()

    await user.type(screen.getByLabelText('Alcance'), '1000')
    await user.type(screen.getByLabelText('Interacciones'), '200')
    await user.type(screen.getByLabelText('Seguidores'), '30')
    expect(submit).toBeDisabled()

    await user.type(screen.getByLabelText('Impresiones'), '5000')
    expect(submit).not.toBeDisabled()
  })

  it('al enviar, llama a updateAd con status Finalizado y los 4 valores numéricos', async () => {
    const user = userEvent.setup()
    const onSaved = vi.fn()
    renderModal({ onSaved })

    await user.type(screen.getByLabelText('Alcance'), '1000')
    await user.type(screen.getByLabelText('Interacciones'), '200')
    await user.type(screen.getByLabelText('Seguidores'), '30')
    await user.type(screen.getByLabelText('Impresiones'), '5000')
    await user.click(screen.getByRole('button', { name: 'Guardar y finalizar' }))

    await waitFor(() => {
      expect(mockUpdateAd).toHaveBeenCalledWith('ad-1', {
        status: 'Finalizado',
        reach: 1000,
        interactions: 200,
        followers: 30,
        impressions: 5000,
      })
      expect(onSaved).toHaveBeenCalledWith(expect.objectContaining({ status: 'Finalizado' }))
    })
  })

  it('pre-llena los campos si el ad ya tiene resultados guardados', () => {
    renderModal({ ad: { ...AD, reach: 500, interactions: 50, followers: 10, impressions: 2000 } })
    expect(screen.getByLabelText('Alcance')).toHaveValue(500)
    expect(screen.getByLabelText('Interacciones')).toHaveValue(50)
    expect(screen.getByLabelText('Seguidores')).toHaveValue(10)
    expect(screen.getByLabelText('Impresiones')).toHaveValue(2000)
  })
})
