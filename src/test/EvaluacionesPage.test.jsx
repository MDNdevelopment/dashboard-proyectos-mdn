import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { vi } from 'vitest'
import { createSupabaseMock, makeQuery } from './helpers/supabaseMock'

// ── Mock supabase ─────────────────────────────────────────────────────────────
vi.mock('../supabase', () => ({
  supabase: createSupabaseMock({
    tables: {
      users: () => makeQuery([]),
      employee_score_snapshots: () => makeQuery([]),
    },
    rpc: { users: [], profiles: [] },
  }),
}))

// ── Mock AuthContext ──────────────────────────────────────────────────────────
vi.mock('../context/AuthContext', () => ({
  useAuth: vi.fn(),
}))

import { useAuth } from '../context/AuthContext'
import EvaluacionesPage from '../pages/EvaluacionesPage'

function renderWithAuth(userProfile, { can = () => true, path = '/evaluaciones' } = {}) {
  useAuth.mockReturnValue({ userProfile, can })
  return render(
    <MemoryRouter initialEntries={[path]}>
      <EvaluacionesPage />
    </MemoryRouter>,
  )
}

const PROFILE = {
  user_id: 'eval-1',
  company_id: 'co-1',
  access_level: 2,
  admin: false,
  first_name: 'Evaluador',
  last_name: 'Test',
}

describe('EvaluacionesPage', () => {
  it('muestra el encabezado de la página', () => {
    renderWithAuth(PROFILE)
    expect(screen.getByText('Evaluaciones')).toBeInTheDocument()
  })

  it('muestra los tabs Mi Desempeño, Evaluar y Rendimientos', () => {
    renderWithAuth(PROFILE)
    expect(screen.getByRole('button', { name: 'Mi Desempeño' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Evaluar' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Rendimientos' })).toBeInTheDocument()
  })

  it('el tab activo inicial (/evaluaciones) es Evaluar', () => {
    renderWithAuth(PROFILE)
    const tab = screen.getByRole('button', { name: 'Evaluar' })
    expect(tab.className).toContain('bg-[#111]')
  })

  it('el tab Mi Desempeño está activo al navegar a /evaluaciones/mi-desempeno', () => {
    renderWithAuth(PROFILE, { path: '/evaluaciones/mi-desempeno' })
    const tab = screen.getByRole('button', { name: 'Mi Desempeño' })
    expect(tab.className).toContain('bg-[#111]')
  })

  it('el tab Rendimientos está activo al navegar a /evaluaciones/rendimientos', () => {
    renderWithAuth(PROFILE, { path: '/evaluaciones/rendimientos' })
    const tab = screen.getByRole('button', { name: 'Rendimientos' })
    expect(tab.className).toContain('bg-[#111]')
  })

  it('solo muestra los tabs habilitados por capability', () => {
    renderWithAuth(PROFILE, { can: (key) => key === 'evaluaciones.mi-desempeno' })
    expect(screen.getByRole('button', { name: 'Mi Desempeño' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Evaluar' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Rendimientos' })).not.toBeInTheDocument()
  })

  it('oculta el tab switcher en el perfil de un empleado ajeno', () => {
    renderWithAuth(PROFILE, { path: '/evaluaciones/empleado/otro-user' })
    expect(screen.queryByRole('button', { name: 'Mi Desempeño' })).not.toBeInTheDocument()
  })

  it('muestra el spinner mientras no hay userProfile', () => {
    const { container } = renderWithAuth(null)
    expect(container.querySelector('.animate-spin')).toBeInTheDocument()
  })
})
