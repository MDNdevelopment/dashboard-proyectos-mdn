import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { vi } from 'vitest'

vi.mock('../components/MDNLogo', () => ({ default: () => <div /> }))

const mockNavigate = vi.fn()
vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal()
  return { ...actual, useNavigate: () => mockNavigate }
})

const { mockOnAuthStateChange, mockUpdateUser, mockSignOut, mockGetSession } = vi.hoisted(() => ({
  mockOnAuthStateChange: vi.fn(),
  mockUpdateUser: vi.fn(),
  mockSignOut: vi.fn(),
  mockGetSession: vi.fn(),
}))

vi.mock('../supabase', () => ({
  supabase: {
    auth: {
      onAuthStateChange: mockOnAuthStateChange,
      updateUser: mockUpdateUser,
      signOut: mockSignOut,
      getSession: mockGetSession,
    },
  },
}))

// parseRecoveryParams reads window.location.href.
// In JSDOM the URL is http://localhost:3000/ (no error params) → normal flow.
// To test the expired-link state we override window.location before rendering.

import ResetPasswordPage from '../pages/ResetPasswordPage'

function renderPage() {
  render(<MemoryRouter><ResetPasswordPage /></MemoryRouter>)
}

// Helper: fire PASSWORD_RECOVERY event immediately on subscription
function withRecovery() {
  mockOnAuthStateChange.mockImplementation((callback) => {
    callback('PASSWORD_RECOVERY', null)
    return { data: { subscription: { unsubscribe: vi.fn() } } }
  })
}

// Helper: simulate getSession returning an active recovery session
function withSessionReady() {
  mockGetSession.mockResolvedValue({ data: { session: { user: { id: '1' } } } })
}

describe('ResetPasswordPage', () => {
  beforeEach(() => {
    mockNavigate.mockReset()
    mockUpdateUser.mockReset()
    mockSignOut.mockResolvedValue({})
    mockOnAuthStateChange.mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } })
    // Default: no active session (waits for PASSWORD_RECOVERY event)
    mockGetSession.mockResolvedValue({ data: { session: null } })
  })

  // ── Estado de espera ────────────────────────────────────────────────────
  it('muestra "Verificando enlace..." antes de resolver la sesión', () => {
    renderPage()
    expect(screen.getByText('Verificando enlace...')).toBeInTheDocument()
  })

  // ── Activación por evento PASSWORD_RECOVERY ─────────────────────────────
  it('muestra el formulario después del evento PASSWORD_RECOVERY', async () => {
    withRecovery()
    renderPage()
    await waitFor(() => {
      expect(screen.getByPlaceholderText('Nueva contraseña')).toBeInTheDocument()
      expect(screen.getByPlaceholderText('Confirmar contraseña')).toBeInTheDocument()
    })
  })

  // ── Activación rápida via getSession (sin esperar evento) ───────────────
  it('muestra el formulario si getSession ya tiene sesión activa', async () => {
    withSessionReady()
    renderPage()
    await waitFor(() => {
      expect(screen.getByPlaceholderText('Nueva contraseña')).toBeInTheDocument()
    })
  })

  // ── Validaciones ────────────────────────────────────────────────────────
  it('muestra error cuando las contraseñas no coinciden', async () => {
    withRecovery()
    renderPage()
    await waitFor(() => screen.getByPlaceholderText('Nueva contraseña'))
    await userEvent.type(screen.getByPlaceholderText('Nueva contraseña'), 'pass1234')
    await userEvent.type(screen.getByPlaceholderText('Confirmar contraseña'), 'different')
    await userEvent.click(screen.getByRole('button', { name: 'Guardar contraseña' }))
    expect(screen.getByText('Las contraseñas no coinciden')).toBeInTheDocument()
    expect(mockUpdateUser).not.toHaveBeenCalled()
  })

  it('muestra error cuando la contraseña es demasiado corta', async () => {
    withRecovery()
    renderPage()
    await waitFor(() => screen.getByPlaceholderText('Nueva contraseña'))
    await userEvent.type(screen.getByPlaceholderText('Nueva contraseña'), 'short')
    await userEvent.type(screen.getByPlaceholderText('Confirmar contraseña'), 'short')
    await userEvent.click(screen.getByRole('button', { name: 'Guardar contraseña' }))
    expect(screen.getByText(/al menos 8 caracteres/)).toBeInTheDocument()
    expect(mockUpdateUser).not.toHaveBeenCalled()
  })

  // ── Errores de API ──────────────────────────────────────────────────────
  it('muestra error cuando la API falla', async () => {
    withRecovery()
    mockUpdateUser.mockResolvedValue({ error: new Error('Failed') })
    renderPage()
    await waitFor(() => screen.getByPlaceholderText('Nueva contraseña'))
    await userEvent.type(screen.getByPlaceholderText('Nueva contraseña'), 'newpass123')
    await userEvent.type(screen.getByPlaceholderText('Confirmar contraseña'), 'newpass123')
    await userEvent.click(screen.getByRole('button', { name: 'Guardar contraseña' }))
    await waitFor(() => {
      expect(screen.getByText('No se pudo actualizar la contraseña. Intenta de nuevo.')).toBeInTheDocument()
    })
  })

  // ── Éxito ───────────────────────────────────────────────────────────────
  it('muestra mensaje de éxito tras cambiar la contraseña correctamente', async () => {
    withRecovery()
    mockUpdateUser.mockResolvedValue({ error: null })
    renderPage()
    await waitFor(() => screen.getByPlaceholderText('Nueva contraseña'))
    await userEvent.type(screen.getByPlaceholderText('Nueva contraseña'), 'newpass123')
    await userEvent.type(screen.getByPlaceholderText('Confirmar contraseña'), 'newpass123')
    await userEvent.click(screen.getByRole('button', { name: 'Guardar contraseña' }))
    await waitFor(() => {
      expect(screen.getByText('¡Contraseña actualizada! Redirigiendo al inicio de sesión...')).toBeInTheDocument()
    })
    expect(screen.queryByPlaceholderText('Nueva contraseña')).not.toBeInTheDocument()
  })

  it('llama a signOut tras actualizar la contraseña con éxito', async () => {
    withRecovery()
    mockUpdateUser.mockResolvedValue({ error: null })
    renderPage()
    await waitFor(() => screen.getByPlaceholderText('Nueva contraseña'))
    await userEvent.type(screen.getByPlaceholderText('Nueva contraseña'), 'newpass123')
    await userEvent.type(screen.getByPlaceholderText('Confirmar contraseña'), 'newpass123')
    await userEvent.click(screen.getByRole('button', { name: 'Guardar contraseña' }))
    await waitFor(() => {
      expect(mockSignOut).toHaveBeenCalled()
    })
  })

  // ── Enlace expirado ─────────────────────────────────────────────────────
  it('muestra estado de enlace expirado cuando la URL tiene error otp_expired', () => {
    // Temporarily override window.location.href to simulate an expired link URL
    const original = window.location.href
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { ...window.location, href: 'http://localhost:3000/reset-password?error=access_denied&error_code=otp_expired' },
    })

    renderPage()

    expect(screen.getByText('Enlace expirado')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Solicitar nuevo enlace' })).toBeInTheDocument()

    // Restore
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { ...window.location, href: original },
    })
  })
})
