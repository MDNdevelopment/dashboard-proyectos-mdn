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

const { mockOnAuthStateChange, mockUpdateUser, mockSignOut } = vi.hoisted(() => ({
  mockOnAuthStateChange: vi.fn(),
  mockUpdateUser: vi.fn(),
  mockSignOut: vi.fn(),
}))

vi.mock('../supabase', () => ({
  supabase: {
    auth: {
      onAuthStateChange: mockOnAuthStateChange,
      updateUser: mockUpdateUser,
      signOut: mockSignOut,
    },
  },
}))

import ResetPasswordPage from '../pages/ResetPasswordPage'

function renderPage() {
  render(<MemoryRouter><ResetPasswordPage /></MemoryRouter>)
}

function withRecovery() {
  mockOnAuthStateChange.mockImplementation((callback) => {
    callback('PASSWORD_RECOVERY', null)
    return { data: { subscription: { unsubscribe: vi.fn() } } }
  })
}

describe('ResetPasswordPage', () => {
  beforeEach(() => {
    mockNavigate.mockReset()
    mockUpdateUser.mockReset()
    mockSignOut.mockResolvedValue({})
    mockOnAuthStateChange.mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } })
  })

  it('muestra "Verificando enlace..." antes del evento PASSWORD_RECOVERY', () => {
    renderPage()
    expect(screen.getByText('Verificando enlace...')).toBeInTheDocument()
  })

  it('muestra el formulario después del evento PASSWORD_RECOVERY', async () => {
    withRecovery()
    renderPage()
    await waitFor(() => {
      expect(screen.getByPlaceholderText('Nueva contraseña')).toBeInTheDocument()
      expect(screen.getByPlaceholderText('Confirmar contraseña')).toBeInTheDocument()
    })
  })

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
})
