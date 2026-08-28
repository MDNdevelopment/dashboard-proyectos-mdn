import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi } from 'vitest'

// Captura del payload de update para verificar que on_probation viaja.
const updateSpy = vi.fn()

vi.mock('../supabase', () => ({
  supabase: {
    from: vi.fn(() => ({
      update: (payload) => {
        updateSpy(payload)
        return {
          eq: () => ({
            select: () => ({
              single: () => Promise.resolve({ data: { user_id: 'u1', ...payload }, error: null }),
            }),
          }),
        }
      },
    })),
  },
}))

vi.mock('../context/AuthContext', () => ({
  useAuth: () => ({
    userProfile: { user_id: 'u-admin', company_id: 'co-1', access_level: 4, admin: true },
    can: () => true,
  }),
}))

// AvatarUpload usa storage de supabase; lo sustituimos por un stub.
vi.mock('../components/empresa/AvatarUpload', () => ({
  default: () => null,
}))

import EmployeeModal from '../components/empresa/EmployeeModal'

const DEPARTMENTS = [{ department_id: 'd1', department_name: 'Diseño' }]
const POSITIONS = [{ position_id: 'p1', position_name: 'Diseñador', department_id: 'd1' }]
const EMPLOYEE = {
  user_id: 'u1',
  first_name: 'Luisa',
  last_name: 'Ramírez',
  department_id: 'd1',
  position_id: 'p1',
  access_level: 1,
  admin: false,
  on_probation: false,
}

describe('EmployeeModal — período de prueba', () => {
  beforeEach(() => updateSpy.mockClear())

  it('al activar "En período de prueba" y guardar, on_probation viaja en el update', async () => {
    const user = userEvent.setup()
    render(
      <EmployeeModal
        employee={EMPLOYEE}
        departments={DEPARTMENTS}
        positions={POSITIONS}
        onClose={() => {}}
        onSaved={() => {}}
      />,
    )

    await user.click(screen.getByRole('switch', { name: 'En período de prueba' }))
    await user.click(screen.getByRole('button', { name: 'Guardar cambios' }))

    await waitFor(() => expect(updateSpy).toHaveBeenCalled())
    expect(updateSpy.mock.calls[0][0]).toMatchObject({ on_probation: true })
  })

  it('un empleado ya en prueba se puede pasar a fijo (on_probation: false)', async () => {
    const user = userEvent.setup()
    render(
      <EmployeeModal
        employee={{ ...EMPLOYEE, on_probation: true }}
        departments={DEPARTMENTS}
        positions={POSITIONS}
        onClose={() => {}}
        onSaved={() => {}}
      />,
    )

    await user.click(screen.getByRole('switch', { name: 'En período de prueba' }))
    await user.click(screen.getByRole('button', { name: 'Guardar cambios' }))

    await waitFor(() => expect(updateSpy).toHaveBeenCalled())
    expect(updateSpy.mock.calls[0][0]).toMatchObject({ on_probation: false })
  })
})
