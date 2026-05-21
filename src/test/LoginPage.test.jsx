import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { vi } from 'vitest'
import LoginPage from '../pages/LoginPage'

vi.mock('../components/MDNLogo', () => ({ default: () => <div /> }))

vi.mock('../context/AuthContext', () => ({
  useAuth: vi.fn(),
}))

import { useAuth } from '../context/AuthContext'

function renderPage() {
  return render(<MemoryRouter><LoginPage /></MemoryRouter>)
}

describe('LoginPage', () => {
  it('renderiza el formulario de login', () => {
    useAuth.mockReturnValue({ session: null, signIn: vi.fn() })
    renderPage()
    expect(screen.getByPlaceholderText('Correo electrónico')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('Contraseña')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Ingresar' })).toBeInTheDocument()
  })

  it('muestra error cuando las credenciales son incorrectas', async () => {
    const signIn = vi.fn().mockResolvedValue({ error: new Error('Invalid') })
    useAuth.mockReturnValue({ session: null, signIn })
    renderPage()

    await userEvent.type(screen.getByPlaceholderText('Correo electrónico'), 'test@example.com')
    await userEvent.type(screen.getByPlaceholderText('Contraseña'), 'wrongpass')
    await userEvent.click(screen.getByRole('button', { name: 'Ingresar' }))

    await waitFor(() => {
      expect(screen.getByText('Correo o contraseña incorrectos')).toBeInTheDocument()
    })
  })

  it('llama a signIn con email y contraseña', async () => {
    const signIn = vi.fn().mockResolvedValue({ error: null })
    useAuth.mockReturnValue({ session: null, signIn })
    renderPage()

    await userEvent.type(screen.getByPlaceholderText('Correo electrónico'), 'user@mdn.com')
    await userEvent.type(screen.getByPlaceholderText('Contraseña'), 'secret123')
    await userEvent.click(screen.getByRole('button', { name: 'Ingresar' }))

    await waitFor(() => {
      expect(signIn).toHaveBeenCalledWith('user@mdn.com', 'secret123')
    })
  })

  it('no muestra el formulario si ya hay sesión activa', () => {
    useAuth.mockReturnValue({ session: { user: { id: '1' } }, signIn: vi.fn() })
    renderPage()
    expect(screen.queryByPlaceholderText('Correo electrónico')).not.toBeInTheDocument()
  })
})
