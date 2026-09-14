/**
 * Verifica el corte por mes de fetchPermissionsByMonth y el early-return con userIds
 * vacío (mismo criterio que fetchVacationsInRange/fetchVacationsByYear en lib/vacations.js).
 */
import { vi } from 'vitest'

const fromMock = vi.fn()
const selectMock = vi.fn()
const inMock = vi.fn()
const lteMock = vi.fn()
const gteMock = vi.fn()
const orderMock = vi.fn().mockResolvedValue({ data: [{ id: 'r1' }], error: null })

vi.mock('../supabase', () => ({
  supabase: { from: (...a) => fromMock(...a) },
}))

import { fetchPermissionsByMonth } from '../lib/employeePermissions'

beforeEach(() => {
  fromMock.mockReset()
  selectMock.mockReset()
  inMock.mockReset()
  lteMock.mockReset()
  gteMock.mockReset()
  orderMock.mockClear()
  const chain = {
    in: (...a) => {
      inMock(...a)
      return chain
    },
    lte: (...a) => {
      lteMock(...a)
      return chain
    },
    gte: (...a) => {
      gteMock(...a)
      return chain
    },
    order: orderMock,
  }
  selectMock.mockReturnValue(chain)
  fromMock.mockReturnValue({ select: selectMock })
})

describe('fetchPermissionsByMonth', () => {
  it('con userIds vacío no golpea la red', async () => {
    const result = await fetchPermissionsByMonth([], 2026, 9)
    expect(result).toEqual([])
    expect(fromMock).not.toHaveBeenCalled()
  })

  it('con userIds no vacío, corta por los bordes del mes', async () => {
    await fetchPermissionsByMonth(['u1', 'u2'], 2026, 9)
    expect(fromMock).toHaveBeenCalledWith('employee_permissions')
    expect(inMock).toHaveBeenCalledWith('user_id', ['u1', 'u2'])
    expect(lteMock).toHaveBeenCalledWith('start_date', '2026-09-30')
    expect(gteMock).toHaveBeenCalledWith('end_date', '2026-09-01')
  })

  it('usa el último día real del mes (febrero de un año bisiesto)', async () => {
    await fetchPermissionsByMonth(['u1'], 2028, 2)
    expect(lteMock).toHaveBeenCalledWith('start_date', '2028-02-29')
  })

  it('devuelve las filas recibidas', async () => {
    const result = await fetchPermissionsByMonth(['u1'], 2026, 9)
    expect(result).toEqual([{ id: 'r1' }])
  })
})
