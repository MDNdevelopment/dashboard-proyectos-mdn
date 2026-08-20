import { vi } from 'vitest'
import { createSupabaseMock } from './helpers/supabaseMock'

const { UPSERTED_CHECK } = vi.hoisted(() => ({
  UPSERTED_CHECK: {
    id: 'chk-1',
    client_id: 'c1',
    network: 'Instagram',
    content_type: 'publicaciones',
    last_published_at: '2026-08-19',
  },
}))

vi.mock('../supabase', () => ({
  supabase: createSupabaseMock({
    tables: { publication_checks: [UPSERTED_CHECK] },
  }),
}))

import { supabase } from '../supabase'
import { upsertCheck, loadCheckEvents } from '../components/chequeo/chequeoApi'

beforeEach(() => {
  vi.clearAllMocks()
})

describe('chequeoApi — upsertCheck', () => {
  it('al guardar una fecha, inserta también el evento en publication_check_events', async () => {
    await upsertCheck({
      companyId: 'co-1',
      clientId: 'c1',
      lineId: 'line-1',
      network: 'Instagram',
      contentType: 'publicaciones',
      lastPublishedAt: '2026-08-19',
      userId: 'u1',
    })

    const eventsCall = supabase.from.mock.calls.find(
      (call) => call[0] === 'publication_check_events',
    )
    expect(eventsCall).toBeTruthy()
    const eventsQuery = supabase.from.mock.results.find(
      (r, i) => supabase.from.mock.calls[i][0] === 'publication_check_events',
    ).value
    expect(eventsQuery.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        client_id: 'c1',
        network: 'Instagram',
        content_type: 'publicaciones',
        published_at: '2026-08-19',
        created_by: 'u1',
      }),
      expect.objectContaining({
        onConflict: 'client_id,network,content_type,published_at',
        ignoreDuplicates: true,
      }),
    )
  })

  it('borrar una fecha (lastPublishedAt vacío) no inserta ningún evento', async () => {
    await upsertCheck({
      companyId: 'co-1',
      clientId: 'c1',
      lineId: 'line-1',
      network: 'Instagram',
      contentType: 'publicaciones',
      lastPublishedAt: null,
      userId: 'u1',
    })

    const eventsCall = supabase.from.mock.calls.find(
      (call) => call[0] === 'publication_check_events',
    )
    expect(eventsCall).toBeUndefined()
  })
})

describe('chequeoApi — loadCheckEvents', () => {
  it('filtra por línea y por el rango de fechas del mes', async () => {
    await loadCheckEvents('line-1', 2026, 8)
    const query = supabase.from.mock.results.at(-1).value
    expect(query.eq).toHaveBeenCalledWith('line_id', 'line-1')
    expect(query.gte).toHaveBeenCalledWith('published_at', '2026-08-01')
    expect(query.lt).toHaveBeenCalledWith('published_at', '2026-09-01')
  })

  it('en diciembre, el rango cruza al 1º de enero del año siguiente', async () => {
    await loadCheckEvents('line-1', 2026, 12)
    const query = supabase.from.mock.results.at(-1).value
    expect(query.gte).toHaveBeenCalledWith('published_at', '2026-12-01')
    expect(query.lt).toHaveBeenCalledWith('published_at', '2027-01-01')
  })
})
