/**
 * Verifica que loadLines() excluya por defecto las líneas ocultas "Independientes"
 * (is_general=true) y "Alta Gerencia" (is_management=true) para no afectar a
 * Métricas/Ads/Home/Clientes, y que solo las incluya cuando el llamador pasa
 * explícitamente { includeGeneral: true } / { includeManagement: true } (Tareas).
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
    eq: (...a) => {
      eqMock(...a)
      return chain
    },
    order: orderMock,
  }
  selectMock.mockReturnValue(chain)
})

describe('loadLines', () => {
  it('por defecto excluye la línea general y la de Alta Gerencia (is_general=false, is_management=false)', async () => {
    await loadLines('co-1')
    expect(eqMock).toHaveBeenCalledWith('company_id', 'co-1')
    expect(eqMock).toHaveBeenCalledWith('is_general', false)
    expect(eqMock).toHaveBeenCalledWith('is_management', false)
  })

  it('con includeGeneral:true no filtra por is_general, pero sigue excluyendo is_management', async () => {
    await loadLines('co-1', { includeGeneral: true })
    expect(eqMock).toHaveBeenCalledWith('company_id', 'co-1')
    expect(eqMock).not.toHaveBeenCalledWith('is_general', false)
    expect(eqMock).toHaveBeenCalledWith('is_management', false)
  })

  it('con includeManagement:true no filtra por is_management, pero sigue excluyendo is_general', async () => {
    await loadLines('co-1', { includeManagement: true })
    expect(eqMock).toHaveBeenCalledWith('company_id', 'co-1')
    expect(eqMock).toHaveBeenCalledWith('is_general', false)
    expect(eqMock).not.toHaveBeenCalledWith('is_management', false)
  })

  it('con includeGeneral:true e includeManagement:true no filtra por ninguno de los dos', async () => {
    await loadLines('co-1', { includeGeneral: true, includeManagement: true })
    expect(eqMock).toHaveBeenCalledWith('company_id', 'co-1')
    expect(eqMock).not.toHaveBeenCalledWith('is_general', false)
    expect(eqMock).not.toHaveBeenCalledWith('is_management', false)
  })
})
