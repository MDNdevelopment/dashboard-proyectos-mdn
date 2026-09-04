/**
 * Tests de MonitorUsoPage (módulo propio en el sidebar, con tabs Dashboard / Gráficas):
 * - Renderiza el tab switcher y por defecto muestra la sección "dashboard".
 * - Navegar a /monitor-uso/graficas activa la sección "graficas".
 */
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { vi } from 'vitest'

vi.mock('../supabase', () => {
  const chainable = { on: () => chainable, subscribe: () => chainable }
  return { supabase: { channel: () => chainable, removeChannel: () => {} } }
})

vi.mock('../components/metricas/metricsApi', () => ({
  loadLines: vi.fn().mockResolvedValue({ data: [], error: null }),
}))

vi.mock('../components/metricas/UsoView', () => ({
  default: (props) => <div data-testid="uso-view" data-section={props.section} />,
}))

const MOCK_USER = { user_id: 'u-1', company_id: 'co-1', access_level: 4, admin: false }
vi.mock('../context/AuthContext', () => ({
  useAuth: () => ({ userProfile: MOCK_USER }),
}))

import MonitorUsoPage from '../pages/MonitorUsoPage'

function renderPage(initialEntry = '/monitor-uso') {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <Routes>
        <Route path="/monitor-uso" element={<MonitorUsoPage />} />
        <Route path="/monitor-uso/graficas" element={<MonitorUsoPage />} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('MonitorUsoPage', () => {
  it('muestra los tabs "Dashboard" y "Gráficas", con dashboard activo por defecto', async () => {
    renderPage('/monitor-uso')
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Dashboard' })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Gráficas' })).toBeInTheDocument()
      expect(screen.getByTestId('uso-view')).toHaveAttribute('data-section', 'dashboard')
    })
  })

  it('/monitor-uso/graficas activa la sección "graficas"', async () => {
    renderPage('/monitor-uso/graficas')
    await waitFor(() => {
      expect(screen.getByTestId('uso-view')).toHaveAttribute('data-section', 'graficas')
    })
  })
})
