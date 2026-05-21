import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi } from 'vitest'

vi.mock('../supabase', () => ({
  supabase: {
    from: vi.fn(() => ({
      insert: vi.fn(() => ({
        select: vi.fn(() => ({
          single: vi.fn(),
        })),
      })),
    })),
  },
}))

vi.mock('../context/AuthContext', () => ({
  useAuth: vi.fn(),
}))

import { useAuth } from '../context/AuthContext'
import { supabase } from '../supabase'
import TicketForm from '../components/tickets/TicketForm'

const userProfile = {
  user_id: 'uuid-user',
  company_id: 'uuid-company',
  department_id: 1,
}

function renderForm(props = {}) {
  return render(<TicketForm onClose={() => {}} onCreated={() => {}} {...props} />)
}

describe('TicketForm', () => {
  beforeEach(() => {
    useAuth.mockReturnValue({ userProfile })
  })

  it('renderiza los campos del formulario', () => {
    renderForm()
    expect(screen.getByPlaceholderText('Describe brevemente el problema')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Crear ticket' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Cancelar' })).toBeInTheDocument()
  })

  it('el boton Crear ticket esta deshabilitado sin titulo', () => {
    renderForm()
    expect(screen.getByRole('button', { name: 'Crear ticket' })).toBeDisabled()
  })

  it('habilita el boton cuando hay titulo', async () => {
    renderForm()
    await userEvent.type(screen.getByPlaceholderText('Describe brevemente el problema'), 'Mi impresora no funciona')
    expect(screen.getByRole('button', { name: 'Crear ticket' })).not.toBeDisabled()
  })

  it('llama a onClose al cancelar', async () => {
    const onClose = vi.fn()
    renderForm({ onClose })
    await userEvent.click(screen.getByRole('button', { name: 'Cancelar' }))
    expect(onClose).toHaveBeenCalled()
  })

  it('inserta ticket en supabase al enviar', async () => {
    const newTicket = { id: 1, title: 'Falla red', status: 'abierto', requester: null }
    const singleMock = vi.fn().mockResolvedValue({ data: newTicket, error: null })
    const selectMock = vi.fn().mockReturnValue({ single: singleMock })
    const insertMock = vi.fn().mockReturnValue({ select: selectMock })
    supabase.from.mockReturnValue({ insert: insertMock })

    const onCreated = vi.fn()
    const onClose = vi.fn()
    renderForm({ onCreated, onClose })

    await userEvent.type(screen.getByPlaceholderText('Describe brevemente el problema'), 'Falla red')
    await userEvent.click(screen.getByRole('button', { name: 'Crear ticket' }))

    await waitFor(() => {
      expect(insertMock).toHaveBeenCalledWith(expect.objectContaining({
        title: 'Falla red',
        requester_id: 'uuid-user',
        company_id: 'uuid-company',
      }))
      expect(onCreated).toHaveBeenCalledWith(newTicket)
      expect(onClose).toHaveBeenCalled()
    })
  })

  it('muestra error si falla la insercion', async () => {
    const singleMock = vi.fn().mockResolvedValue({ data: null, error: new Error('fail') })
    const selectMock = vi.fn().mockReturnValue({ single: singleMock })
    const insertMock = vi.fn().mockReturnValue({ select: selectMock })
    supabase.from.mockReturnValue({ insert: insertMock })

    renderForm()
    await userEvent.type(screen.getByPlaceholderText('Describe brevemente el problema'), 'Falla')
    await userEvent.click(screen.getByRole('button', { name: 'Crear ticket' }))

    await waitFor(() => {
      expect(screen.getByText('Error al crear el ticket. Intenta de nuevo.')).toBeInTheDocument()
    })
  })
})
