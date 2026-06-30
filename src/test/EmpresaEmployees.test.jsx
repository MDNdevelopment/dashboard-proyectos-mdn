import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { vi } from 'vitest'

// ── Mock supabase ─────────────────────────────────────────────────────────────
vi.mock('../supabase', () => {
  const channel = { on: vi.fn().mockReturnThis(), subscribe: vi.fn().mockReturnThis() }

  const mockFrom = vi.fn()
  const makeQuery = (result = []) => ({
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    order: vi.fn().mockResolvedValue({ data: result, error: null }),
    insert: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    delete: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({ data: result[0] ?? null, error: null }),
  })

  mockFrom.mockImplementation(table => {
    if (table === 'users')       return makeQuery(MOCK_USERS)
    if (table === 'departments') return makeQuery(MOCK_DEPARTMENTS)
    if (table === 'positions')   return makeQuery(MOCK_POSITIONS)
    if (table === 'vacations')   return makeQuery(MOCK_VACATIONS)
    return makeQuery([])
  })

  return {
    supabase: {
      from: mockFrom,
      channel: vi.fn(() => channel),
      removeChannel: vi.fn(),
    },
  }
})

// ── Mock AuthContext ──────────────────────────────────────────────────────────
vi.mock('../context/AuthContext', () => ({
  useAuth: vi.fn(),
}))

// ── Datos de prueba ───────────────────────────────────────────────────────────
const MOCK_DEPARTMENTS = [
  { department_id: 'd1', department_name: 'Diseño', company_id: 'co-1', dashboard_visible: true },
]
const MOCK_POSITIONS = [
  { position_id: 'p1', position_name: 'Diseñador Gráfico', department_id: 'd1', company_id: 'co-1' },
]
const MOCK_USERS = [
  {
    user_id: 'u10',
    first_name: 'Ana',
    last_name: 'Pérez',
    email: 'ana@test.com',
    department_id: 'd1',
    position_id: 'p1',
    company_id: 'co-1',
    access_level: 2,
    admin: false,
    avatar_url: null,
    phone_number: null,
    birth_date: null,
    hire_date: null,
    department: { department_name: 'Diseño' },
    position: { position_name: 'Diseñador Gráfico' },
  },
  {
    user_id: 'u11',
    first_name: 'Carlos',
    last_name: 'López',
    email: 'carlos@test.com',
    department_id: 'd1',
    position_id: 'p1',
    company_id: 'co-1',
    access_level: 3,
    admin: true,
    avatar_url: null,
    phone_number: null,
    birth_date: null,
    hire_date: null,
    department: { department_name: 'Diseño' },
    position: { position_name: 'Diseñador Gráfico' },
  },
]
const MOCK_VACATIONS = [
  {
    id: 'v1',
    user_id: 'u10',
    start_date: '2026-07-01',
    end_date: '2026-07-15',
    status: 'pending',
  },
]

import { useAuth } from '../context/AuthContext'
import EmpresaPage from '../pages/EmpresaPage'

// ── Helpers ───────────────────────────────────────────────────────────────────
function renderAsAdmin(path = '/empresa/empleados') {
  useAuth.mockReturnValue({
    userProfile: {
      user_id: 'u-admin',
      company_id: 'co-1',
      access_level: 3,
      admin: true,
      first_name: 'Admin',
      last_name: 'User',
    },
  })
  return render(
    <MemoryRouter initialEntries={[path]}>
      <EmpresaPage />
    </MemoryRouter>
  )
}

// Capabilities restringidas para nivel 1 según los defaults sembrados
const LEVEL1_RESTRICTED = [
  'empresa.departamentos', 'empresa.empleados', 'empresa.preguntas', 'empresa.permisos',
  'empresa.clientes', 'empresa.lineas', 'empresa.clientes.manage', 'empresa.lineas.manage',
]

function renderAsNonAdmin() {
  useAuth.mockReturnValue({
    userProfile: {
      user_id: 'u-regular',
      company_id: 'co-1',
      access_level: 1,
      admin: false,
      first_name: 'Regular',
      last_name: 'User',
    },
    can: (key) => !LEVEL1_RESTRICTED.includes(key),
  })
  return render(
    <MemoryRouter initialEntries={['/empresa']}>
      <EmpresaPage />
    </MemoryRouter>
  )
}

// ── Tests ─────────────────────────────────────────────────────────────────────
describe('EmployeesView', () => {
  it('renderiza la lista de empleados tras cargar', async () => {
    renderAsAdmin()
    await waitFor(() => {
      expect(screen.getByText('Ana Pérez')).toBeInTheDocument()
    })
    expect(screen.getByText('Carlos López')).toBeInTheDocument()
  })

  it('muestra el badge Admin para empleados con admin=true', async () => {
    renderAsAdmin()
    await waitFor(() => {
      expect(screen.getByText('Admin')).toBeInTheDocument()
    })
  })

  it('muestra el cargo y departamento de cada empleado', async () => {
    renderAsAdmin()
    await waitFor(() => {
      expect(screen.getAllByText('Diseñador Gráfico').length).toBeGreaterThan(0)
    })
  })

  it('la búsqueda filtra por nombre', async () => {
    const user = userEvent.setup()
    renderAsAdmin()
    await waitFor(() => { expect(screen.getByText('Ana Pérez')).toBeInTheDocument() })

    const input = screen.getByPlaceholderText(/buscar/i)
    await user.type(input, 'Ana')

    expect(screen.getByText('Ana Pérez')).toBeInTheDocument()
    expect(screen.queryByText('Carlos López')).not.toBeInTheDocument()
  })

  it('la búsqueda filtra por email', async () => {
    const user = userEvent.setup()
    renderAsAdmin()
    await waitFor(() => { expect(screen.getByText('Carlos López')).toBeInTheDocument() })

    const input = screen.getByPlaceholderText(/buscar/i)
    await user.type(input, 'carlos@')

    expect(screen.getByText('Carlos López')).toBeInTheDocument()
    expect(screen.queryByText('Ana Pérez')).not.toBeInTheDocument()
  })

  it('no-admin no ve el tab Empleados', () => {
    renderAsNonAdmin()
    expect(screen.queryByRole('button', { name: 'Empleados' })).not.toBeInTheDocument()
  })

  it('no-admin que navega a /empresa/empleados no ve la gestión de empleados', () => {
    useAuth.mockReturnValue({
      userProfile: {
        user_id: 'u-regular',
        company_id: 'co-1',
        access_level: 1,
        admin: false,
        first_name: 'Regular',
        last_name: 'User',
      },
      can: (key) => !LEVEL1_RESTRICTED.includes(key),
    })
    render(
      <MemoryRouter initialEntries={['/empresa/empleados']}>
        <EmpresaPage />
      </MemoryRouter>
    )
    expect(screen.getByRole('button', { name: 'Inicio' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Empleados' })).not.toBeInTheDocument()
  })

  it('abre el modal de edición al hacer click en Editar', async () => {
    const user = userEvent.setup()
    renderAsAdmin()
    await waitFor(() => { expect(screen.getByText('Ana Pérez')).toBeInTheDocument() })

    const editButtons = screen.getAllByRole('button', { name: 'Editar' })
    await user.click(editButtons[0])

    expect(screen.getByText('Editar empleado')).toBeInTheDocument()
  })

  it('el modal de edición muestra los campos del empleado pre-rellenados', async () => {
    const user = userEvent.setup()
    renderAsAdmin()
    await waitFor(() => { expect(screen.getByText('Ana Pérez')).toBeInTheDocument() })

    const editButtons = screen.getAllByRole('button', { name: 'Editar' })
    await user.click(editButtons[0])

    expect(screen.getByDisplayValue('Ana')).toBeInTheDocument()
    expect(screen.getByDisplayValue('Pérez')).toBeInTheDocument()
  })

  it('abre el diálogo de vacaciones al hacer click en Vacaciones', async () => {
    const user = userEvent.setup()
    renderAsAdmin()
    await waitFor(() => { expect(screen.getByText('Ana Pérez')).toBeInTheDocument() })

    const vacButtons = screen.getAllByRole('button', { name: 'Vacaciones' })
    await user.click(vacButtons[0])

    // El dialog muestra el título como heading h2
    expect(screen.getByRole('heading', { name: 'Vacaciones' })).toBeInTheDocument()
  })

  it('el diálogo de vacaciones lista las vacaciones del empleado', async () => {
    const user = userEvent.setup()
    renderAsAdmin()
    await waitFor(() => { expect(screen.getByText('Ana Pérez')).toBeInTheDocument() })

    const vacButtons = screen.getAllByRole('button', { name: 'Vacaciones' })
    await user.click(vacButtons[0])

    await waitFor(() => {
      expect(screen.getByText('Pendiente')).toBeInTheDocument()
    })
    // Fecha formateada como dd/MM/yyyy
    expect(screen.getByText('01/07/2026 – 15/07/2026')).toBeInTheDocument()
  })
})
