/**
 * La pestaña "Permisos" de configuración de accesos por módulo se renombró a "Accesos"
 * (ruta /empresa/accesos, capability empresa.accesos). La ruta /empresa/permisos y la
 * capability empresa.permisos se reasignaron a la sección de RRHH (PermisosRrhhView).
 * Ver ARQUITECTURA.md §2.6 y §"Modelo de permisos".
 */
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { vi } from 'vitest'

vi.mock('../components/metricas/metricsApi', () => ({
  loadCompanyEmployees: vi.fn().mockResolvedValue({ data: [], error: null }),
}))

vi.mock('../lib/employeePermissions', () => ({
  fetchPermissionsByMonth: vi.fn().mockResolvedValue([]),
  fetchPermissionsForEmployee: vi.fn().mockResolvedValue([]),
  createPermission: vi.fn(),
  deletePermission: vi.fn(),
}))

vi.mock('../supabase', () => {
  // Cadena encadenable y a la vez "then-able": soporta tanto
  // `await supabase.from(...).select(...).eq(...)` como `.order(...)` al final,
  // sin importar en qué punto de la cadena el caller haga `await`.
  function makeChain() {
    const chain = {
      select: vi.fn(() => chain),
      eq: vi.fn(() => chain),
      order: vi.fn().mockResolvedValue({ data: [], error: null }),
      then: (resolve) => resolve({ data: [], error: null }),
    }
    return chain
  }
  const channel = { on: vi.fn().mockReturnThis(), subscribe: vi.fn().mockReturnThis() }
  return {
    supabase: {
      from: vi.fn(() => makeChain()),
      channel: vi.fn(() => channel),
      removeChannel: vi.fn(),
    },
  }
})

vi.mock('../context/AuthContext', () => ({
  useAuth: vi.fn(),
}))

import { useAuth } from '../context/AuthContext'
import EmpresaPage from '../pages/EmpresaPage'

function renderAt(path, can = () => true) {
  useAuth.mockReturnValue({
    userProfile: { user_id: 'u-admin', company_id: 'co-1', access_level: 4, admin: true },
    can,
  })
  return render(
    <MemoryRouter initialEntries={[path]}>
      <EmpresaPage />
    </MemoryRouter>,
  )
}

describe('Renombrado Permisos → Accesos', () => {
  it('el tab bar muestra "Permisos" y "Accesos" como pestañas distintas', async () => {
    renderAt('/empresa')
    expect(screen.getByRole('button', { name: 'Permisos' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Accesos' })).toBeInTheDocument()
  })

  it('/empresa/accesos rinde la vista de configuración de accesos, no la de RRHH', async () => {
    renderAt('/empresa/accesos')
    await waitFor(() => expect(screen.getByRole('button', { name: 'Accesos' })).toBeInTheDocument())
    expect(screen.queryByText('+ Registrar novedad')).not.toBeInTheDocument()
  })

  it('/empresa/permisos rinde la sección de RRHH, no la configuración de accesos', async () => {
    renderAt('/empresa/permisos')
    await waitFor(() =>
      expect(screen.getByText(/Permisos, ausencias, reposos/)).toBeInTheDocument(),
    )
  })

  it('sin empresa.accesos, el tab "Accesos" no se lista', () => {
    renderAt('/empresa', (key) => key !== 'empresa.accesos')
    expect(screen.queryByRole('button', { name: 'Accesos' })).not.toBeInTheDocument()
  })

  it('sin empresa.permisos, el tab "Permisos" no se lista', () => {
    renderAt('/empresa', (key) => key !== 'empresa.permisos')
    expect(screen.queryByRole('button', { name: 'Permisos' })).not.toBeInTheDocument()
  })
})
