/**
 * Tests del logo de cliente en ClientModal.
 * Verifica que:
 * - El input de archivo (AvatarUpload) se renderiza.
 * - El payload de createClient incluye logo_url cuando está seteado.
 * - El payload de updateClient incluye logo_url.
 */
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi } from 'vitest'

// ── Mocks metricsApi ──────────────────────────────────────────────────────────
const mockCreateClient = vi.fn().mockResolvedValue({
  data: { id: 'c-new', name: 'Test', logo_url: null, line_id: null, company_id: 'co-1', social_links: [] },
  error: null,
})
const mockUpdateClient = vi.fn().mockResolvedValue({
  data: { id: 'c-1', name: 'Test', logo_url: 'https://res.cloudinary.com/test/image/upload/logo.jpg', line_id: null, company_id: 'co-1', social_links: [] },
  error: null,
})

vi.mock('../components/metricas/metricsApi', () => ({
  createClient: (...a) => mockCreateClient(...a),
  updateClient: (...a) => mockUpdateClient(...a),
  loadLines:    vi.fn(),
  loadClients:  vi.fn(),
}))

// ── Mock uploadToCloudinary (evita fetch real) ────────────────────────────────
vi.mock('../utils/uploadToCloudinary', () => ({
  cropToBlob:         vi.fn().mockResolvedValue(new Blob()),
  uploadToCloudinary: vi.fn().mockResolvedValue('https://res.cloudinary.com/test/image/upload/logo.jpg'),
}))

// ── Mock ReactCrop (no tiene DOM APIs en jsdom) ───────────────────────────────
vi.mock('react-image-crop', () => ({
  default: ({ children }) => children,
}))
vi.mock('react-image-crop/dist/ReactCrop.css', () => ({}))

vi.mock('../context/AuthContext', () => ({
  useAuth: vi.fn(() => ({
    userProfile: { user_id: 'u-admin', company_id: 'co-1', access_level: 4, admin: true },
    can: () => true,
    signOut: vi.fn(),
  })),
}))

import ClientModal from '../components/empresa/ClientModal'

const MOCK_LINES = [
  { id: 'line-1', name: 'Georgina', color: '#FAB51A' },
]

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

function renderEdit(overrides = {}) {
  return render(
    <ClientModal
      client={{ id: 'c-1', name: 'Banco Exterior', logo_url: null, line_id: 'line-1', payment_day: null, website: null, social_links: [] }}
      companyId="co-1"
      lines={MOCK_LINES}
      onClose={vi.fn()}
      onSaved={vi.fn()}
      {...overrides}
    />
  )
}

// ── Tests ──────────────────────────────────────────────────────────────────────
describe('ClientModal — logo', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockCreateClient.mockResolvedValue({
      data: { id: 'c-new', name: 'Test', logo_url: null, line_id: null, company_id: 'co-1', social_links: [] },
      error: null,
    })
    mockUpdateClient.mockResolvedValue({
      data: { id: 'c-1', name: 'Test', logo_url: null, line_id: null, company_id: 'co-1', social_links: [] },
      error: null,
    })
  })

  it('renderiza el input de archivo (AvatarUpload) para el logo', () => {
    renderCreate()
    expect(screen.getByTestId('avatar-file-input')).toBeInTheDocument()
  })

  it('el label "Logo del cliente" está visible', () => {
    renderCreate()
    expect(screen.getByText('Logo del cliente')).toBeInTheDocument()
  })

  it('createClient incluye logo_url: null cuando no se subió logo', async () => {
    const user = userEvent.setup()
    renderCreate()

    await user.type(screen.getByPlaceholderText('Nombre del cliente / marca'), 'Cliente Test')
    await user.click(screen.getByRole('button', { name: 'Crear cliente' }))

    await waitFor(() => {
      expect(mockCreateClient).toHaveBeenCalledWith(
        'co-1',
        expect.objectContaining({ logo_url: null })
      )
    })
  })

  it('updateClient incluye logo_url cuando está seteado en el form (edición)', async () => {
    const user = userEvent.setup()
    // Renderizamos en modo edición con logo ya existente
    render(
      <ClientModal
        client={{ id: 'c-1', name: 'Banco Exterior', logo_url: 'https://cdn.example.com/logo.jpg', line_id: 'line-1', payment_day: null, website: null, social_links: [] }}
        companyId="co-1"
        lines={MOCK_LINES}
        onClose={vi.fn()}
        onSaved={vi.fn()}
      />
    )

    await user.click(screen.getByRole('button', { name: 'Guardar cambios' }))

    await waitFor(() => {
      expect(mockUpdateClient).toHaveBeenCalledWith(
        'c-1',
        expect.objectContaining({ logo_url: 'https://cdn.example.com/logo.jpg' })
      )
    })
  })
})
