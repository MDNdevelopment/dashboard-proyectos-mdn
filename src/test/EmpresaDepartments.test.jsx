import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { vi } from 'vitest'
import { createSupabaseMock, makeQuery } from './helpers/supabaseMock'

// ── Mock supabase ─────────────────────────────────────────────────────────────
vi.mock('../supabase', () => ({
  supabase: createSupabaseMock({
    tables: {
      departments: () => makeQuery(MOCK_DEPARTMENTS),
      positions: () => makeQuery(MOCK_POSITIONS),
    },
  }),
}))

// ── Mock AuthContext ──────────────────────────────────────────────────────────
vi.mock('../context/AuthContext', () => ({
  useAuth: vi.fn(),
}))

// ── Datos de prueba ───────────────────────────────────────────────────────────
const MOCK_DEPARTMENTS = [
  { department_id: 'd1', department_name: 'Diseño', company_id: 'co-1', dashboard_visible: true },
  {
    department_id: 'd2',
    department_name: 'Tecnología',
    company_id: 'co-1',
    dashboard_visible: false,
  },
]
const MOCK_POSITIONS = [
  {
    position_id: 'p1',
    position_name: 'Diseñador Gráfico',
    department_id: 'd1',
    company_id: 'co-1',
  },
]

import { useAuth } from '../context/AuthContext'
import EmpresaPage from '../pages/EmpresaPage'
import ConfirmDeleteDialog from '../components/common/ConfirmDeleteDialog'

// ── Helpers ───────────────────────────────────────────────────────────────────
function renderAsAdmin(path = '/empresa/departamentos') {
  useAuth.mockReturnValue({
    userProfile: {
      user_id: 'u1',
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
    </MemoryRouter>,
  )
}

// Capabilities restringidas para nivel 1 según los defaults sembrados
const LEVEL1_RESTRICTED = [
  'empresa.departamentos',
  'empresa.empleados',
  'empresa.preguntas',
  'empresa.permisos',
  'empresa.clientes',
  'empresa.lineas',
  'empresa.clientes.manage',
  'empresa.lineas.manage',
]

function renderAsNonAdmin() {
  useAuth.mockReturnValue({
    userProfile: {
      user_id: 'u2',
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
    </MemoryRouter>,
  )
}

// ── Tests EmpresaPage ─────────────────────────────────────────────────────────
describe('EmpresaPage', () => {
  it('renders the page title', () => {
    renderAsAdmin()
    expect(screen.getByText('Empresa')).toBeInTheDocument()
  })

  it('admin ve los tabs de gestión', () => {
    renderAsAdmin()
    expect(screen.getByRole('button', { name: 'Departamentos' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Empleados' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Preguntas' })).toBeInTheDocument()
  })

  it('no-admin no ve los tabs de gestión', () => {
    renderAsNonAdmin()
    expect(screen.queryByRole('button', { name: 'Departamentos' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Empleados' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Preguntas' })).not.toBeInTheDocument()
  })

  it('renderiza la lista de departamentos tras cargar', async () => {
    renderAsAdmin()
    await waitFor(() => {
      expect(screen.getByText('Diseño')).toBeInTheDocument()
    })
    expect(screen.getByText('Tecnología')).toBeInTheDocument()
  })

  it('muestra el botón Nuevo departamento para admin', async () => {
    renderAsAdmin()
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /nuevo departamento/i })).toBeInTheDocument()
    })
  })

  it('no-admin en /empresa solo ve el tab Inicio', () => {
    renderAsNonAdmin()
    expect(screen.getByRole('button', { name: 'Inicio' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Departamentos' })).not.toBeInTheDocument()
  })
})

// ── Tests ConfirmDeleteDialog ─────────────────────────────────────────────────
describe('ConfirmDeleteDialog', () => {
  it('el botón Eliminar está deshabilitado hasta escribir el nombre exacto', async () => {
    const user = userEvent.setup()
    const onConfirm = vi.fn()
    const onCancel = vi.fn()

    render(
      <ConfirmDeleteDialog
        itemName="Diseño"
        itemLabel="departamento"
        onConfirm={onConfirm}
        onCancel={onCancel}
      />,
    )

    const deleteBtn = screen.getByRole('button', { name: /^eliminar$/i })
    expect(deleteBtn).toBeDisabled()

    await user.type(screen.getByPlaceholderText('Diseño'), 'Diseño')
    expect(deleteBtn).not.toBeDisabled()
  })

  it('el botón permanece deshabilitado con un nombre incorrecto', async () => {
    const user = userEvent.setup()

    render(
      <ConfirmDeleteDialog
        itemName="Diseño"
        itemLabel="departamento"
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    )

    const deleteBtn = screen.getByRole('button', { name: /^eliminar$/i })
    await user.type(screen.getByPlaceholderText('Diseño'), 'diseño') // minúscula, no coincide
    expect(deleteBtn).toBeDisabled()
  })

  it('llama a onConfirm al hacer click con el nombre correcto', async () => {
    const user = userEvent.setup()
    const onConfirm = vi.fn()

    render(
      <ConfirmDeleteDialog
        itemName="Diseño"
        itemLabel="departamento"
        onConfirm={onConfirm}
        onCancel={vi.fn()}
      />,
    )

    await user.type(screen.getByPlaceholderText('Diseño'), 'Diseño')
    await user.click(screen.getByRole('button', { name: /^eliminar$/i }))
    expect(onConfirm).toHaveBeenCalledTimes(1)
  })

  it('llama a onCancel al hacer click en Cancelar', async () => {
    const user = userEvent.setup()
    const onCancel = vi.fn()

    render(
      <ConfirmDeleteDialog
        itemName="Diseño"
        itemLabel="departamento"
        onConfirm={vi.fn()}
        onCancel={onCancel}
      />,
    )

    await user.click(screen.getByRole('button', { name: /cancelar/i }))
    expect(onCancel).toHaveBeenCalledTimes(1)
  })
})
