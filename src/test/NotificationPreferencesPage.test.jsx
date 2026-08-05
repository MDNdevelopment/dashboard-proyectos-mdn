import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi } from 'vitest'
import { createSupabaseMock } from './helpers/supabaseMock'

vi.mock('../supabase', () => ({
  supabase: createSupabaseMock(),
}))

vi.mock('../context/AuthContext', () => ({
  useAuth: vi.fn(),
}))

import { useAuth } from '../context/AuthContext'
import { supabase } from '../supabase'
import NotificationPreferencesPage from '../components/tickets/NotificationPreferencesView'

const itAdmin = { department_id: 0, access_level: 3, admin: false }
const itAdminByFlag = { department_id: 0, access_level: 2, admin: true }
const itNonAdmin = { department_id: 0, access_level: 1, admin: false }
const nonIT = { department_id: 1, access_level: 3, admin: false }

const itStaff = [
  {
    user_id: 'u1',
    first_name: 'Carlos',
    last_name: 'Perez',
    email: 'carlos@mdn.com',
    receive_ticket_notifications: true,
  },
  {
    user_id: 'u2',
    first_name: 'Maria',
    last_name: 'Lopez',
    email: 'maria@mdn.com',
    receive_ticket_notifications: false,
  },
]

// Query chain: from('users').select(...).eq('department_id', 0).order('first_name')
function mockSupabaseSelect(data, error = null) {
  supabase.from.mockReturnValue({
    select: vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        order: vi.fn().mockResolvedValue({ data, error }),
      }),
    }),
    update: vi.fn().mockReturnValue({
      eq: vi.fn().mockResolvedValue({ error: null }),
    }),
  })
}

describe('NotificationPreferencesPage', () => {
  it('muestra acceso restringido para usuario no IT', () => {
    useAuth.mockReturnValue({ userProfile: nonIT })
    render(<NotificationPreferencesPage />)
    expect(screen.getByText('Acceso restringido')).toBeInTheDocument()
  })

  it('muestra acceso restringido para IT sin nivel admin ni flag admin', () => {
    useAuth.mockReturnValue({ userProfile: itNonAdmin })
    render(<NotificationPreferencesPage />)
    expect(screen.getByText('Acceso restringido')).toBeInTheDocument()
  })

  it('permite acceso a IT con admin=true aunque access_level sea 2', async () => {
    useAuth.mockReturnValue({ userProfile: itAdminByFlag })
    mockSupabaseSelect(itStaff)
    render(<NotificationPreferencesPage />)
    await waitFor(() => {
      expect(screen.getByText('Carlos Perez')).toBeInTheDocument()
    })
  })

  it('muestra la lista de personal IT para admin IT', async () => {
    useAuth.mockReturnValue({ userProfile: itAdmin })
    mockSupabaseSelect(itStaff)
    render(<NotificationPreferencesPage />)
    await waitFor(() => {
      expect(screen.getByText('Carlos Perez')).toBeInTheDocument()
      expect(screen.getByText('Maria Lopez')).toBeInTheDocument()
    })
  })

  it('refleja el estado actual de notificaciones en los toggles', async () => {
    useAuth.mockReturnValue({ userProfile: itAdmin })
    mockSupabaseSelect(itStaff)
    render(<NotificationPreferencesPage />)
    await waitFor(() => {
      const switches = screen.getAllByRole('switch')
      expect(switches[0]).toHaveAttribute('aria-checked', 'true')
      expect(switches[1]).toHaveAttribute('aria-checked', 'false')
    })
  })

  it('llama a supabase update con el valor correcto al hacer toggle', async () => {
    useAuth.mockReturnValue({ userProfile: itAdmin })
    const updateEq = vi.fn().mockResolvedValue({ error: null })
    const updateMock = vi.fn().mockReturnValue({ eq: updateEq })
    supabase.from.mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          order: vi.fn().mockResolvedValue({ data: itStaff, error: null }),
        }),
      }),
      update: updateMock,
    })

    render(<NotificationPreferencesPage />)
    await waitFor(() => screen.getByText('Carlos Perez'))

    const switches = screen.getAllByRole('switch')
    await userEvent.click(switches[0]) // Carlos: true → false

    expect(updateMock).toHaveBeenCalledWith({ receive_ticket_notifications: false })
    expect(updateEq).toHaveBeenCalledWith('user_id', 'u1')
  })

  it('muestra advertencia cuando todos los toggles están desactivados', async () => {
    const allOff = itStaff.map((u) => ({ ...u, receive_ticket_notifications: false }))
    useAuth.mockReturnValue({ userProfile: itAdmin })
    mockSupabaseSelect(allOff)
    render(<NotificationPreferencesPage />)
    await waitFor(() => {
      expect(screen.getByText('Nadie recibirá notificaciones de tickets')).toBeInTheDocument()
    })
  })

  it('muestra spinner mientras carga', () => {
    useAuth.mockReturnValue({ userProfile: itAdmin })
    supabase.from.mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          order: vi.fn().mockReturnValue(new Promise(() => {})), // never resolves
        }),
      }),
    })
    const { container } = render(<NotificationPreferencesPage />)
    expect(container.querySelector('.animate-spin')).toBeInTheDocument()
  })

  it('muestra error si falla la carga', async () => {
    useAuth.mockReturnValue({ userProfile: itAdmin })
    mockSupabaseSelect(null, new Error('db error'))
    render(<NotificationPreferencesPage />)
    await waitFor(() => {
      expect(screen.getByText('Error al cargar el personal IT.')).toBeInTheDocument()
    })
  })
})
