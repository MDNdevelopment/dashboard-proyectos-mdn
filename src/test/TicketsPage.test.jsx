import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { vi } from 'vitest'

vi.mock('../context/AuthContext', () => ({
  useAuth: vi.fn(),
}))

// Mockear las tres vistas para aislar el test del host
vi.mock('../components/tickets/TicketsListView', () => ({
  default: () => <div data-testid="tickets-list-view">Lista de tickets view</div>,
}))
vi.mock('../components/tickets/TicketAnalyticsView', () => ({
  default: () => <div data-testid="ticket-analytics-view">Analytics view</div>,
}))
vi.mock('../components/tickets/NotificationPreferencesView', () => ({
  default: () => <div data-testid="notification-preferences-view">Notificaciones view</div>,
}))

import { useAuth } from '../context/AuthContext'
import TicketsPage from '../pages/TicketsPage'

const userBase       = { department_id: 1, access_level: 1, admin: false }
const userAnalytics  = { department_id: 1, access_level: 3, admin: false }
const userAdminFlag  = { department_id: 1, access_level: 1, admin: true  }
const itAdmin        = { department_id: 0, access_level: 3, admin: false }
const itAdminFlag    = { department_id: 0, access_level: 1, admin: true  }
const itNonAdmin     = { department_id: 0, access_level: 1, admin: false }

function renderPage(userProfile, { route = '/tickets' } = {}) {
  useAuth.mockReturnValue({ userProfile })
  return render(
    <MemoryRouter initialEntries={[route]}>
      <TicketsPage />
    </MemoryRouter>
  )
}

describe('TicketsPage — visibilidad de tabs', () => {
  it('muestra siempre el tab "Lista de tickets"', () => {
    renderPage(userBase)
    expect(screen.getByRole('button', { name: /lista de tickets/i })).toBeInTheDocument()
  })

  it('no muestra "Analíticas" para usuario sin acceso', () => {
    renderPage(userBase)
    expect(screen.queryByRole('button', { name: /analíticas/i })).not.toBeInTheDocument()
  })

  it('muestra "Analíticas" para access_level >= 3', () => {
    renderPage(userAnalytics)
    expect(screen.getByRole('button', { name: /analíticas/i })).toBeInTheDocument()
  })

  it('muestra "Analíticas" para admin=true aunque access_level sea 1', () => {
    renderPage(userAdminFlag)
    expect(screen.getByRole('button', { name: /analíticas/i })).toBeInTheDocument()
  })

  it('no muestra "Notificaciones" para usuario no IT', () => {
    renderPage(userAnalytics)
    expect(screen.queryByRole('button', { name: /notificaciones/i })).not.toBeInTheDocument()
  })

  it('no muestra "Notificaciones" para IT sin nivel admin ni flag admin', () => {
    renderPage(itNonAdmin)
    expect(screen.queryByRole('button', { name: /notificaciones/i })).not.toBeInTheDocument()
  })

  it('muestra "Notificaciones" para IT con access_level >= 3', () => {
    renderPage(itAdmin)
    expect(screen.getByRole('button', { name: /notificaciones/i })).toBeInTheDocument()
  })

  it('muestra "Notificaciones" para IT con admin=true aunque access_level sea 1', () => {
    renderPage(itAdminFlag)
    expect(screen.getByRole('button', { name: /notificaciones/i })).toBeInTheDocument()
  })
})

describe('TicketsPage — renderizado de vistas por ruta', () => {
  it('ruta /tickets renderiza TicketsListView', () => {
    renderPage(userBase, { route: '/tickets' })
    expect(screen.getByTestId('tickets-list-view')).toBeInTheDocument()
    expect(screen.queryByTestId('ticket-analytics-view')).not.toBeInTheDocument()
    expect(screen.queryByTestId('notification-preferences-view')).not.toBeInTheDocument()
  })

  it('ruta /tickets/analytics renderiza TicketAnalyticsView para usuario con acceso', () => {
    renderPage(userAnalytics, { route: '/tickets/analytics' })
    expect(screen.getByTestId('ticket-analytics-view')).toBeInTheDocument()
    expect(screen.queryByTestId('tickets-list-view')).not.toBeInTheDocument()
  })

  it('ruta /tickets/analytics NO renderiza la vista para usuario sin acceso', () => {
    renderPage(userBase, { route: '/tickets/analytics' })
    expect(screen.queryByTestId('ticket-analytics-view')).not.toBeInTheDocument()
  })

  it('ruta /tickets/notificaciones renderiza NotificationPreferencesView para IT admin', () => {
    renderPage(itAdmin, { route: '/tickets/notificaciones' })
    expect(screen.getByTestId('notification-preferences-view')).toBeInTheDocument()
    expect(screen.queryByTestId('tickets-list-view')).not.toBeInTheDocument()
  })

  it('ruta /tickets/notificaciones NO renderiza la vista para usuario no IT admin', () => {
    renderPage(userAnalytics, { route: '/tickets/notificaciones' })
    expect(screen.queryByTestId('notification-preferences-view')).not.toBeInTheDocument()
  })
})

describe('TicketsPage — header del módulo', () => {
  it('muestra el título "Soporte Técnico"', () => {
    renderPage(userBase)
    expect(screen.getByRole('heading', { name: /soporte técnico/i })).toBeInTheDocument()
  })

  it('muestra subtítulo de gestión IT para usuario del depto IT', () => {
    renderPage(itAdmin)
    expect(screen.getByText(/gestión de solicitudes it/i)).toBeInTheDocument()
  })

  it('muestra subtítulo de usuario regular para no-IT', () => {
    renderPage(userBase)
    expect(screen.getByText(/tus solicitudes de soporte/i)).toBeInTheDocument()
  })
})
