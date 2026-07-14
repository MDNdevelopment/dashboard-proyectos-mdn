/**
 * Tests del formulario de Ads (pauta pagada) — AdsSpendForm.
 * Cubre: creación con payload correcto, y el aviso de sobrepaso de presupuesto
 * (no bloqueante: el submit debe seguir habilitado aun cuando se supera el presupuesto).
 */
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi } from 'vitest'

const mockCreateAd = vi.fn()
const mockLoadAdsResponsables = vi.fn().mockResolvedValue({
  data: [
    { user_id: 'r-1', first_name: 'Katherine', last_name: 'Mora' },
    { user_id: 'r-2', first_name: 'Georgina', last_name: 'Pérez' },
  ],
  error: null,
})

vi.mock('../components/ads/campaignSpendApi', async () => {
  const actual = await vi.importActual('../components/ads/campaignSpendApi')
  return {
    ...actual,
    createAd: (...a) => mockCreateAd(...a),
    updateAd: vi.fn(),
    loadAdsResponsables: (...a) => mockLoadAdsResponsables(...a),
  }
})

vi.mock('../components/metricas/metricsApi', () => ({
  loadClients: vi.fn().mockResolvedValue({
    data: [
      { id: 'c-1', name: 'Banco Exterior', campaign_budget: 100 },
      { id: 'c-2', name: 'Pepsi', campaign_budget: null },
    ],
    error: null,
  }),
}))

vi.mock('../context/AuthContext', () => ({
  useAuth: vi.fn(),
}))

import { useAuth } from '../context/AuthContext'
import AdsSpendForm from '../components/ads/AdsSpendForm'

const userProfile = { user_id: 'u-1', company_id: 'co-1' }

function renderForm(props = {}) {
  return render(
    <AdsSpendForm
      ad={null}
      ads={[]}
      companyId="co-1"
      onClose={() => {}}
      onCreated={() => {}}
      onUpdated={() => {}}
      {...props}
    />
  )
}

async function fillRequiredFields(user, { amount }) {
  await waitFor(() => screen.getByRole('option', { name: 'Banco Exterior' }))
  const clientSelect = screen.getAllByRole('combobox')[0]
  await user.selectOptions(clientSelect, 'c-1')
  await user.type(screen.getByPlaceholderText('Nombre de la campaña'), 'Campaña Ads Test')
  await user.type(screen.getByPlaceholderText('0.00'), String(amount))
  const dateInputs = document.querySelectorAll('input[type="date"]')
  await user.type(dateInputs[0], '2026-07-05')
  await user.type(dateInputs[1], '2026-07-15')
}

describe('AdsSpendForm', () => {
  beforeEach(() => {
    useAuth.mockReturnValue({ userProfile })
    vi.clearAllMocks()
    mockCreateAd.mockResolvedValue({
      data: { id: 'ad-new', name: 'Campaña Ads Test', client_id: 'c-1', client: 'Banco Exterior' },
      error: null,
    })
  })

  it('crea un ad con el payload correcto (cliente, monto, plazo)', async () => {
    const user = userEvent.setup()
    const onCreated = vi.fn()
    renderForm({ onCreated })

    await fillRequiredFields(user, { amount: 40 })
    await user.click(screen.getByRole('button', { name: 'Crear ad' }))

    await waitFor(() => {
      expect(mockCreateAd).toHaveBeenCalledWith('co-1', expect.objectContaining({
        client_id: 'c-1',
        client: 'Banco Exterior',
        name: 'Campaña Ads Test',
        amount: 40,
        start_date: '2026-07-05',
        end_date: '2026-07-15',
      }))
    })
    expect(onCreated).toHaveBeenCalled()
  })

  it('el selector de Responsable solo lista las opciones de loadAdsResponsables (no toda la plantilla)', async () => {
    renderForm()
    await waitFor(() => {
      expect(screen.getByRole('option', { name: 'Katherine Mora' })).toBeInTheDocument()
    })
    expect(screen.getByRole('option', { name: 'Georgina Pérez' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: '— Sin responsable —' })).toBeInTheDocument()
  })

  it('el payload de creación incluye responsable_id cuando se elige un responsable', async () => {
    const user = userEvent.setup()
    renderForm()

    await fillRequiredFields(user, { amount: 40 })
    await waitFor(() => screen.getByRole('option', { name: 'Katherine Mora' }))

    const responsableSelect = screen.getAllByRole('combobox').find(s =>
      Array.from(s.options ?? []).some(o => o.text === '— Sin responsable —')
    )
    await user.selectOptions(responsableSelect, 'r-1')

    await user.click(screen.getByRole('button', { name: 'Crear ad' }))

    await waitFor(() => {
      expect(mockCreateAd).toHaveBeenCalledWith('co-1', expect.objectContaining({ responsable_id: 'r-1' }))
    })
  })

  it('muestra el aviso de sobrepaso cuando la suma supera el presupuesto del cliente', async () => {
    const user = userEvent.setup()
    // Ya hay 80 invertidos en julio 2026 para el cliente c-1 (presupuesto: 100)
    const existingAds = [
      { id: 'ad-1', client_id: 'c-1', amount: 80, start_date: '2026-07-01' },
    ]
    renderForm({ ads: existingAds })

    await fillRequiredFields(user, { amount: 40 }) // 80 + 40 = 120 > 100

    await waitFor(() => {
      expect(screen.getByText(/Te estás pasando del presupuesto aprobado/)).toBeInTheDocument()
    })
    // El aviso NO debe deshabilitar el envío
    expect(screen.getByRole('button', { name: 'Crear ad' })).not.toBeDisabled()
  })

  it('muestra "Disponible" junto a Monto (USD) cuando el cliente tiene presupuesto', async () => {
    const user = userEvent.setup()
    const existingAds = [
      { id: 'ad-1', client_id: 'c-1', amount: 20, start_date: '2026-07-01' },
    ]
    renderForm({ ads: existingAds })

    await waitFor(() => screen.getByRole('option', { name: 'Banco Exterior' }))
    const clientSelect = screen.getAllByRole('combobox')[0]
    await user.selectOptions(clientSelect, 'c-1')
    const dateInputs = document.querySelectorAll('input[type="date"]')
    await user.type(dateInputs[0], '2026-07-05')

    // Presupuesto 100 - invertido 20 = disponible 80
    await waitFor(() => {
      expect(screen.getByText('Disponible: $80.00')).toBeInTheDocument()
    })
  })

  it('NO muestra "Disponible" cuando el cliente no tiene presupuesto configurado', async () => {
    const user = userEvent.setup()
    renderForm()

    await waitFor(() => screen.getByRole('option', { name: 'Pepsi' }))
    const clientSelect = screen.getAllByRole('combobox')[0]
    await user.selectOptions(clientSelect, 'c-2')

    expect(screen.queryByText(/Disponible:/)).not.toBeInTheDocument()
  })

  it('NO muestra la suma de este ad en Disponible: refleja lo disponible antes de escribir el monto', async () => {
    const user = userEvent.setup()
    renderForm()

    await waitFor(() => screen.getByRole('option', { name: 'Banco Exterior' }))
    const clientSelect = screen.getAllByRole('combobox')[0]
    await user.selectOptions(clientSelect, 'c-1')
    const dateInputs = document.querySelectorAll('input[type="date"]')
    await user.type(dateInputs[0], '2026-07-05')
    await user.type(screen.getByPlaceholderText('0.00'), '999')

    // Sin ads previos, disponible sigue siendo el presupuesto completo ($100.00),
    // no descuenta lo que se está tecleando en Monto.
    await waitFor(() => {
      expect(screen.getByText('Disponible: $100.00')).toBeInTheDocument()
    })
  })

  it('NO muestra el aviso cuando el total está por debajo del presupuesto', async () => {
    const user = userEvent.setup()
    const existingAds = [
      { id: 'ad-1', client_id: 'c-1', amount: 20, start_date: '2026-07-01' },
    ]
    renderForm({ ads: existingAds })

    await fillRequiredFields(user, { amount: 30 }) // 20 + 30 = 50 < 100

    await waitFor(() => screen.getByRole('button', { name: 'Crear ad' }))
    expect(screen.queryByText(/Te estás pasando del presupuesto aprobado/)).not.toBeInTheDocument()
  })

  it('el envío sigue habilitado con sobrepaso de presupuesto (no bloquea la creación)', async () => {
    const user = userEvent.setup()
    const existingAds = [
      { id: 'ad-1', client_id: 'c-1', amount: 90, start_date: '2026-07-01' },
    ]
    const onCreated = vi.fn()
    renderForm({ ads: existingAds, onCreated })

    await fillRequiredFields(user, { amount: 50 }) // 90 + 50 = 140 > 100
    await waitFor(() => screen.getByText(/Te estás pasando del presupuesto aprobado/))

    await user.click(screen.getByRole('button', { name: 'Crear ad' }))
    await waitFor(() => expect(mockCreateAd).toHaveBeenCalled())
    expect(onCreated).toHaveBeenCalled()
  })

  describe('validación de plazo (fin no puede ser anterior a inicio)', () => {
    it('el input de fecha fin tiene un min ligado a la fecha de inicio', async () => {
      const user = userEvent.setup()
      renderForm()
      await waitFor(() => screen.getByRole('option', { name: 'Banco Exterior' }))

      const dateInputs = document.querySelectorAll('input[type="date"]')
      await user.type(dateInputs[0], '2026-07-10')

      expect(dateInputs[1]).toHaveAttribute('min', '2026-07-10')
    })

    it('muestra un error y deshabilita el envío si el fin queda antes del inicio', async () => {
      const user = userEvent.setup()
      renderForm()

      await fillRequiredFields(user, { amount: 40 })
      const dateInputs = document.querySelectorAll('input[type="date"]')

      // Forzamos un fin anterior al inicio saltándonos el min del input (fireEvent directo)
      await user.clear(dateInputs[1])
      await user.type(dateInputs[1], '2026-07-01') // antes del inicio (2026-07-05)

      expect(screen.getByText('La fecha de fin no puede ser anterior a la fecha de inicio.')).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Crear ad' })).toBeDisabled()
      expect(mockCreateAd).not.toHaveBeenCalled()
    })

    it('mover el inicio más allá del fin ya elegido limpia el fin', async () => {
      const user = userEvent.setup()
      renderForm()
      await fillRequiredFields(user, { amount: 40 }) // inicio 2026-07-05, fin 2026-07-15

      const dateInputs = document.querySelectorAll('input[type="date"]')
      await user.clear(dateInputs[0])
      await user.type(dateInputs[0], '2026-07-20') // después del fin ya elegido

      expect(dateInputs[1]).toHaveValue('')
      expect(screen.queryByText('La fecha de fin no puede ser anterior a la fecha de inicio.')).not.toBeInTheDocument()
    })
  })
})
