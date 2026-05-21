import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi } from 'vitest'

vi.mock('../supabase', () => ({
  supabase: {
    from: vi.fn(),
  },
}))

vi.mock('../context/AuthContext', () => ({
  useAuth: vi.fn(),
}))

vi.mock('../components/tickets/TicketComments', () => ({
  default: () => <div data-testid="comments" />,
}))

import { useAuth } from '../context/AuthContext'
import { supabase } from '../supabase'
import TicketDetail from '../components/tickets/TicketDetail'

const itProfile = { user_id: 'it-user', department_id: 0 }
const regularProfile = { user_id: 'reg-user', department_id: 2 }

const openTicket = {
  id: 1,
  title: 'Falla la red',
  description: 'No hay internet en la oficina',
  status: 'abierto',
  priority: 'alta',
  category: 'red',
  created_at: '2026-05-21T10:00:00Z',
  resolved_at: null,
  assigned_to: null,
  requester: { first_name: 'Ana', last_name: 'Lopez' },
  assignee: null,
}

const inProgressTicket = {
  ...openTicket,
  status: 'en_progreso',
  assigned_to: 'it-user',
  assignee: { first_name: 'IT', last_name: 'Admin' },
}

function renderDetail(ticket, profile, props = {}) {
  useAuth.mockReturnValue({ userProfile: profile })
  return render(<TicketDetail ticket={ticket} onClose={() => {}} onUpdated={() => {}} {...props} />)
}

describe('TicketDetail', () => {
  it('muestra titulo y descripcion', () => {
    renderDetail(openTicket, regularProfile)
    expect(screen.getByText('Falla la red')).toBeInTheDocument()
    expect(screen.getByText('No hay internet en la oficina')).toBeInTheDocument()
  })

  it('muestra boton "Tomar ticket" para IT cuando estado es abierto', () => {
    renderDetail(openTicket, itProfile)
    expect(screen.getByRole('button', { name: 'Tomar ticket' })).toBeInTheDocument()
  })

  it('no muestra boton "Tomar ticket" para no-IT', () => {
    renderDetail(openTicket, regularProfile)
    expect(screen.queryByRole('button', { name: 'Tomar ticket' })).not.toBeInTheDocument()
  })

  it('muestra boton "Marcar como resuelto" para IT asignado en progreso', () => {
    renderDetail(inProgressTicket, itProfile)
    expect(screen.getByRole('button', { name: 'Marcar como resuelto' })).toBeInTheDocument()
  })

  it('no muestra "Marcar como resuelto" si no es el IT asignado', () => {
    const otherITProfile = { user_id: 'other-it', department_id: 0 }
    renderDetail(inProgressTicket, otherITProfile)
    expect(screen.queryByRole('button', { name: 'Marcar como resuelto' })).not.toBeInTheDocument()
  })

  it('llama onClose al cerrar', async () => {
    const onClose = vi.fn()
    renderDetail(openTicket, regularProfile, { onClose })
    await userEvent.click(screen.getByRole('button', { name: '' }))
    // Use the SVG close button
    const buttons = screen.getAllByRole('button')
    const closeBtn = buttons.find(b => b.querySelector('svg path[d="M2 2l12 12M14 2L2 14"]'))
    await userEvent.click(closeBtn)
    expect(onClose).toHaveBeenCalled()
  })

  it('llama onUpdated al tomar ticket exitosamente', async () => {
    const updatedTicket = { ...openTicket, status: 'en_progreso', assigned_to: 'it-user' }
    const singleMock = vi.fn().mockResolvedValue({ data: updatedTicket, error: null })
    const selectMock = vi.fn().mockReturnValue({ single: singleMock })
    const eqMock = vi.fn().mockReturnValue({ select: selectMock })
    const updateMock = vi.fn().mockReturnValue({ eq: eqMock })
    supabase.from.mockReturnValue({ update: updateMock })

    const onUpdated = vi.fn()
    renderDetail(openTicket, itProfile, { onUpdated })

    await userEvent.click(screen.getByRole('button', { name: 'Tomar ticket' }))

    await waitFor(() => {
      expect(onUpdated).toHaveBeenCalledWith(updatedTicket)
    })
  })

  it('renderiza el componente de comentarios', () => {
    renderDetail(openTicket, regularProfile)
    expect(screen.getByTestId('comments')).toBeInTheDocument()
  })
})
