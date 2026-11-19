/**
 * metricsApi — protección de reportes cerrados: unlockReport (RPC de admin), deleteLine,
 * importMetrics y cleanupClientAfterContractEnd.
 */
import { vi } from 'vitest'

const { state, mockRpc } = vi.hoisted(() => ({
  state: { chains: [], resolve: () => ({ data: null, error: null }) },
  mockRpc: vi.fn(),
}))

// Cadena de supabase-js: todo devuelve la cadena y al hacer await resuelve lo que diga `state.resolve`.
function makeChain(table) {
  const ops = []
  const c = {}
  ;['select', 'eq', 'not', 'is', 'in', 'update', 'delete', 'upsert', 'insert', 'order'].forEach(
    (m) => {
      c[m] = vi.fn((...args) => {
        ops.push([m, ...args])
        return c
      })
    },
  )
  c.then = (res, rej) => Promise.resolve(state.resolve(table, ops)).then(res, rej)
  state.chains.push({ table, ops })
  return c
}

vi.mock('../supabase', () => ({
  supabase: { from: vi.fn((t) => makeChain(t)), rpc: (...a) => mockRpc(...a) },
}))

import {
  unlockReport,
  deleteLine,
  importMetrics,
  cleanupClientAfterContractEnd,
} from '../components/metricas/metricsApi'

const hasOp = (ops, name, ...args) =>
  ops.some(
    (o) => o[0] === name && args.every((a, i) => JSON.stringify(o[i + 1]) === JSON.stringify(a)),
  )
const chainsOf = (table, op) =>
  state.chains.filter((c) => c.table === table && c.ops.some((o) => o[0] === op))

beforeEach(() => {
  state.chains = []
  state.resolve = () => ({ data: null, error: null })
  mockRpc.mockReset()
})

describe('unlockReport', () => {
  it('llama a la RPC unlock_metric_report con la línea, el período y el motivo', async () => {
    const fila = { id: 'r1', closed_at: null, reopened_at: '2026-11-19T12:00:00Z' }
    mockRpc.mockResolvedValue({ data: fila, error: null })

    const res = await unlockReport('l-1', 2026, 10, 'Corregir un dato manual')

    expect(mockRpc).toHaveBeenCalledWith('unlock_metric_report', {
      p_line_id: 'l-1',
      p_year: 2026,
      p_month: 10,
      p_reason: 'Corregir un dato manual',
    })
    expect(res).toEqual({ data: fila, error: null })
  })

  it('devuelve el error de la base tal cual (el mensaje ya viene en español)', async () => {
    mockRpc.mockResolvedValue({
      data: null,
      error: { message: 'Solo un administrador puede desbloquear un reporte cerrado' },
    })
    const { error } = await unlockReport('l-1', 2026, 10, 'Corregir un dato manual')
    expect(error.message).toMatch(/Solo un administrador/)
  })
})

describe('deleteLine', () => {
  it('sin reportes cerrados elimina la línea', async () => {
    state.resolve = (table, ops) =>
      table === 'metric_reports' ? { count: 0, error: null } : { data: null, error: null, ops }
    const res = await deleteLine('l-1')

    expect(res.error).toBeNull()
    expect(chainsOf('metric_lines', 'delete')).toHaveLength(1)
    expect(hasOp(chainsOf('metric_lines', 'delete')[0].ops, 'eq', 'id', 'l-1')).toBe(true)
  })

  it('cuenta solo los reportes CERRADOS de esa línea', async () => {
    state.resolve = () => ({ count: 0, error: null })
    await deleteLine('l-1')
    const { ops } = chainsOf('metric_reports', 'select')[0]
    expect(hasOp(ops, 'eq', 'line_id', 'l-1')).toBe(true)
    expect(hasOp(ops, 'not', 'closed_at', 'is', null)).toBe(true)
  })

  it('con un reporte cerrado NO elimina y lo explica en singular', async () => {
    state.resolve = () => ({ count: 1, error: null })
    const { error } = await deleteLine('l-1')
    expect(error.message).toBe(
      'No se puede eliminar la línea: tiene 1 reporte cerrado. Un administrador debe desbloquearlos antes.',
    )
    expect(chainsOf('metric_lines', 'delete')).toHaveLength(0)
  })

  it('con varios, en plural', async () => {
    state.resolve = () => ({ count: 6, error: null })
    const { error } = await deleteLine('l-1')
    expect(error.message).toMatch(/tiene 6 reportes cerrados/)
    expect(chainsOf('metric_lines', 'delete')).toHaveLength(0)
  })

  it('si falla la comprobación, devuelve el error y no elimina nada', async () => {
    state.resolve = () => ({ count: null, error: { message: 'rls' } })
    const { error } = await deleteLine('l-1')
    expect(error).toEqual({ message: 'rls' })
    expect(chainsOf('metric_lines', 'delete')).toHaveLength(0)
  })
})

describe('importMetrics', () => {
  const rep = (line_id, year, month, extra = {}) => ({
    line_id,
    year,
    month,
    data: { x: 1 },
    ...extra,
  })
  const payload = (reports) => ({ lines: [], clients: [], reports })
  const cerrados = (list) => (table, ops) => {
    if (table !== 'metric_reports') return { data: null, error: null }
    if (hasOp(ops, 'upsert')) return { data: null, error: null }
    return { data: list, error: null }
  }
  const upserted = () => {
    const c = chainsOf('metric_reports', 'upsert')[0]
    return c ? c.ops.find((o) => o[0] === 'upsert')[1] : null
  }

  it('rechaza un archivo con formato inválido', async () => {
    expect(await importMetrics('co', { lines: [] })).toEqual({
      error: 'Formato de archivo inválido.',
    })
  })

  it('omite los meses ya cerrados, importa el resto y cuenta los omitidos', async () => {
    state.resolve = cerrados([{ line_id: 'A', year: 2026, month: 10 }])
    const res = await importMetrics(
      'co',
      payload([rep('A', 2026, 10), rep('A', 2026, 11), rep('B', 2026, 10)]),
    )

    expect(res).toEqual({ success: true, omitidosCerrados: 1 })
    expect(upserted().map((r) => `${r.line_id}-${r.month}`)).toEqual(['A-11', 'B-10'])
  })

  it('un archivo no puede traer campos de cierre: se descartan', async () => {
    state.resolve = cerrados([])
    await importMetrics(
      'co',
      payload([
        rep('A', 2026, 11, {
          closed_at: '2026-01-01',
          closed_by: 'falso',
          closed_auto: true,
          reopened_at: '2026-01-02',
          reopened_by: 'falso',
        }),
      ]),
    )
    const [fila] = upserted()
    expect(fila).not.toHaveProperty('closed_at')
    expect(fila).not.toHaveProperty('closed_by')
    expect(fila).not.toHaveProperty('closed_auto')
    expect(fila).not.toHaveProperty('reopened_at')
    expect(fila).not.toHaveProperty('reopened_by')
    expect(fila).toMatchObject({
      line_id: 'A',
      year: 2026,
      month: 11,
      company_id: 'co',
      data: { x: 1 },
    })
  })

  it('si todos los reportes están cerrados no hace upsert y dice cuántos omitió', async () => {
    state.resolve = cerrados([
      { line_id: 'A', year: 2026, month: 10 },
      { line_id: 'B', year: 2026, month: 10 },
    ])
    const res = await importMetrics('co', payload([rep('A', 2026, 10), rep('B', 2026, 10)]))
    expect(res).toEqual({ success: true, omitidosCerrados: 2 })
    expect(upserted()).toBeNull()
  })

  it('sin reportes en el archivo no consulta cuáles están cerrados', async () => {
    const res = await importMetrics('co', payload([]))
    expect(res).toEqual({ success: true, omitidosCerrados: 0 })
    expect(state.chains.filter((c) => c.table === 'metric_reports')).toHaveLength(0)
  })

  it('la consulta de cerrados se acota a la empresa', async () => {
    state.resolve = cerrados([])
    await importMetrics('co-9', payload([rep('A', 2026, 11)]))
    const { ops } = state.chains.find((c) => c.table === 'metric_reports')
    expect(hasOp(ops, 'eq', 'company_id', 'co-9')).toBe(true)
    expect(hasOp(ops, 'not', 'closed_at', 'is', null)).toBe(true)
  })

  it('si falla la consulta de cerrados, no importa nada', async () => {
    state.resolve = (table) =>
      table === 'metric_reports'
        ? { data: null, error: { message: 'boom' } }
        : { data: null, error: null }
    const res = await importMetrics('co', payload([rep('A', 2026, 11)]))
    expect(res.error).toBe('Error importando reportes: boom')
    expect(upserted()).toBeNull()
  })

  it('si falla el upsert de los reportes, devuelve el error', async () => {
    state.resolve = (table, ops) => {
      if (table !== 'metric_reports') return { data: null, error: null }
      return hasOp(ops, 'upsert')
        ? { data: null, error: { message: 'rls' } }
        : { data: [], error: null }
    }
    const res = await importMetrics('co', payload([rep('A', 2026, 11)]))
    expect(res.error).toBe('Error importando reportes: rls')
  })

  it('importa los clientes con la empresa actual', async () => {
    state.resolve = cerrados([])
    await importMetrics('co', { lines: [], clients: [{ id: 'c1', name: 'X' }], reports: [] })
    const c = chainsOf('metric_clients', 'upsert')[0]
    expect(c.ops.find((o) => o[0] === 'upsert')[1]).toEqual([
      { id: 'c1', name: 'X', company_id: 'co' },
    ])
  })
})

describe('cleanupClientAfterContractEnd', () => {
  it('solo mira reportes abiertos y NO desbloqueados (un reabierto sigue congelado)', async () => {
    state.resolve = () => ({ data: [], error: null })
    await cleanupClientAfterContractEnd('co', 'c1', '2026-09-30')
    const { ops } = chainsOf('metric_reports', 'select')[0]
    expect(hasOp(ops, 'is', 'closed_at', null)).toBe(true)
    expect(hasOp(ops, 'is', 'reopened_at', null)).toBe(true)
  })

  it('sin fecha de fin de contrato no toca nada', async () => {
    const res = await cleanupClientAfterContractEnd('co', 'c1', null)
    expect(res).toEqual({ data: { cleaned: 0 }, error: null })
    expect(state.chains).toHaveLength(0)
  })
})
