/**
 * countPiezasForLine (Reportes → Operaciones, «6. Nº Piezas vs Piezas editadas»): desde nov-2026
 * «editadas» es lo que estaba editado el último día del mes (RPC av_lotes_listas_a_fecha).
 */
import { vi } from 'vitest'

const { state, mockRpc } = vi.hoisted(() => ({
  state: { pautas: [], cnp: [], pautasError: null, calls: [] },
  mockRpc: vi.fn(),
}))

// Cadena de supabase-js: todo devuelve la cadena y `.lt()` (último paso en ambas consultas) resuelve.
function chain(table) {
  const c = {}
  const rec = (name) =>
    vi.fn((...args) => {
      state.calls.push({ table, name, args })
      return name === 'lt' ? Promise.resolve(result(table)) : c
    })
  ;['select', 'eq', 'is', 'gte', 'lt'].forEach((m) => {
    c[m] = rec(m)
  })
  return c
}
function result(table) {
  if (table === 'av_pautas') return { data: state.pautas, error: state.pautasError }
  return { data: state.cnp, error: null }
}

vi.mock('../supabase', () => ({
  supabase: { from: vi.fn((t) => chain(t)), rpc: mockRpc },
}))

import { countPiezasForLine } from '../components/pautas/avPautasApi'

const pauta = (id, pauta_date, V = [4, 4], R = null, over = {}) => ({
  id,
  pauta_date,
  deleted_at: null,
  status: 'realizada',
  formats: R ? ['V', 'R'] : ['V'],
  piezas_por_formato: {
    V: { salieron: V[0], editadas: V[1] },
    ...(R ? { R: { salieron: R[0], editadas: R[1] } } : {}),
  },
  ...over,
})
const lote = (pauta_id, formato, listas, n = 1) => ({
  pieza_id: `${pauta_id}-${formato}-${n}`,
  pauta_id,
  formato,
  listas,
})
const callsOf = (table, name) =>
  state.calls.filter((c) => c.table === table && c.name === name).map((c) => c.args)

describe('countPiezasForLine', () => {
  beforeEach(() => {
    state.pautas = []
    state.cnp = []
    state.pautasError = null
    state.calls = []
    mockRpc.mockReset()
    mockRpc.mockResolvedValue({ data: [], error: null })
  })

  describe('antes de noviembre 2026 (sin cambios)', () => {
    it('usa el contador vivo y no llama a la RPC', async () => {
      state.pautas = [pauta('p1', '2026-10-05', [10, 9])]
      const r = await countPiezasForLine('co', 'l1', { month: 10, year: 2026 })
      expect(mockRpc).not.toHaveBeenCalled()
      expect(r.piezas).toBe(10)
      expect(r.editadas).toBe(9)
      expect(r.pendientesPrevios).toBeNull()
      expect(r.error).toBeNull()
    })

    it('el límite inferior es el inicio del propio mes', async () => {
      await countPiezasForLine('co', 'l1', { month: 10, year: 2026 })
      expect(callsOf('av_pautas', 'gte')[0]).toEqual(['pauta_date', '2026-10-01'])
      expect(callsOf('av_pautas', 'lt')[0]).toEqual(['pauta_date', '2026-11-01'])
    })

    it('las pautas de la Papelera siguen contando (no se altera el pasado)', async () => {
      state.pautas = [
        pauta('p1', '2026-10-05', [4, 4], null, { deleted_at: '2026-10-20T00:00:00Z' }),
      ]
      const r = await countPiezasForLine('co', 'l1', { month: 10, year: 2026 })
      expect(r.piezas).toBe(4)
    })
  })

  describe('noviembre 2026 en adelante', () => {
    it('toma lo editado al último día del mes, no el contador vivo', async () => {
      // Hoy el contador dice 4/4, pero el 30-nov solo había 1 lista.
      state.pautas = [pauta('p1', '2026-11-05', [4, 4])]
      mockRpc.mockResolvedValue({ data: [lote('p1', 'V', 1)], error: null })

      const r = await countPiezasForLine('co', 'l1', { month: 11, year: 2026 })

      expect(mockRpc).toHaveBeenCalledWith('av_lotes_listas_a_fecha', {
        p_pauta_ids: ['p1'],
        p_fecha: '2026-11-30',
      })
      expect(r.piezas).toBe(4)
      expect(r.editadas).toBe(1)
    })

    it('el desglose Video 4K / Reel también va a la fecha de fin de mes', async () => {
      state.pautas = [pauta('p1', '2026-11-05', [4, 4], [3, 3])]
      mockRpc.mockResolvedValue({ data: [lote('p1', 'V', 2), lote('p1', 'R', 3)], error: null })
      const r = await countPiezasForLine('co', 'l1', { month: 11, year: 2026 })
      expect(r.porGrupo.video4k).toEqual({ piezas: 4, editadas: 2 })
      expect(r.porGrupo.reel).toEqual({ piezas: 3, editadas: 3 })
    })

    it('no deja editadas por encima de lo que salió', async () => {
      state.pautas = [pauta('p1', '2026-11-05', [2, 2])]
      mockRpc.mockResolvedValue({ data: [lote('p1', 'V', 9)], error: null })
      const r = await countPiezasForLine('co', 'l1', { month: 11, year: 2026 })
      expect(r.editadas).toBe(2)
    })

    it('un lote que no existía al fin de mes (no aparece en la RPC) cuenta 0', async () => {
      state.pautas = [pauta('p1', '2026-11-28', [3, 3])]
      mockRpc.mockResolvedValue({ data: [], error: null })
      const r = await countPiezasForLine('co', 'l1', { month: 11, year: 2026 })
      expect(r.piezas).toBe(3)
      expect(r.editadas).toBe(0)
    })

    it('excluye las pautas de la Papelera y no las manda a la RPC', async () => {
      state.pautas = [
        pauta('p1', '2026-11-05', [4, 4]),
        pauta('p2', '2026-11-06', [9, 9], null, { deleted_at: '2026-11-10T00:00:00Z' }),
      ]
      mockRpc.mockResolvedValue({ data: [lote('p1', 'V', 4)], error: null })
      const r = await countPiezasForLine('co', 'l1', { month: 11, year: 2026 })
      expect(r.piezas).toBe(4)
      expect(mockRpc.mock.calls[0][1].p_pauta_ids).toEqual(['p1'])
    })

    it('en noviembre no hay pendientes previos (es el primer mes de la regla)', async () => {
      state.pautas = [pauta('p1', '2026-11-05', [4, 2])]
      mockRpc.mockResolvedValue({ data: [lote('p1', 'V', 2)], error: null })
      const r = await countPiezasForLine('co', 'l1', { month: 11, year: 2026 })
      expect(r.pendientesPrevios).toEqual({ piezas: 0, editadas: 0, pendientes: 0 })
    })

    it('sin pautas no llama a la RPC', async () => {
      const r = await countPiezasForLine('co', 'l1', { month: 11, year: 2026 })
      expect(mockRpc).not.toHaveBeenCalled()
      expect(r).toMatchObject({ piezas: 0, editadas: 0, error: null })
    })
  })

  describe('pendientes de meses anteriores (desde diciembre)', () => {
    it('baja el límite inferior al 1-nov para traer las pautas previas', async () => {
      await countPiezasForLine('co', 'l1', { month: 12, year: 2026 })
      expect(callsOf('av_pautas', 'gte')[0]).toEqual(['pauta_date', '2026-11-01'])
      expect(callsOf('av_pautas', 'lt')[0]).toEqual(['pauta_date', '2027-01-01'])
    })

    it('el mes cuenta solo lo grabado en él; lo previo sin editar va aparte', async () => {
      state.pautas = [
        pauta('nov', '2026-11-20', [5, 5]), // previa: salieron 5
        pauta('dic', '2026-12-03', [4, 4]), // del mes
      ]
      // Al 31-dic: de la de noviembre solo hay 2 listas; de la de diciembre, 3.
      mockRpc.mockResolvedValue({ data: [lote('nov', 'V', 2), lote('dic', 'V', 3)], error: null })

      const r = await countPiezasForLine('co', 'l1', { month: 12, year: 2026 })

      expect(mockRpc).toHaveBeenCalledTimes(1)
      expect(mockRpc.mock.calls[0][1].p_fecha).toBe('2026-12-31')
      // Lo de noviembre NO se suma al mes de diciembre.
      expect(r.piezas).toBe(4)
      expect(r.editadas).toBe(3)
      expect(r.pendientesPrevios).toEqual({ piezas: 5, editadas: 2, pendientes: 3 })
    })

    it('los pendientes previos no afectan piezas ni editadas del mes (no puntúan)', async () => {
      state.pautas = [pauta('nov', '2026-11-20', [5, 0]), pauta('dic', '2026-12-03', [4, 4])]
      mockRpc.mockResolvedValue({ data: [lote('dic', 'V', 4)], error: null })
      const r = await countPiezasForLine('co', 'l1', { month: 12, year: 2026 })
      expect({ piezas: r.piezas, editadas: r.editadas }).toEqual({ piezas: 4, editadas: 4 })
      expect(r.pendientesPrevios.pendientes).toBe(5)
    })

    it('un reel de noviembre editado en diciembre baja el pendiente de diciembre, no cambia noviembre', async () => {
      state.pautas = [pauta('nov', '2026-11-20', [3, 3])]
      // Al 31-dic ya estaban las 3 listas.
      mockRpc.mockResolvedValue({ data: [lote('nov', 'V', 3)], error: null })
      const r = await countPiezasForLine('co', 'l1', { month: 12, year: 2026 })
      expect(r.pendientesPrevios.pendientes).toBe(0)
    })

    it('enero 2027 cruza el año: fecha 2027-01-31 y trae desde 2026-11-01', async () => {
      state.pautas = [pauta('nov', '2026-11-20', [2, 2])]
      await countPiezasForLine('co', 'l1', { month: 1, year: 2027 })
      expect(callsOf('av_pautas', 'gte')[0]).toEqual(['pauta_date', '2026-11-01'])
      expect(callsOf('av_pautas', 'lt')[0]).toEqual(['pauta_date', '2027-02-01'])
      expect(mockRpc.mock.calls[0][1].p_fecha).toBe('2027-01-31')
    })
  })

  describe('errores', () => {
    it('si la RPC falla, devuelve el error y ceros (no cae al contador vivo)', async () => {
      state.pautas = [pauta('p1', '2026-11-05', [4, 4])]
      mockRpc.mockResolvedValue({ data: null, error: { message: 'boom' } })
      const r = await countPiezasForLine('co', 'l1', { month: 11, year: 2026 })
      expect(r.error).toEqual({ message: 'boom' })
      expect(r.piezas).toBe(0)
      expect(r.editadas).toBe(0)
      expect(r.pendientesPrevios).toBeNull()
    })

    it('si falla la consulta de pautas, devuelve el error sin llamar a la RPC', async () => {
      state.pautasError = { message: 'rls' }
      const r = await countPiezasForLine('co', 'l1', { month: 11, year: 2026 })
      expect(r.error).toEqual({ message: 'rls' })
      expect(mockRpc).not.toHaveBeenCalled()
    })
  })

  it('el CNP de audiovisual se acota al mes (no al rango ampliado de las pautas previas)', async () => {
    await countPiezasForLine('co', 'l1', { month: 12, year: 2026 })
    expect(callsOf('cnp_requests', 'gte')[0]).toEqual(['created_at', '2026-12-01'])
    expect(callsOf('cnp_requests', 'lt')[0]).toEqual(['created_at', '2027-01-01'])
  })
})
