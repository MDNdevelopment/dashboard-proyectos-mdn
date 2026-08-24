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

vi.mock('../supabase', () => ({
  supabase: createSupabaseMock({
    tables: { publication_checks: [UPSERTED_CHECK] },
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
