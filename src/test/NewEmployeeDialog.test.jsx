import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi } from 'vitest'

// ── Mock supabase ─────────────────────────────────────────────────────────────
vi.mock('../supabase', () => ({
  supabase: {
    auth: {
      getSession: vi.fn().mockResolvedValue({
        data: { session: { access_token: 'test-token-123' } },
      }),
    },
  },
}))

vi.mock('../context/AuthContext', () => ({
  useAuth: vi.fn(() => ({
    userProfile: { user_id: 'u-admin', company_id: 'co-1', access_level: 4, admin: true },
    can: () => true,
    signOut: vi.fn(),
  })),
}))

// ── Datos de prueba ───────────────────────────────────────────────────────────
const MOCK_DEPARTMENTS = [
  { department_id: 'd1', department_name: 'Diseño', company_id: 'co-1' },
  { department_id: 'd2', department_name: 'Tecnología', company_id: 'co-1' },
]
const MOCK_POSITIONS = [
  { position_id: 'p1', position_name: 'Diseñador Gráfico', department_id: 'd1', company_id: 'co-1' },
  { position_id: 'p2', position_name: 'Desarrollador', department_id: 'd2', company_id: 'co-1' },
]

const NEW_EMPLOYEE_ROW = {
  user_id: 'u-new',
  email: 'nuevo@test.com',
  first_name: 'Nuevo',
  last_name: 'Empleado',
  department_id: 'd1',
  position_id: 'p1',
  access_level: 1,
  admin: false,
  company_id: 'co-1',
  department: { department_name: 'Diseño' },
  position: { position_name: 'Diseñador Gráfico' },
}

import NewEmployeeDialog from '../components/empresa/NewEmployeeDialog'

// ── Helper render ─────────────────────────────────────────────────────────────
function renderDialog(overrides = {}) {
  const props = {
    departments: MOCK_DEPARTMENTS,
    positions: MOCK_POSITIONS,
    onClose: vi.fn(),
    onCreated: vi.fn(),
    ...overrides,
  }
  return { ...render(<NewEmployeeDialog {...props} />), props }
}

// ── Tests ─────────────────────────────────────────────────────────────────────
describe('NewEmployeeDialog', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => NEW_EMPLOYEE_ROW,
    }))
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.clearAllMocks()
  })

  // ── Render ──────────────────────────────────────────────────────────────────
  it('renderiza los campos básicos', () => {
    renderDialog()
    expect(screen.getByPlaceholderText('empleado@empresa.com')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('Nombre')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('Apellido')).toBeInTheDocument()
    expect(screen.getByText('Nuevo empleado')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Crear empleado' })).toBeInTheDocument()
  })

  it('renderiza los selects de departamento y cargo', () => {
    renderDialog()
    expect(screen.getByDisplayValue('Sin departamento')).toBeInTheDocument()
    expect(screen.getByDisplayValue('Sin cargo')).toBeInTheDocument()
  })

  // ── Validación ──────────────────────────────────────────────────────────────
  it('muestra error y no llama fetch si email está vacío', async () => {
    const user = userEvent.setup()
    renderDialog()

    await user.type(screen.getByPlaceholderText('Nombre'), 'Ana')
    await user.type(screen.getByPlaceholderText('Apellido'), 'López')
    await user.click(screen.getByRole('button', { name: 'Crear empleado' }))

    expect(screen.getByText('El email es obligatorio')).toBeInTheDocument()
    expect(fetch).not.toHaveBeenCalled()
  })

  it('muestra error y no llama fetch si nombre está vacío', async () => {
    const user = userEvent.setup()
    renderDialog()

    await user.type(screen.getByPlaceholderText('empleado@empresa.com'), 'ana@test.com')
    await user.type(screen.getByPlaceholderText('Apellido'), 'López')
    await user.click(screen.getByRole('button', { name: 'Crear empleado' }))

    expect(screen.getByText('El nombre es obligatorio')).toBeInTheDocument()
    expect(fetch).not.toHaveBeenCalled()
  })

  it('muestra error y no llama fetch si apellido está vacío', async () => {
    const user = userEvent.setup()
    renderDialog()

    await user.type(screen.getByPlaceholderText('empleado@empresa.com'), 'ana@test.com')
    await user.type(screen.getByPlaceholderText('Nombre'), 'Ana')
    await user.click(screen.getByRole('button', { name: 'Crear empleado' }))

    expect(screen.getByText('El apellido es obligatorio')).toBeInTheDocument()
    expect(fetch).not.toHaveBeenCalled()
  })

  // ── Filtrado de cargos ───────────────────────────────────────────────────────
  it('el select de cargo solo muestra posiciones del departamento seleccionado', async () => {
    renderDialog()

    // getAllByRole('combobox'): [0]=departamento, [1]=cargo, [2]=access_level
    const [deptSelect] = screen.getAllByRole('combobox')

    // Seleccionar departamento Diseño
    await userEvent.selectOptions(deptSelect, 'd1')

    // Cargo del dept Diseño debe aparecer, el de Tecnología no
    expect(screen.getByRole('option', { name: 'Diseñador Gráfico' })).toBeInTheDocument()
    expect(screen.queryByRole('option', { name: 'Desarrollador' })).not.toBeInTheDocument()
  })

  it('al cambiar de departamento resetea el cargo seleccionado', async () => {
    renderDialog()

    const [deptSelect, cargoSelect] = screen.getAllByRole('combobox')

    // Seleccionar Diseño → habilita el select de cargo
    await userEvent.selectOptions(deptSelect, 'd1')
    await userEvent.selectOptions(cargoSelect, 'p1')

    // Cambiar a Tecnología → cargo debe resetearse al primer cargo de ese dept
    await userEvent.selectOptions(deptSelect, 'd2')

    // El cargo de Diseño ya no debe estar disponible
    expect(screen.queryByRole('option', { name: 'Diseñador Gráfico' })).not.toBeInTheDocument()
  })

  // ── Submit exitoso ───────────────────────────────────────────────────────────
  it('envía POST a /api/employees con token y llama onCreated + onClose', async () => {
    const user = userEvent.setup()
    const { props } = renderDialog()

    await user.type(screen.getByPlaceholderText('empleado@empresa.com'), 'nuevo@test.com')
    await user.type(screen.getByPlaceholderText('Nombre'), 'Nuevo')
    await user.type(screen.getByPlaceholderText('Apellido'), 'Empleado')
    await user.click(screen.getByRole('button', { name: 'Crear empleado' }))

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith(
        '/api/employees',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            Authorization: 'Bearer test-token-123',
            'Content-Type': 'application/json',
          }),
        })
      )
    })

    expect(props.onCreated).toHaveBeenCalledWith(NEW_EMPLOYEE_ROW)
    expect(props.onClose).toHaveBeenCalled()
  })

  it('incluye todos los campos del formulario en el body', async () => {
    const user = userEvent.setup()
    renderDialog()

    await user.type(screen.getByPlaceholderText('empleado@empresa.com'), 'nuevo@test.com')
    await user.type(screen.getByPlaceholderText('Nombre'), 'Nuevo')
    await user.type(screen.getByPlaceholderText('Apellido'), 'Empleado')
    // getAllByRole('combobox'): [0]=departamento
    await userEvent.selectOptions(screen.getAllByRole('combobox')[0], 'd1')

    await user.click(screen.getByRole('button', { name: 'Crear empleado' }))

    await waitFor(() => { expect(fetch).toHaveBeenCalled() })

    const callArgs = fetch.mock.calls[0][1]
    const body = JSON.parse(callArgs.body)
    expect(body.email).toBe('nuevo@test.com')
    expect(body.first_name).toBe('Nuevo')
    expect(body.last_name).toBe('Empleado')
    expect(body.department_id).toBe('d1')
    expect(body.access_level).toBe(1)
    expect(body.admin).toBe(false)
  })

  // ── Error del servidor ───────────────────────────────────────────────────────
  it('muestra el mensaje de error del servidor y NO llama onClose', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      json: async () => ({ error: 'El email ya está en uso' }),
    }))

    const user = userEvent.setup()
    const { props } = renderDialog()

    await user.type(screen.getByPlaceholderText('empleado@empresa.com'), 'existente@test.com')
    await user.type(screen.getByPlaceholderText('Nombre'), 'Ya')
    await user.type(screen.getByPlaceholderText('Apellido'), 'Existe')
    await user.click(screen.getByRole('button', { name: 'Crear empleado' }))

    await waitFor(() => {
      expect(screen.getByText('El email ya está en uso')).toBeInTheDocument()
    })
    expect(props.onClose).not.toHaveBeenCalled()
    expect(props.onCreated).not.toHaveBeenCalled()
  })

  // ── Cerrar ───────────────────────────────────────────────────────────────────
  it('llama onClose al hacer click en Cancelar', async () => {
    const user = userEvent.setup()
    const { props } = renderDialog()

    await user.click(screen.getByRole('button', { name: 'Cancelar' }))
    expect(props.onClose).toHaveBeenCalled()
  })

  it('llama onClose al presionar Escape', async () => {
    const user = userEvent.setup()
    const { props } = renderDialog()

    await user.keyboard('{Escape}')
    expect(props.onClose).toHaveBeenCalled()
  })
})
