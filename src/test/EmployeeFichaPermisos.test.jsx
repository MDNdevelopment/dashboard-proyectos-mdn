/**
 * El bloque de historial de "Permisos" (RRHH) en la ficha del empleado
 * (EmployeeFichaContent.jsx) se gatea con can('empresa.permisos'): aparece cuando el
 * viewer tiene la capacidad y hay registros, y no aparece sin ella (evita que alguien
 * sin permiso reciba un bloque vacío indistinguible de "sin registros").
 */
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { vi } from 'vitest'
import { createSupabaseMock } from './helpers/supabaseMock'

vi.mock('../supabase', () => ({
  supabase: createSupabaseMock({
    tables: {
      employee_permissions: [
        {
          id: 'p-1',
          user_id: 'u-1',
          type: 'permiso',
          start_date: '2026-03-01',
          end_date: '2026-03-01',
          reason: null,
        },
      ],
    },
  }),
}))

vi.mock('../context/AuthContext', () => ({
  useAuth: vi.fn(),
}))

import { useAuth } from '../context/AuthContext'
import EmployeeFichaContent from '../components/metricas/EmployeeFichaContent'

const EMPLOYEE = {
  user_id: 'u-1',
  first_name: 'Ana',
  last_name: 'Pérez',
  access_level: 2,
  department: { department_name: 'Diseño' },
}

function renderFicha(can) {
  useAuth.mockReturnValue({
    userProfile: { user_id: 'u-viewer', access_level: 4, admin: false },
    can,
  })
  return render(
    <MemoryRouter>
      <EmployeeFichaContent employee={EMPLOYEE} line={null} onClose={() => {}} />
    </MemoryRouter>,
  )
}

describe('EmployeeFichaContent — bloque de Permisos (RRHH)', () => {
  it('aparece con empresa.permisos y muestra el registro', async () => {
    renderFicha(() => true)
    await waitFor(() => expect(screen.getByText('Permisos')).toBeInTheDocument())
    expect(screen.getByText(/01\/03\/2026/)).toBeInTheDocument()
  })

  it('no aparece sin la capacidad empresa.permisos', () => {
    renderFicha((key) => key !== 'empresa.permisos')
    expect(screen.queryByText('Permisos')).not.toBeInTheDocument()
  })
})
