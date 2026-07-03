import { render, screen } from '@testing-library/react'
import { vi } from 'vitest'
import { MemoryRouter } from 'react-router-dom'

vi.mock('../context/AuthContext', () => ({
  useAuth: vi.fn(),
}))

vi.mock('../hooks/useTicketAnalytics', () => ({
  useTicketAnalytics: vi.fn(),
}))

import { useAuth } from '../context/AuthContext'
import { useTicketAnalytics } from '../hooks/useTicketAnalytics'
import TicketAnalyticsPage from '../components/tickets/TicketAnalyticsView'

const emptyMetrics = {
  total: 0, open: 0, inProgress: 0, resolved: 0, overdue: 0,
  avgResolutionHours: 0,
  ticketsPerDay: [], statusBreakdown: [], categoryBreakdown: [],
  priorityBreakdown: [], staffPerformance: [],
}

function renderPage() {
  return render(
    <MemoryRouter>
      <TicketAnalyticsPage />
    </MemoryRouter>
  )
}

describe('TicketAnalyticsPage', () => {
  it('muestra acceso restringido para usuarios sin permisos', () => {
    useAuth.mockReturnValue({ userProfile: { access_level: 1, admin: false } })
    useTicketAnalytics.mockReturnValue({ metrics: emptyMetrics, loading: false, error: null })
    renderPage()
    expect(screen.getByText('Acceso restringido')).toBeInTheDocument()
  })

  it('permite acceso a usuarios con access_level >= 3', () => {
    useAuth.mockReturnValue({ userProfile: { access_level: 3, admin: false } })
    useTicketAnalytics.mockReturnValue({ metrics: emptyMetrics, loading: false, error: null })
    renderPage()
    expect(screen.queryByText('Acceso restringido')).not.toBeInTheDocument()
  })

  it('permite acceso a usuarios con admin=true', () => {
    useAuth.mockReturnValue({ userProfile: { access_level: 1, admin: true } })
    useTicketAnalytics.mockReturnValue({ metrics: emptyMetrics, loading: false, error: null })
    renderPage()
    expect(screen.queryByText('Acceso restringido')).not.toBeInTheDocument()
  })

  it('muestra spinner mientras carga', () => {
    useAuth.mockReturnValue({ userProfile: { access_level: 3, admin: false } })
    useTicketAnalytics.mockReturnValue({ metrics: emptyMetrics, loading: true, error: null })
    const { container } = renderPage()
    expect(container.querySelector('.animate-spin')).toBeInTheDocument()
  })

  it('muestra error si falla la carga', () => {
    useAuth.mockReturnValue({ userProfile: { access_level: 3, admin: false } })
    useTicketAnalytics.mockReturnValue({ metrics: emptyMetrics, loading: false, error: 'db error' })
    renderPage()
    expect(screen.getByText(/Error al cargar datos/)).toBeInTheDocument()
  })

  it('renderiza SummaryCards cuando hay datos', () => {
    useAuth.mockReturnValue({ userProfile: { access_level: 3, admin: false } })
    useTicketAnalytics.mockReturnValue({
      metrics: { ...emptyMetrics, total: 5, open: 2, resolved: 3 },
      loading: false,
      error: null,
    })
    renderPage()
    expect(screen.getByText('Total')).toBeInTheDocument()
    expect(screen.getByText('Resueltos')).toBeInTheDocument()
  })
})
