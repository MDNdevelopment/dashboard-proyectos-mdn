import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { vi } from 'vitest'
import ForgotPasswordPage from '../pages/ForgotPasswordPage'

vi.mock('../components/MDNLogo', () => ({ default: () => <div /> }))

vi.mock('../context/AuthContext', () => ({
  useAuth: vi.fn(),
}))

import { useAuth } from '../context/AuthContext'

function renderPage(resetPassword = vi.fn().mockResolvedValue({})) {
  useAuth.mockReturnValue({ resetPassword })
  render(<MemoryRouter><ForgotPasswordPage /></MemoryRouter>)
  return { resetPassword }
}

describe('ForgotPasswordPage', () => {
  it('renderiza el formulario inicial', () => {
    renderPage()
    expect(screen.getByPlaceholderText('Correo electrónico')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Enviar enlace' })).toBeInTheDocument()
  })

  it('llama a resetPassword con el email al enviar', async () => {
    const { resetPassword } = renderPage()
    await userEvent.type(screen.getByPlaceholderText('Correo electrónico'), 'user@mdn.com')
    await userEvent.click(screen.getByRole('button', { name: 'Enviar enlace' }))
    await waitFor(() => expect(resetPassword).toHaveBeenCalledWith('user@mdn.com'))
  })

  it('muestra mensaje de éxito tras enviar', async () => {
    renderPage()
    await userEvent.type(screen.getByPlaceholderText('Correo electrónico'), 'user@mdn.com')
    await userEvent.click(screen.getByRole('button', { name: 'Enviar enlace' }))
    await waitFor(() => {
      expect(screen.getByText('Revisa tu correo para restablecer tu contraseña')).toBeInTheDocument()
    })
  })

  it('oculta el formulario y muestra el botón de reenvío tras enviar', async () => {
    renderPage()
    await userEvent.type(screen.getByPlaceholderText('Correo electrónico'), 'user@mdn.com')
    await userEvent.click(screen.getByRole('button', { name: 'Enviar enlace' }))
    await waitFor(() => {
      expect(screen.queryByRole('button', { name: 'Enviar enlace' })).not.toBeInTheDocument()
      expect(screen.getByRole('button', { name: /Reenviar enlace/ })).toBeInTheDocument()
    })
  })

  it('el botón de reenvío está deshabilitado al aparecer', async () => {
    renderPage()
    await userEvent.type(screen.getByPlaceholderText('Correo electrónico'), 'user@mdn.com')
    await userEvent.click(screen.getByRole('button', { name: 'Enviar enlace' }))
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Reenviar enlace/ })).toBeDisabled()
    })
  })

  it('el botón de reenvío muestra la cuenta regresiva en formato MM:SS', async () => {
    renderPage()
    await userEvent.type(screen.getByPlaceholderText('Correo electrónico'), 'user@mdn.com')
    await userEvent.click(screen.getByRole('button', { name: 'Enviar enlace' }))
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Reenviar enlace \(\d{2}:\d{2}\)/ })).toBeInTheDocument()
    })
  })
})
