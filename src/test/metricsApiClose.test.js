/**
 * Test de metricsApi.closeReport — cierre permanente de un reporte (línea/año/mes).
 * Verifica el UPDATE real armado sobre metric_reports (closed_at/closed_by, filtros).
 */
import { vi } from 'vitest'

const { from, update, eq1, eq2, eq3, select } = vi.hoisted(() => {
  const single = vi.fn().mockResolvedValue({
    data: { id: 'r-1', closed_at: '2026-07-15T00:00:00.000Z', closed_by: 'u-1' },
    error: null,
  })
  const select = vi.fn().mockReturnValue({ single })
  const eq3 = vi.fn().mockReturnValue({ select })
  const eq2 = vi.fn().mockReturnValue({ eq: eq3 })
  const eq1 = vi.fn().mockReturnValue({ eq: eq2 })
  const update = vi.fn().mockReturnValue({ eq: eq1 })
  return { from: vi.fn().mockReturnValue({ update }), update, eq1, eq2, eq3, select }
})

vi.mock('../supabase', () => ({ supabase: { from } }))

import { closeReport } from '../components/metricas/metricsApi'

describe('metricsApi.closeReport', () => {
  it('actualiza closed_at/closed_by filtrando por line_id/year/month', async () => {
    const { data, error } = await closeReport('line-1', 2026, 6, 'u-1')

    expect(from).toHaveBeenCalledWith('metric_reports')
    expect(update).toHaveBeenCalledWith(expect.objectContaining({ closed_by: 'u-1' }))
    expect(update.mock.calls[0][0].closed_at).toEqual(expect.any(String))
    expect(eq1).toHaveBeenCalledWith('line_id', 'line-1')
    expect(eq2).toHaveBeenCalledWith('year', 2026)
    expect(eq3).toHaveBeenCalledWith('month', 6)
    expect(select).toHaveBeenCalled()
    expect(error).toBeNull()
    expect(data.id).toBe('r-1')
  })
})
