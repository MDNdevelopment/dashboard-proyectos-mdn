/**
 * Verifica que loadClients() pida los clientes ordenados alfabéticamente por nombre
 * (y no por fecha de creación), para que todos los selects/pickers de cliente que
 * consumen esta función queden en orden alfabético sin lógica extra en cada componente.
 */
import { vi } from 'vitest'

const orderMock = vi.fn().mockResolvedValue({ data: [], error: null })
const isMock = vi.fn().mockReturnValue({ order: orderMock })
const eqMock = vi.fn()
const selectMock = vi.fn()

vi.mock('../supabase', () => ({
  supabase: {
    from: vi.fn(() => ({ select: selectMock })),
  },
}))

import { loadClients } from '../components/metricas/metricsApi'

beforeEach(() => {
  orderMock.mockClear()
  isMock.mockClear()
  eqMock.mockReset()
  selectMock.mockReset()
  // select().eq() encadenable; eq() devuelve un objeto que también tiene eq/is/order
  const chain = {
    eq: (...a) => { eqMock(...a); return chain },
    is: (...a) => { isMock(...a); return chain },
    order: orderMock,
  }
  selectMock.mockReturnValue(chain)
})

describe('loadClients', () => {
  it('ordena por "name" (alfabético), no por "created_at"', async () => {
    await loadClients('co-1')
    expect(orderMock).toHaveBeenCalledWith('name')
    expect(orderMock).not.toHaveBeenCalledWith('created_at')
  })
})
