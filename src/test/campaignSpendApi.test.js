/**
 * Tests de loadAdsResponsables (src/components/ads/campaignSpendApi.js):
 * combina usuarios "fijos" (ads_responsable_fixed) con jefas de línea
 * (metric_line_members.is_lead), deduplica y ordena por first_name.
 */
import { vi } from 'vitest'

const { mockSupabase } = vi.hoisted(() => {
  function makeSupabaseMock({ users, lines, members }) {
    return {
      from: vi.fn((table) => {
        const filters = {}
        const builder = {
          select: vi.fn(() => builder),
          eq: vi.fn((col, val) => { filters[col] = val; return builder }),
          in: vi.fn((col, vals) => { filters[col] = vals; return builder }),
          then: (resolve) => {
            let data = []
            if (table === 'users') {
              if ('ads_responsable_fixed' in filters) {
                data = users.filter(u => u.company_id === filters.company_id && u.ads_responsable_fixed === true)
              } else if ('user_id' in filters) {
                data = users.filter(u => filters.user_id.includes(u.user_id))
              }
            } else if (table === 'metric_lines') {
              data = lines.filter(l => l.company_id === filters.company_id)
            } else if (table === 'metric_line_members') {
              data = members.filter(m => filters.line_id.includes(m.line_id) && m.is_lead === filters.is_lead)
            }
            resolve({ data, error: null })
          },
        }
        return builder
      }),
    }
  }
  return { mockSupabase: makeSupabaseMock }
})

vi.mock('../supabase', () => ({
  get supabase() { return globalThis.__campaignSpendApiSupabaseMock },
}))

import { loadAdsResponsables } from '../components/ads/campaignSpendApi'

const USERS = [
  { user_id: 'u1', company_id: 'co-1', ads_responsable_fixed: true, first_name: 'Katherine', last_name: 'Mora' },
  { user_id: 'u2', company_id: 'co-1', ads_responsable_fixed: true, first_name: 'Paola', last_name: 'Urdaneta' },
  { user_id: 'u3', company_id: 'co-1', ads_responsable_fixed: false, first_name: 'Georgina', last_name: 'Pérez' },
  { user_id: 'u4', company_id: 'co-1', ads_responsable_fixed: false, first_name: 'Daniellys', last_name: 'Gómez' },
  { user_id: 'u5', company_id: 'co-1', ads_responsable_fixed: false, first_name: 'Otro', last_name: 'Empleado' },
]
const LINES = [{ id: 'line-1', company_id: 'co-1' }, { id: 'line-2', company_id: 'co-1' }]
const MEMBERS = [
  { line_id: 'line-1', user_id: 'u3', is_lead: true },
  { line_id: 'line-1', user_id: 'u5', is_lead: false },
  { line_id: 'line-2', user_id: 'u4', is_lead: true },
]

describe('loadAdsResponsables', () => {
  beforeEach(() => {
    globalThis.__campaignSpendApiSupabaseMock = mockSupabase({ users: USERS, lines: LINES, members: MEMBERS })
  })

  it('combina responsables fijos + jefas de línea, ordenados por first_name', async () => {
    const { data, error } = await loadAdsResponsables('co-1')
    expect(error).toBeNull()
    expect(data.map(u => `${u.first_name} ${u.last_name}`)).toEqual([
      'Daniellys Gómez', 'Georgina Pérez', 'Katherine Mora', 'Paola Urdaneta',
    ])
  })

  it('NO incluye empleados que no son ni fijos ni jefas de línea', async () => {
    const { data } = await loadAdsResponsables('co-1')
    expect(data.find(u => u.user_id === 'u5')).toBeUndefined()
  })

  it('deduplica cuando un usuario es fijo Y jefa de línea a la vez', async () => {
    globalThis.__campaignSpendApiSupabaseMock = mockSupabase({
      users: USERS,
      lines: LINES,
      members: [...MEMBERS, { line_id: 'line-1', user_id: 'u1', is_lead: true }], // Katherine también jefa
    })
    const { data } = await loadAdsResponsables('co-1')
    expect(data.filter(u => u.user_id === 'u1')).toHaveLength(1)
  })

  it('sin líneas ni responsables fijos, retorna lista vacía', async () => {
    globalThis.__campaignSpendApiSupabaseMock = mockSupabase({ users: [], lines: [], members: [] })
    const { data } = await loadAdsResponsables('co-1')
    expect(data).toEqual([])
  })
})
