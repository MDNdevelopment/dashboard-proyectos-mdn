/**
 * Verifica que loadLines() excluya por defecto la línea oculta "Independientes"
 * (is_general=true) para no afectar a Métricas/Ads/Home/Clientes, y que solo la
 * incluya cuando el llamador pasa explícitamente { includeGeneral: true } (Tareas).
 */
import { vi } from 'vitest'

const orderMock = vi.fn().mockResolvedValue({ data: [], error: null })
const eqMock = vi.fn()
const selectMock = vi.fn()

vi.mock('../supabase', () => ({
  supabase: {
    from: vi.fn(() => ({ select: selectMock })),
  },
}))

import { loadLines } from '../components/metricas/metricsApi'

beforeEach(() => {
  orderMock.mockClear()
  eqMock.mockReset()
  selectMock.mockReset()
  // select().eq(...).eq(...).order() encadenable
  const chain = {
    eq: (...a) => { eqMock(...a); return chain },
    order: orderMock,
  }
  selectMock.mockReturnValue(chain)
})

describe('loadLines', () => {
  it('por defecto excluye la línea general (is_general=false)', async () => {
    await loadLines('co-1')
    expect(eqMock).toHaveBeenCalledWith('company_id', 'co-1')
    expect(eqMock).toHaveBeenCalledWith('is_general', false)
  })

  it('con includeGeneral:true no filtra por is_general', async () => {
    await loadLines('co-1', { includeGeneral: true })
    expect(eqMock).toHaveBeenCalledWith('company_id', 'co-1')
    expect(eqMock).not.toHaveBeenCalledWith('is_general', false)
  })
})
