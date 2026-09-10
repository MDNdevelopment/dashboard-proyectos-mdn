import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi } from 'vitest'
import { makeQuery } from './helpers/supabaseMock'

const { insertSpy } = vi.hoisted(() => ({ insertSpy: vi.fn() }))

vi.mock('../supabase', () => ({
  supabase: {
    from: vi.fn(() => {
      const q = makeQuery([])
      q.insert = (row) => {
        insertSpy(row)
        return Promise.resolve({ data: null, error: null })
      }
      return q
    }),
  },
}))

vi.mock('../context/AuthContext', () => ({
  useAuth: vi.fn(),
}))

import { useAuth } from '../context/AuthContext'
import FeedbackModal from '../components/feedback/FeedbackModal'

beforeEach(() => {
  insertSpy.mockClear()
  useAuth.mockReturnValue({ userProfile: { company_id: 'company-1' } })
})

describe('FeedbackModal', () => {
  it('no renderiza nada cuando show es false', () => {
    const { container } = render(<FeedbackModal show={false} onClose={() => {}} />)
    expect(container.firstChild).toBeNull()
  })

  it('muestra un error si se envía sin mensaje', async () => {
    const user = userEvent.setup()
    render(<FeedbackModal show onClose={() => {}} />)
    await user.click(screen.getByRole('button', { name: /^enviar$/i }))
    expect(await screen.findByText(/al menos 10 caracteres/i)).toBeInTheDocument()
    expect(insertSpy).not.toHaveBeenCalled()
  })

  it('envía el mensaje y no incluye ningún dato del usuario', async () => {
    const user = userEvent.setup()
    render(<FeedbackModal show onClose={() => {}} />)

    await user.click(screen.getByRole('button', { name: /reporte de error/i }))
    await user.type(
      screen.getByPlaceholderText(/contanos qué recomendás/i),
      'La pantalla de proyectos se queda en blanco al filtrar.',
    )
    await user.click(screen.getByRole('button', { name: /^enviar$/i }))

    await waitFor(() => expect(insertSpy).toHaveBeenCalledTimes(1))
    const row = insertSpy.mock.calls[0][0]
    expect(row.type).toBe('error')
    expect(row.company_id).toBe('company-1')
    expect(Object.keys(row)).not.toContain('user_id')

    expect(await screen.findByText('¡Gracias!')).toBeInTheDocument()
  })
})
