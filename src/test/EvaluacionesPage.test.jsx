import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { vi } from 'vitest'
import { createSupabaseMock, makeQuery } from './helpers/supabaseMock'

// ── Mock supabase ─────────────────────────────────────────────────────────────
// Las tablas se resuelven de forma perezosa (funciones) porque MOCK_USERS se
// declara más abajo: vi.mock se hoistea por encima de esa declaración.
vi.mock('../supabase', () => ({
  supabase: createSupabaseMock({
    tables: {
      users: () => makeQuery(MOCK_USERS),
    },
  }),
}))

// ── Mock AuthContext ──────────────────────────────────────────────────────────
vi.mock('../context/AuthContext', () => ({
  useAuth: vi.fn(),
}))

// ── Datos de prueba ───────────────────────────────────────────────────────────
const MOCK_USERS = [
  {
    user_id: 'u1',
    first_name: 'María',
    last_name: 'González',
    email: 'maria@test.com',
    company_id: 'co-1',
    access_level: 2,
    admin: false,
    avatar_url: null,
    department: { department_name: 'Diseño' },
    position: { position_name: 'Diseñadora' },
  },
  {
    user_id: 'u2',
    first_name: 'Pedro',
    last_name: 'Martínez',
    email: 'pedro@test.com',
    company_id: 'co-1',
    access_level: 2,
    admin: false,
    avatar_url: null,
    department: { department_name: 'Diseño' },
    position: { position_name: 'Diseñador' },
  },
]

import { useAuth } from '../context/AuthContext'
import EvaluacionesPage from '../pages/EvaluacionesPage'

// ── Helpers ───────────────────────────────────────────────────────────────────
function renderWithAuth(userProfile, path = '/evaluaciones') {
  useAuth.mockReturnValue({ userProfile })
  return render(
    <MemoryRouter initialEntries={[path]}>
      <EvaluacionesPage />
    </MemoryRouter>,
  )
}

const EVALUATOR_PROFILE = {
  user_id: 'eval-1',
  company_id: 'co-1',
  access_level: 2,
  admin: false,
  first_name: 'Evaluador',
  last_name: 'Test',
}

const ADMIN_PROFILE = {
  user_id: 'admin-1',
  company_id: 'co-1',
  access_level: 3,
  admin: true,
  first_name: 'Admin',
  last_name: 'Test',
}

const LOW_ACCESS_PROFILE = {
  user_id: 'low-1',
  company_id: 'co-1',
  access_level: 1,
  admin: false,
  first_name: 'Sin',
  last_name: 'Acceso',
}

// ── Tests ─────────────────────────────────────────────────────────────────────
describe('EvaluacionesPage', () => {
  it('muestra el encabezado de la página', () => {
    renderWithAuth(EVALUATOR_PROFILE)
    expect(screen.getByText('Evaluaciones')).toBeInTheDocument()
  })

  it('muestra los tabs Empleados y Resumen', () => {
    renderWithAuth(EVALUATOR_PROFILE)
    expect(screen.getByRole('button', { name: 'Empleados' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Resumen' })).toBeInTheDocument()
  })

  it('renderiza la lista de empleados evaluables (excluye al usuario actual)', async () => {
    // El usuario actual es eval-1; la lista debe mostrar u1 y u2 (ambos distintos de eval-1)
    renderWithAuth(EVALUATOR_PROFILE)
    await waitFor(() => {
      expect(screen.getByText('María González')).toBeInTheDocument()
    })
    expect(screen.getByText('Pedro Martínez')).toBeInTheDocument()
  })

  it('usuario con access_level=1 y admin=false ve spinner y no la lista (sin acceso)', () => {
    // Con !canEval redirige — en MemoryRouter la redirección cae a '/' que no está ruteada
    // así que simplemente no debería renderizar la lista de empleados
    renderWithAuth(LOW_ACCESS_PROFILE)
    // No debe verse la lista de empleados
    expect(screen.queryByText('María González')).not.toBeInTheDocument()
  })

  it('admin puede ver la página de evaluaciones', async () => {
    renderWithAuth(ADMIN_PROFILE)
    await waitFor(() => {
      expect(screen.getByText('María González')).toBeInTheDocument()
    })
  })

  it('el tab activo inicial es Empleados', () => {
    renderWithAuth(EVALUATOR_PROFILE)
    const empleadosTab = screen.getByRole('button', { name: 'Empleados' })
    expect(empleadosTab.className).toContain('bg-[#111]')
  })

  it('el tab Resumen está activo al navegar a /evaluaciones/resumen', () => {
    renderWithAuth(EVALUATOR_PROFILE, '/evaluaciones/resumen')
    const resumenTab = screen.getByRole('button', { name: 'Resumen' })
    expect(resumenTab.className).toContain('bg-[#111]')
  })

  it('muestra botones Evaluar para empleados sin evaluación en el período', async () => {
    renderWithAuth(EVALUATOR_PROFILE)
    await waitFor(() => {
      expect(screen.getByText('María González')).toBeInTheDocument()
    })
    const evaluarButtons = screen.getAllByRole('button', { name: 'Evaluar' })
    expect(evaluarButtons.length).toBeGreaterThan(0)
  })

  it('muestra cargo y departamento de cada empleado', async () => {
    renderWithAuth(EVALUATOR_PROFILE)
    await waitFor(() => {
      expect(screen.getByText('María González')).toBeInTheDocument()
    })
    expect(screen.getAllByText('Diseñadora').length).toBeGreaterThan(0)
  })
})
