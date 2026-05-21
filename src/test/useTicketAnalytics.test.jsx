import { renderHook, waitFor } from '@testing-library/react'
import { vi } from 'vitest'

vi.mock('../supabase', () => ({
  supabase: { from: vi.fn() },
}))

import { supabase } from '../supabase'
import { useTicketAnalytics } from '../hooks/useTicketAnalytics'

const tickets = [
  {
    id: 1,
    title: 'Ticket 1',
    status: 'abierto',
    priority: 'alta',
    category: 'hardware',
    created_at: '2026-05-20T10:00:00Z',
    resolved_at: null,
    assigned_to: null,
    requester: { first_name: 'Ana', last_name: 'Lopez' },
    assignee: null,
  },
  {
    id: 2,
    title: 'Ticket 2',
    status: 'resuelto',
    priority: 'baja',
    category: 'software',
    created_at: '2026-05-21T08:00:00Z',
    resolved_at: '2026-05-21T10:00:00Z',
    assigned_to: 'u1',
    requester: { first_name: 'Luis', last_name: 'Gomez' },
    assignee: { first_name: 'Carlos', last_name: 'IT' },
  },
]

function mockQuery(data, error = null) {
  const chain = {
    select: vi.fn(),
    order: vi.fn(),
    gte: vi.fn(),
    lte: vi.fn(),
  }
  chain.select.mockReturnValue(chain)
  chain.order.mockReturnValue(chain)
  chain.gte.mockReturnValue(chain)
  chain.lte.mockResolvedValue({ data, error })
  // if no lte is called (no endDate), order should resolve
  chain.order.mockResolvedValue({ data, error })
  supabase.from.mockReturnValue(chain)
}

describe('useTicketAnalytics', () => {
  it('retorna loading=true inicialmente', () => {
    const chain = { select: vi.fn(), order: vi.fn(), gte: vi.fn(), lte: vi.fn() }
    chain.select.mockReturnValue(chain)
    chain.order.mockReturnValue(new Promise(() => {}))
    supabase.from.mockReturnValue(chain)

    const { result } = renderHook(() => useTicketAnalytics({}))
    expect(result.current.loading).toBe(true)
  })

  it('calcula metricas correctamente', async () => {
    mockQuery(tickets)
    const { result } = renderHook(() => useTicketAnalytics({}))
    await waitFor(() => expect(result.current.loading).toBe(false))

    const { metrics } = result.current
    expect(metrics.total).toBe(2)
    expect(metrics.open).toBe(1)
    expect(metrics.resolved).toBe(1)
    expect(metrics.inProgress).toBe(0)
  })

  it('calcula avgResolutionHours correctamente', async () => {
    mockQuery(tickets)
    const { result } = renderHook(() => useTicketAnalytics({}))
    await waitFor(() => expect(result.current.loading).toBe(false))
    // ticket 2: resolved_at - created_at = 2h
    expect(result.current.metrics.avgResolutionHours).toBeCloseTo(2)
  })

  it('genera ticketsPerDay agrupados por fecha', async () => {
    mockQuery(tickets)
    const { result } = renderHook(() => useTicketAnalytics({}))
    await waitFor(() => expect(result.current.loading).toBe(false))

    const days = result.current.metrics.ticketsPerDay
    expect(days.find(d => d.date === '2026-05-20')?.count).toBe(1)
    expect(days.find(d => d.date === '2026-05-21')?.count).toBe(1)
  })

  it('genera staffPerformance correctamente', async () => {
    mockQuery(tickets)
    const { result } = renderHook(() => useTicketAnalytics({}))
    await waitFor(() => expect(result.current.loading).toBe(false))

    const staff = result.current.metrics.staffPerformance
    expect(staff).toHaveLength(1)
    expect(staff[0].name).toBe('Carlos IT')
    expect(staff[0].resolved).toBe(1)
  })

  it('maneja error de supabase', async () => {
    const chain = { select: vi.fn(), order: vi.fn(), gte: vi.fn(), lte: vi.fn() }
    chain.select.mockReturnValue(chain)
    chain.order.mockResolvedValue({ data: null, error: { message: 'db error' } })
    supabase.from.mockReturnValue(chain)

    const { result } = renderHook(() => useTicketAnalytics({}))
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.error).toBe('db error')
  })
})
