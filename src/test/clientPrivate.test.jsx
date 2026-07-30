/**
 * Tests de los datos privados de contacto del cliente (teléfono, correo de
 * Instagram) en ClientModal.
 * Verifica que:
 * - Los campos solo se renderizan para nivel 3/4/admin (isFinancePrivileged).
 * - En modo edición y privilegiado, se cargan con loadClientPrivate y se
 *   vuelcan al form.
 * - Al guardar siendo privilegiado, se llama a upsertClientPrivate con el id
 *   del cliente guardado y los valores del form.
 * - Un usuario no privilegiado no dispara loadClientPrivate ni upsertClientPrivate.
 */
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi } from 'vitest'

const mockCreateClient = vi.fn()
const mockUpdateClient = vi.fn()
const mockLoadClientPrivate = vi.fn()
const mockUpsertClientPrivate = vi.fn()

vi.mock('../components/metricas/metricsApi', () => ({
  createClient:         (...a) => mockCreateClient(...a),
  updateClient:          (...a) => mockUpdateClient(...a),
  loadClientPrivate:     (...a) => mockLoadClientPrivate(...a),
  upsertClientPrivate:   (...a) => mockUpsertClientPrivate(...a),
}))

let mockUserProfile
vi.mock('../context/AuthContext', () => ({
  useAuth: vi.fn(() => ({ userProfile: mockUserProfile })),
}))

import ClientModal from '../components/empresa/ClientModal'

const MOCK_LINES = [{ id: 'line-1', name: 'Georgina', color: '#FAB51A' }]
const BASE_CLIENT = {
  id: 'c-1', name: 'Banco Exterior', logo_url: null, line_id: 'line-1',
  payment_day: null, monthly_fee: null, campaign_budget: null, website: null,
  social_links: [], contacts: [], anniversary_date: null, mdn_since: null,
  social_manager_id: null, designer_id: null, audiovisual_ids: [], apoyo_ids: [],
}

function renderEdit(overrides = {}) {
  return render(
    <ClientModal
      client={BASE_CLIENT}
      companyId="co-1"
      lines={MOCK_LINES}
      onClose={vi.fn()}
      onSaved={vi.fn()}
      {...overrides}
    />
  )
}

function renderCreate(overrides = {}) {
  return render(
    <ClientModal
      client={null}
      companyId="co-1"
      lines={MOCK_LINES}
      onClose={vi.fn()}
      onSaved={vi.fn()}
      {...overrides}
    />
  )
}

describe('ClientModal — datos privados (teléfono / correo Instagram)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockLoadClientPrivate.mockResolvedValue({ data: null, error: null })
    mockUpsertClientPrivate.mockResolvedValue({ data: null, error: null })
    mockCreateClient.mockResolvedValue({
      data: { ...BASE_CLIENT, id: 'c-new', name: 'Test' }, error: null,
    })
    mockUpdateClient.mockResolvedValue({
      data: { ...BASE_CLIENT }, error: null,
    })
  })

  it('nivel 2 (no privilegiado): los campos privados no se renderizan', () => {
    mockUserProfile = { user_id: 'u-2', company_id: 'co-1', access_level: 2, admin: false }
    renderEdit()
    expect(screen.queryByText('Datos privados (cuenta de Instagram)')).not.toBeInTheDocument()
  })

  it('nivel 3: los campos privados se renderizan', () => {
    mockUserProfile = { user_id: 'u-3', company_id: 'co-1', access_level: 3, admin: false }
    renderEdit()
    expect(screen.getByText('Datos privados (cuenta de Instagram)')).toBeInTheDocument()
  })

  it('admin (cualquier nivel): los campos privados se renderizan', () => {
    mockUserProfile = { user_id: 'u-admin', company_id: 'co-1', access_level: 1, admin: true }
    renderEdit()
    expect(screen.getByText('Datos privados (cuenta de Instagram)')).toBeInTheDocument()
  })

  it('nivel 2: no llama a loadClientPrivate', () => {
    mockUserProfile = { user_id: 'u-2', company_id: 'co-1', access_level: 2, admin: false }
    renderEdit()
    expect(mockLoadClientPrivate).not.toHaveBeenCalled()
  })

  it('nivel 4 en edición: carga y vuelca el dato privado existente', async () => {
    mockUserProfile = { user_id: 'u-4', company_id: 'co-1', access_level: 4, admin: false }
    mockLoadClientPrivate.mockResolvedValue({
      data: { phone: '+58 412 1234567', instagram_email: 'cuenta@ig.com' }, error: null,
    })
    renderEdit()
    await waitFor(() => expect(mockLoadClientPrivate).toHaveBeenCalledWith('c-1'))
    expect(await screen.findByDisplayValue('+58 412 1234567')).toBeInTheDocument()
    expect(screen.getByDisplayValue('cuenta@ig.com')).toBeInTheDocument()
  })

  it('nivel 4: al guardar, llama a upsertClientPrivate con el id y los valores del form', async () => {
    mockUserProfile = { user_id: 'u-4', company_id: 'co-1', access_level: 4, admin: false }
    const user = userEvent.setup()
    renderEdit()

    await waitFor(() => expect(mockLoadClientPrivate).toHaveBeenCalled())
    await user.type(screen.getByPlaceholderText('+58 412 0000000'), '04120000000')
    await user.type(screen.getByPlaceholderText('cuenta@ejemplo.com'), 'ig@cliente.com')
    await user.click(screen.getByRole('button', { name: 'Guardar cambios' }))

    await waitFor(() => {
      expect(mockUpsertClientPrivate).toHaveBeenCalledWith('c-1', {
        phone: '04120000000',
        instagram_email: 'ig@cliente.com',
      })
    })
  })

  it('nivel 2: al guardar, NO llama a upsertClientPrivate', async () => {
    mockUserProfile = { user_id: 'u-2', company_id: 'co-1', access_level: 2, admin: false }
    const user = userEvent.setup()
    renderEdit()

    await user.click(screen.getByRole('button', { name: 'Guardar cambios' }))

    await waitFor(() => expect(mockUpdateClient).toHaveBeenCalled())
    expect(mockUpsertClientPrivate).not.toHaveBeenCalled()
  })

  it('nivel 4 en creación: al crear, llama a upsertClientPrivate con el id devuelto por createClient', async () => {
    mockUserProfile = { user_id: 'u-4', company_id: 'co-1', access_level: 4, admin: false }
    const user = userEvent.setup()
    renderCreate()

    await user.type(screen.getByPlaceholderText('Nombre del cliente / marca'), 'Cliente Nuevo')
    await user.type(screen.getByPlaceholderText('+58 412 0000000'), '04120000000')
    await user.click(screen.getByRole('button', { name: 'Crear cliente' }))

    await waitFor(() => {
      expect(mockUpsertClientPrivate).toHaveBeenCalledWith('c-new', {
        phone: '04120000000',
        instagram_email: '',
      })
    })
  })
})
