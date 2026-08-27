import { vi } from 'vitest'
import { createSupabaseMock, makeQuery } from './helpers/supabaseMock'

// ── Mock supabase ─────────────────────────────────────────────────────────────
let query
vi.mock('../supabase', () => ({
  supabase: createSupabaseMock({
    tables: {
      vacations: () => query,
    },
  }),
}))

const { fetchVacationsInRange } = await import('../lib/vacations')

describe('fetchVacationsInRange', () => {
  beforeEach(() => {
    query = makeQuery([])
  })

  it('no golpea la red si userIds está vacío', async () => {
    const result = await fetchVacationsInRange([], '2026-08-01', '2026-08-31')
    expect(result).toEqual([])
    expect(query.not).not.toHaveBeenCalled()
  })

  it('excluye por negación solo rejected, para traer también las tentativas', async () => {
    // El calendario ahora muestra tanto vacaciones confirmadas como tentativas
    // (distinguidas visualmente) — solo se excluyen las rechazadas. El vocabulario de
    // exclusión vive en resolveVacationStatus (utils/employeeCalendar.js).
    await fetchVacationsInRange(['u1'], '2026-08-01', '2026-08-31')
    expect(query.not).toHaveBeenCalledWith('status', 'in', '(rejected)')
  })

  it('devuelve las filas del rango', async () => {
    query = makeQuery([
      {
        id: 'v1',
        user_id: 'u1',
        start_date: '2026-08-06',
        end_date: '2026-08-31',
        status: 'programmed',
      },
    ])
    const result = await fetchVacationsInRange(['u1'], '2026-08-01', '2026-08-31')
    expect(result).toEqual([
      {
        id: 'v1',
        user_id: 'u1',
        start_date: '2026-08-06',
        end_date: '2026-08-31',
        status: 'programmed',
      },
    ])
  })
})
