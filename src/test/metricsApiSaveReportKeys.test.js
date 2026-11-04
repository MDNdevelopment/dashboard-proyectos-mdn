/**
 * Test de metricsApi.saveReportKeys — guarda solo las claves indicadas, mezcladas contra la
 * fila vigente en la base (no contra la copia que la vista cargó antes).
 */
import { vi, describe, it, expect, beforeEach } from 'vitest'

const { from, maybeSingle, upsert } = vi.hoisted(() => {
  const maybeSingle = vi.fn()
  const eq3 = vi.fn().mockReturnValue({ maybeSingle })
  const eq2 = vi.fn().mockReturnValue({ eq: eq3 })
  const eq1 = vi.fn().mockReturnValue({ eq: eq2 })
  const select = vi.fn().mockReturnValue({ eq: eq1 })
  const single = vi.fn().mockResolvedValue({ data: { id: 'r-1' }, error: null })
  const upsertSelect = vi.fn().mockReturnValue({ single })
  const upsert = vi.fn().mockReturnValue({ select: upsertSelect })
  return { from: vi.fn().mockReturnValue({ select, upsert }), maybeSingle, upsert }
})

vi.mock('../supabase', () => ({ supabase: { from } }))

import { saveReportKeys } from '../components/metricas/metricsApi'

const saved = () => upsert.mock.calls[0][0].data

describe('metricsApi.saveReportKeys', () => {
  beforeEach(() => {
    upsert.mockClear()
    maybeSingle.mockReset()
  })

  it('escribe solo las claves indicadas y conserva el resto de la fila vigente', async () => {
    maybeSingle.mockResolvedValue({
      data: {
        closed_at: null,
        data: { reuniones: { meta: 5 }, finanzas: { ingresos: [{ id: 'fresco' }] } },
      },
      error: null,
    })
    await saveReportKeys('co', 'l1', 2026, 10, { reuniones: { meta: 3 } }, { finanzas: 'viejo' })
    expect(saved().reuniones).toEqual({ meta: 3 })
    // finanzas viene de la base, no de la copia vieja de la vista (fallback)
    expect(saved().finanzas).toEqual({ ingresos: [{ id: 'fresco' }] })
  })

  it('sin fila parte del fallback (reporte completo de la vista)', async () => {
    maybeSingle.mockResolvedValue({ data: null, error: null })
    await saveReportKeys('co', 'l1', 2026, 10, { reuniones: { meta: 3 } }, { finanzas: 'base' })
    expect(saved()).toEqual({ finanzas: 'base', reuniones: { meta: 3 } })
  })

  it('no escribe en un reporte cerrado', async () => {
    maybeSingle.mockResolvedValue({
      data: { closed_at: '2026-11-05T00:00:00Z', data: {} },
      error: null,
    })
    const { error } = await saveReportKeys('co', 'l1', 2026, 10, { reuniones: {} })
    expect(upsert).not.toHaveBeenCalled()
    expect(error.message).toMatch(/cerrado/)
  })

  it('keepFreshJustificativos: los justificativos de la base prevalecen (auto-guardado)', async () => {
    maybeSingle.mockResolvedValue({
      data: {
        closed_at: null,
        data: { reuniones: { meta: 4, justificativos: { c1: 'no_aplica' } } },
      },
      error: null,
    })
    await saveReportKeys(
      'co',
      'l1',
      2026,
      10,
      { reuniones: { meta: 5, realizadas: 2, justificativos: {} } },
      {},
      { keepFreshJustificativos: true },
    )
    expect(saved().reuniones).toEqual({
      meta: 5,
      realizadas: 2,
      justificativos: { c1: 'no_aplica' },
    })
  })

  it('propaga el error de lectura sin escribir', async () => {
    maybeSingle.mockResolvedValue({ data: null, error: { message: 'boom' } })
    const { error } = await saveReportKeys('co', 'l1', 2026, 10, { reuniones: {} })
    expect(error.message).toBe('boom')
    expect(upsert).not.toHaveBeenCalled()
  })
})
