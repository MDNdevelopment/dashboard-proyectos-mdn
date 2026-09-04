/**
 * Tests de MetricasPage (tabs Dashboard / líneas):
 * - El tab "Dashboard" siempre está visible.
 * - Navegar a /reportes/linea/:id renderiza LineView.
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
  seedMetricsIfEmpty: vi.fn().mockResolvedValue(null),
  exportMetrics: vi.fn(),
  importMetrics: vi.fn(),
}))

vi.mock('../components/metricas/DashboardView', () => ({
  default: () => <div data-testid="dashboard-view" />,
}))
vi.mock('../components/metricas/LineView', () => ({
  default: () => <div data-testid="line-view" />,
}))

const MOCK_USER = { user_id: 'u-1', company_id: 'co-1', access_level: 4, admin: false }

let mockCan = () => true
vi.mock('../context/AuthContext', () => ({
  useAuth: () => ({ userProfile: MOCK_USER, can: (key) => mockCan(key) }),
}))

import MetricasPage from '../pages/MetricasPage'

function renderPage(initialEntry = '/reportes') {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <Routes>
        <Route path="/reportes" element={<MetricasPage />} />
        <Route path="/reportes/linea/:lineId" element={<MetricasPage />} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('MetricasPage', () => {
  it('muestra el tab "Dashboard" y el DashboardView por defecto', async () => {
    mockCan = () => true
    renderPage('/reportes')
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Dashboard' })).toBeInTheDocument()
      expect(screen.getByTestId('dashboard-view')).toBeInTheDocument()
    })
  })

  it('ya no muestra un tab "Monitor de uso" (se movió a su propio módulo en el sidebar)', async () => {
    mockCan = () => true
    renderPage('/reportes')
    await waitFor(() => {
      expect(screen.getByTestId('dashboard-view')).toBeInTheDocument()
    })
    expect(screen.queryByRole('button', { name: 'Monitor de uso' })).not.toBeInTheDocument()
  })
})
