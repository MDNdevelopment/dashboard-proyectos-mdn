import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi } from 'vitest'

const MOCK_EMPLOYEES = [
  { user_id: 'u-1', company_id: 'co-1', first_name: 'Ana', last_name: 'Pérez', deleted_at: null },
  { user_id: 'u-2', company_id: 'co-1', first_name: 'Luis', last_name: 'Gómez', deleted_at: null },
]

const now = new Date()
const YEAR = now.getFullYear()
const MONTH = now.getMonth() + 1

const MOCK_PERMISSIONS = [
  {
    id: 'p-1',
    user_id: 'u-1',
    type: 'permiso',
    start_date: `${YEAR}-${String(MONTH).padStart(2, '0')}-01`,
    end_date: `${YEAR}-${String(MONTH).padStart(2, '0')}-02`,
    reason: 'Trámite',
  },
]

const mockLoadCompanyEmployees = vi.fn().mockResolvedValue({ data: MOCK_EMPLOYEES, error: null })
vi.mock('../components/metricas/metricsApi', () => ({
  loadCompanyEmployees: (...a) => mockLoadCompanyEmployees(...a),
}))

const mockFetchPermissionsByMonth = vi.fn().mockResolvedValue(MOCK_PERMISSIONS)
const mockDeletePermission = vi.fn().mockResolvedValue(undefined)
const mockFetchPermissionsForEmployee = vi.fn().mockResolvedValue(MOCK_PERMISSIONS)
const mockCreatePermission = vi.fn().mockResolvedValue({ id: 'p-2' })
vi.mock('../lib/employeePermissions', () => ({
  fetchPermissionsByMonth: (...a) => mockFetchPermissionsByMonth(...a),
  fetchPermissionsForEmployee: (...a) => mockFetchPermissionsForEmployee(...a),
  createPermission: (...a) => mockCreatePermission(...a),
  deletePermission: (...a) => mockDeletePermission(...a),
}))

vi.mock('../supabase', () => {
  const channel = { on: vi.fn().mockReturnThis(), subscribe: vi.fn().mockReturnThis() }
  return {
    supabase: {
      channel: vi.fn(() => channel),
      removeChannel: vi.fn(),
    },
  }
})

vi.mock('../context/AuthContext', () => ({
  useAuth: vi.fn(),
}))

import { useAuth } from '../context/AuthContext'
import PermisosRrhhView from '../components/empresa/PermisosRrhhView'

function renderView(can) {
  useAuth.mockReturnValue({
    userProfile: { user_id: 'u-viewer', company_id: 'co-1', access_level: 4, admin: false },
    can,
  })
  return render(<PermisosRrhhView companyId="co-1" />)
}

describe('PermisosRrhhView (RRHH)', () => {
  beforeEach(() => {
    mockLoadCompanyEmployees.mockClear()
    mockFetchPermissionsByMonth.mockClear()
  })

  it('rinde la tabla resumen con los conteos y la fila TOTAL', async () => {
    renderView(() => true)
    await waitFor(() => expect(screen.getByText('Ana Pérez')).toBeInTheDocument())
    expect(screen.getByText('Luis Gómez')).toBeInTheDocument()
    expect(screen.getByText('TOTAL')).toBeInTheDocument()
  })

  it('muestra el botón "+ Registrar novedad" solo si tiene empresa.permisos.manage', async () => {
    renderView(() => true)
    await waitFor(() => expect(screen.getByText('Ana Pérez')).toBeInTheDocument())
    expect(screen.getByText('+ Registrar novedad')).toBeInTheDocument()
  })

  it('oculta el botón "+ Registrar novedad" sin la capacidad de escritura', async () => {
    renderView((key) => key !== 'empresa.permisos.manage')
    await waitFor(() => expect(screen.getByText('Ana Pérez')).toBeInTheDocument())
    expect(screen.queryByText('+ Registrar novedad')).not.toBeInTheDocument()
  })

  it('cambiar el mes refetchea el rango nuevo', async () => {
    renderView(() => true)
    await waitFor(() => expect(mockFetchPermissionsByMonth).toHaveBeenCalledTimes(1))
    const user = userEvent.setup()
    await user.selectOptions(screen.getByLabelText('Mes'), String((MONTH % 12) + 1))
    await waitFor(() => expect(mockFetchPermissionsByMonth).toHaveBeenCalledTimes(2))
  })
})
