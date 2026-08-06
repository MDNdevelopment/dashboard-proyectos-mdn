import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import { createSupabaseMock, makeChannel } from './helpers/supabaseMock'

// Query builder sensible a .range(from, to): resuelve con la porción correspondiente
// de un dataset completo, para poder verificar la paginación de "Cargar más".
function makeRangeQuery(all) {
  let lo = 0
  let hi = all.length - 1
  const q = {
    select: vi.fn(() => q),
    eq: vi.fn(() => q),
    order: vi.fn(() => q),
    update: vi.fn(() => q),
    range: vi.fn((from, to) => {
      lo = from
      hi = to
      return q
    }),
    then: (resolve) => resolve({ data: all.slice(lo, hi + 1), error: null }),
  }
  return q
}

let rangeQuery
vi.mock('../supabase', () => ({
  supabase: {
    ...createSupabaseMock(),
    from: vi.fn(() => rangeQuery),
    channel: vi.fn(() => makeChannel()),
    removeChannel: vi.fn(),
  },
}))

vi.mock('../context/AuthContext', () => ({ useAuth: vi.fn() }))

import { useAuth } from '../context/AuthContext'
import NotificationBell from '../components/notifications/NotificationBell'

// 85 notificaciones → 3 páginas: 40 + 40 + 5.
const ALL = Array.from({ length: 85 }, (_, i) => ({
  id: `n${i}`,
  user_id: 'kat',
  type: 'ad_autoclosed',
  title: `Notif ${i}`,
  body: `cuerpo ${i}`,
  entity_type: 'ad',
  entity_id: `a${i}`,
  email: false,
  read: false,
  created_at: '2026-08-06T11:00:00Z',
}))

function renderBell() {
  return render(
    <MemoryRouter>
      <NotificationBell />
    </MemoryRouter>,
  )
}

describe('NotificationBell — paginación "Cargar más"', () => {
  beforeEach(() => {
    rangeQuery = makeRangeQuery(ALL)
    useAuth.mockReturnValue({ userProfile: { user_id: 'kat' } })
  })

  it('carga la primera página (40) y muestra "Cargar más" cuando hay más', async () => {
    const user = userEvent.setup()
    renderBell()

    // Abrir el panel (badge muestra 85 sin leer).
    await user.click(screen.getByRole('button', { name: /notificaciones/i }))

    await waitFor(() => expect(screen.getByText('Notif 0')).toBeInTheDocument())
    expect(screen.getByText('Notif 39')).toBeInTheDocument()
    expect(screen.queryByText('Notif 40')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Cargar más' })).toBeInTheDocument()
  })

  it('"Cargar más" trae páginas siguientes y desaparece al agotar el historial', async () => {
    const user = userEvent.setup()
    renderBell()
    await user.click(screen.getByRole('button', { name: /notificaciones/i }))
    await waitFor(() => expect(screen.getByText('Notif 0')).toBeInTheDocument())

    // Página 2: 40 más (total 80). Sigue habiendo botón (la página trajo 40).
    await user.click(screen.getByRole('button', { name: 'Cargar más' }))
    await waitFor(() => expect(screen.getByText('Notif 40')).toBeInTheDocument())
    expect(screen.getByText('Notif 79')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Cargar más' })).toBeInTheDocument()

    // Página 3: solo 5 (total 85). Ya no hay botón (5 < 40).
    await user.click(screen.getByRole('button', { name: 'Cargar más' }))
    await waitFor(() => expect(screen.getByText('Notif 84')).toBeInTheDocument())
    expect(screen.queryByRole('button', { name: 'Cargar más' })).not.toBeInTheDocument()
  })
})
