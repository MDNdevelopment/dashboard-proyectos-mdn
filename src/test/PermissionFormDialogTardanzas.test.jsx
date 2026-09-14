/**
 * Verifica el formulario de llegada tarde / salida temprana en PermissionFormDialog:
 * un solo campo de fecha + hora (no rango), y que se envíe `eventTime` a createPermission
 * con `endDate === startDate`.
 */
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi } from 'vitest'

const mockCreatePermission = vi.fn().mockResolvedValue({ id: 'p-1' })
const mockFetchPermissionsForEmployee = vi.fn().mockResolvedValue([])

vi.mock('../lib/employeePermissions', () => ({
  fetchPermissionsForEmployee: (...a) => mockFetchPermissionsForEmployee(...a),
  createPermission: (...a) => mockCreatePermission(...a),
}))

vi.mock('../context/AuthContext', () => ({
  useAuth: () => ({ userProfile: { user_id: 'u-viewer' } }),
}))

import PermissionFormDialog from '../components/empresa/PermissionFormDialog'

const EMPLOYEES = [{ user_id: 'u-1', first_name: 'Ana', last_name: 'Pérez' }]

describe('PermissionFormDialog — llegada tarde / salida temprana', () => {
  beforeEach(() => {
    mockCreatePermission.mockClear()
    mockFetchPermissionsForEmployee.mockClear()
  })

  it('muestra un campo de Hora en vez de "Fin" al elegir Llegada tarde, y guarda con endDate=startDate', async () => {
    const user = userEvent.setup()
    render(
      <PermissionFormDialog
        employees={EMPLOYEES}
        companyId="co-1"
        fixedEmployee={EMPLOYEES[0]}
        canManage
        onClose={() => {}}
        onChange={() => {}}
      />,
    )

    await user.click(screen.getByRole('button', { name: '+ Nuevo' }))
    await user.selectOptions(screen.getByDisplayValue('Permiso'), 'llegada_tarde')

    expect(screen.getByText('Hora *')).toBeInTheDocument()
    expect(screen.queryByText('Fin *')).not.toBeInTheDocument()

    const dateInputs = screen.getAllByPlaceholderText('dd/mm/aaaa')
    await user.type(dateInputs[0], '15/09/2026')
    await user.type(screen.getByLabelText('Hora *'), '09:45')

    await user.click(screen.getByRole('button', { name: 'Registrar' }))

    await waitFor(() => expect(mockCreatePermission).toHaveBeenCalled())
    const call = mockCreatePermission.mock.calls[0][0]
    expect(call).toMatchObject({
      type: 'llegada_tarde',
      startDate: '2026-09-15',
      endDate: '2026-09-15',
      eventTime: '09:45',
    })
  })

  it('exige la hora para llegada tarde', async () => {
    const user = userEvent.setup()
    render(
      <PermissionFormDialog
        employees={EMPLOYEES}
        companyId="co-1"
        fixedEmployee={EMPLOYEES[0]}
        canManage
        onClose={() => {}}
        onChange={() => {}}
      />,
    )
    await user.click(screen.getByRole('button', { name: '+ Nuevo' }))
    await user.selectOptions(screen.getByDisplayValue('Permiso'), 'llegada_tarde')
    const dateInputs = screen.getAllByPlaceholderText('dd/mm/aaaa')
    await user.type(dateInputs[0], '15/09/2026')
    await user.click(screen.getByRole('button', { name: 'Registrar' }))
    expect(await screen.findByText('La hora es obligatoria')).toBeInTheDocument()
    expect(mockCreatePermission).not.toHaveBeenCalled()
  })
})
