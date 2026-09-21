import { vi } from 'vitest'
import { createSupabaseMock } from './helpers/supabaseMock'

const { UPSERTED_CHECK } = vi.hoisted(() => ({
  UPSERTED_CHECK: {
    id: 'chk-1',
    client_id: 'c1',
    network: 'Instagram',
    content_type: 'publicaciones',
    last_published_at: '2026-08-19',
    period_year: 2026,
    period_month: 8,
    period_week: 3,
  },
}))

// loadChecks pagina con selectAllPages (ver src/lib/supabasePaginate.js), así que el
// mock de `publication_checks` debe responder a `.range()` y devolver `count` — igual
// que el mock local de NotificationBell.test.jsx para "Cargar más".
function makeRangeQuery(all) {
  let lo = 0
  let hi = all.length - 1
  const q = {
    select: vi.fn(() => q),
    eq: vi.fn(() => q),
    order: vi.fn(() => q),
    upsert: vi.fn(() => q),
    range: vi.fn((from, to) => {
      lo = from
      hi = to
      return q
    }),
    single: vi.fn().mockResolvedValue({ data: all[0] ?? null, error: null }),
    then: (resolve) => resolve({ data: all.slice(lo, hi + 1), error: null, count: all.length }),
  }
  return q
}

vi.mock('../supabase', () => ({
  supabase: createSupabaseMock({
    tables: { publication_checks: () => makeRangeQuery([UPSERTED_CHECK]) },
  }),
}))

import { supabase } from '../supabase'
import { loadChecks, upsertCheck } from '../components/chequeo/chequeoApi'

beforeEach(() => {
  vi.clearAllMocks()
})

describe('chequeoApi — loadChecks', () => {
  it('filtra por empresa y por el período (año/mes)', async () => {
    await loadChecks('co-1', 2026, 8)
    const query = supabase.from.mock.results.at(-1).value
    expect(query.eq).toHaveBeenCalledWith('company_id', 'co-1')
    expect(query.eq).toHaveBeenCalledWith('period_year', 2026)
    expect(query.eq).toHaveBeenCalledWith('period_month', 8)
  })

  it('pide count exacto, ordena por id y pagina con .range()', async () => {
    const { data, error } = await loadChecks('co-1', 2026, 8)
    const query = supabase.from.mock.results.at(-1).value
    expect(query.select).toHaveBeenCalledWith('*', { count: 'exact' })
    expect(query.order).toHaveBeenCalledWith('id', { ascending: true })
    expect(query.range).toHaveBeenCalled()
    expect(error).toBeNull()
    expect(data).toEqual([UPSERTED_CHECK])
  })

  it('trae TODAS las filas del mes aunque superen el tope de una sola página (bug reportado)', async () => {
    // Reproduce el caso real: publication_checks de septiembre 2026 tiene 1014 filas,
    // por encima del tope de 1000 de Supabase. Antes de paginar, loadChecks perdía las
    // filas de la segunda página y algunas plataformas se veían incompletas.
    const manyChecks = Array.from({ length: 1014 }, (_, i) => ({
      ...UPSERTED_CHECK,
      id: `chk-${i}`,
    }))
    supabase.from.mockImplementation((table) =>
      table === 'publication_checks' ? makeRangeQuery(manyChecks) : makeRangeQuery([]),
    )

    const { data, error } = await loadChecks('co-1', 2026, 9)
    expect(error).toBeNull()
    expect(data).toHaveLength(1014)
  })
})

describe('chequeoApi — upsertCheck', () => {
  it('manda las tres columnas de período y usa el onConflict con período', async () => {
    await upsertCheck({
      companyId: 'co-1',
      clientId: 'c1',
      lineId: 'line-1',
      network: 'Instagram',
      contentType: 'publicaciones',
      lastPublishedAt: '2026-08-19',
      periodYear: 2026,
      periodMonth: 8,
      periodWeek: 3,
      userId: 'u1',
    })

    const query = supabase.from.mock.results.at(-1).value
    expect(query.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        client_id: 'c1',
        network: 'Instagram',
        content_type: 'publicaciones',
        last_published_at: '2026-08-19',
        period_year: 2026,
        period_month: 8,
        period_week: 3,
        updated_by: 'u1',
      }),
      expect.objectContaining({
        onConflict: 'client_id,network,content_type,period_year,period_month,period_week',
      }),
    )
    // Ya no escribe en publication_check_events (tabla en desuso, ver
    // 20260831000000_publication_checks_weekly_periods.sql).
    const eventsCall = supabase.from.mock.calls.find(
      (call) => call[0] === 'publication_check_events',
    )
    expect(eventsCall).toBeUndefined()
  })

  it('borrar una fecha (lastPublishedAt vacío) sigue mandando el período de la celda', async () => {
    await upsertCheck({
      companyId: 'co-1',
      clientId: 'c1',
      lineId: 'line-1',
      network: 'Instagram',
      contentType: 'publicaciones',
      lastPublishedAt: null,
      periodYear: 2026,
      periodMonth: 8,
      periodWeek: 3,
      userId: 'u1',
    })
    const query = supabase.from.mock.results.at(-1).value
    expect(query.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ last_published_at: null, period_week: 3 }),
      expect.anything(),
    )
  })
})
