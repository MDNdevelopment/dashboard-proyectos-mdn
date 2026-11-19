/**
 * useListasFinDeMes (Audiovisual → Datos): lotes con `listas` como estaban el último día de un mes
 * ya terminado, desde nov-2026. El mes en curso y los anteriores a noviembre no se consultan.
 */
import { renderHook, waitFor } from '@testing-library/react'
import { vi } from 'vitest'

const { mockLoad } = vi.hoisted(() => ({ mockLoad: vi.fn() }))
vi.mock('../components/pautas/avPautasApi', () => ({
  loadLotesListasAFecha: (...a) => mockLoad(...a),
}))

import { useListasFinDeMes, mesesACongelar, ymKey } from '../hooks/useListasFinDeMes'

const pauta = (id, pauta_date, over = {}) => ({ id, pauta_date, deleted_at: null, ...over })
const fila = (pauta_id, listas) => ({
  pieza_id: `${pauta_id}-l`,
  pauta_id,
  formato: 'V',
  listas,
})

describe('ymKey', () => {
  it('arma YYYY-MM con cero a la izquierda', () => {
    expect(ymKey(2026, 3)).toBe('2026-03')
    expect(ymKey(2026, 12)).toBe('2026-12')
  })
})

describe('mesesACongelar', () => {
  const pautas = [
    pauta('nov1', '2026-11-05'),
    pauta('nov2', '2026-11-20'),
    pauta('dic1', '2026-12-02'),
    pauta('oct1', '2026-10-30'),
  ]

  it('con el mes mostrado terminado, congela ese mes y el anterior si también rige', () => {
    const t = mesesACongelar(pautas, 2026, 12, '2027-01-10')
    expect(t.map((x) => x.key)).toEqual(['2026-12', '2026-11'])
    expect(t[0].fecha).toBe('2026-12-31')
    expect(t[1].fecha).toBe('2026-11-30')
  })

  it('manda solo las pautas de cada mes, ordenadas y sin las de la Papelera', () => {
    const conPapelera = [...pautas, pauta('nov3', '2026-11-25', { deleted_at: '2026-11-26' })]
    const t = mesesACongelar(conPapelera, 2026, 12, '2027-01-10')
    expect(t[1].ids).toEqual(['nov1', 'nov2'])
    expect(t[0].ids).toEqual(['dic1'])
  })

  it('el mes en curso NO se consulta (su valor vivo ya es el de hoy)', () => {
    const t = mesesACongelar(pautas, 2026, 12, '2026-12-15')
    expect(t.map((x) => x.key)).toEqual(['2026-11'])
  })

  it('el último día del mes todavía cuenta como mes en curso', () => {
    expect(mesesACongelar(pautas, 2026, 11, '2026-11-30').map((x) => x.key)).toEqual([])
    expect(mesesACongelar(pautas, 2026, 11, '2026-12-01').map((x) => x.key)).toEqual(['2026-11'])
  })

  it('antes de noviembre 2026 no consulta nada, ni siquiera el mes anterior a noviembre', () => {
    expect(mesesACongelar(pautas, 2026, 10, '2027-01-10')).toEqual([])
    // Viendo noviembre, octubre (el anterior) queda fuera de la regla.
    expect(mesesACongelar(pautas, 2026, 11, '2027-01-10').map((x) => x.key)).toEqual(['2026-11'])
  })

  it('enero cruza el año: el mes anterior es diciembre del año previo', () => {
    const t = mesesACongelar(pautas, 2027, 1, '2027-03-01')
    expect(t.map((x) => x.key)).toEqual(['2027-01', '2026-12'])
  })

  it('tolera pautas nulas o sin fecha', () => {
    expect(mesesACongelar(null, 2026, 12, '2027-01-10')[0].ids).toEqual([])
    expect(mesesACongelar([pauta('x', null)], 2026, 12, '2027-01-10')[0].ids).toEqual([])
  })
})

describe('useListasFinDeMes', () => {
  beforeEach(() => {
    mockLoad.mockReset()
    vi.useFakeTimers({ shouldAdvanceTime: true })
    vi.setSystemTime(new Date('2027-01-10T12:00:00'))
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  const pautas = [pauta('nov1', '2026-11-05'), pauta('dic1', '2026-12-02')]

  it('pide cada mes a su último día y devuelve las filas por mes', async () => {
    mockLoad.mockImplementation(async (ids, fecha) => ({
      data: ids.map((id) => fila(id, fecha === '2026-11-30' ? 1 : 3)),
      error: null,
    }))

    const { result } = renderHook(() => useListasFinDeMes({ pautas, year: 2026, month: 12 }))

    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(mockLoad).toHaveBeenCalledWith(['nov1'], '2026-11-30')
    expect(mockLoad).toHaveBeenCalledWith(['dic1'], '2026-12-31')
    expect(result.current.rowsByMonth['2026-11'][0].listas).toBe(1)
    expect(result.current.rowsByMonth['2026-12'][0].listas).toBe(3)
    expect(result.current.error).toBeNull()
  })

  it('mientras carga no devuelve filas y marca loading', () => {
    mockLoad.mockReturnValue(new Promise(() => {}))
    const { result } = renderHook(() => useListasFinDeMes({ pautas, year: 2026, month: 12 }))
    expect(result.current.loading).toBe(true)
    expect(result.current.rowsByMonth).toEqual({})
  })

  it('si una consulta falla, devuelve el error y ninguna fila (cae al valor vivo)', async () => {
    mockLoad.mockImplementation(async (_ids, fecha) =>
      fecha === '2026-12-31'
        ? { data: null, error: { message: 'boom' } }
        : { data: [fila('nov1', 1)], error: null },
    )
    const { result } = renderHook(() => useListasFinDeMes({ pautas, year: 2026, month: 12 }))
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.error).toEqual({ message: 'boom' })
    expect(result.current.rowsByMonth).toEqual({})
  })

  it('sin meses que congelar no consulta ni queda cargando', async () => {
    const { result } = renderHook(() => useListasFinDeMes({ pautas, year: 2026, month: 10 }))
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(mockLoad).not.toHaveBeenCalled()
    expect(result.current.rowsByMonth).toEqual({})
  })

  it('un render con las mismas pautas en otro arreglo no vuelve a consultar', async () => {
    mockLoad.mockResolvedValue({ data: [], error: null })
    const { result, rerender } = renderHook(
      ({ list }) => useListasFinDeMes({ pautas: list, year: 2026, month: 12 }),
      { initialProps: { list: pautas } },
    )
    await waitFor(() => expect(result.current.loading).toBe(false))
    const llamadas = mockLoad.mock.calls.length
    rerender({ list: [...pautas] })
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(mockLoad.mock.calls.length).toBe(llamadas)
  })

  it('si cambia el conjunto de pautas del mes, vuelve a consultar', async () => {
    mockLoad.mockResolvedValue({ data: [], error: null })
    const { result, rerender } = renderHook(
      ({ list }) => useListasFinDeMes({ pautas: list, year: 2026, month: 12 }),
      { initialProps: { list: pautas } },
    )
    await waitFor(() => expect(result.current.loading).toBe(false))
    const antes = mockLoad.mock.calls.length
    rerender({ list: [...pautas, pauta('dic2', '2026-12-09')] })
    await waitFor(() => expect(mockLoad.mock.calls.length).toBeGreaterThan(antes))
    expect(mockLoad).toHaveBeenCalledWith(['dic1', 'dic2'], '2026-12-31')
  })

  it('descarta la respuesta de una consulta vieja si ya cambió el mes mostrado', async () => {
    let resolverViejo
    mockLoad.mockImplementation((ids, fecha) =>
      fecha === '2026-12-31'
        ? new Promise((res) => {
            resolverViejo = () => res({ data: [fila('dic1', 9)], error: null })
          })
        : Promise.resolve({ data: [fila('nov1', 1)], error: null }),
    )
    const { result, rerender } = renderHook(
      ({ month }) => useListasFinDeMes({ pautas, year: 2026, month }),
      { initialProps: { month: 12 } },
    )
    // Antes de que responda diciembre, el usuario pasa a noviembre.
    rerender({ month: 11 })
    await waitFor(() => expect(result.current.loading).toBe(false))
    resolverViejo?.()
    await Promise.resolve()
    expect(result.current.rowsByMonth['2026-12']).toBeUndefined()
    expect(result.current.rowsByMonth['2026-11']).toBeDefined()
  })
})
