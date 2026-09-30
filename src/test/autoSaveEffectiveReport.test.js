/**
 * Tests de metricsApi.loadYearReportsEffective — el camino de lectura que produce el
 * mismo `data` que ve Operaciones (reporte efectivo) y, opcionalmente, lo auto-persiste.
 *
 * Mockea `../supabase` (tablas metric_reports/metric_lines/metric_clients/users) y
 * `../components/metricas/reportSourcesApi` (aísla la orquestación de
 * loadYearReportsEffective de los detalles de batching, ya cubiertos en
 * reportSourcesApi.test.js).
 *
 * El dedupe de auto-guardado (`_autoSaveDone`) vive en un Map a nivel de módulo, así que
 * persiste ENTRE tests de este archivo (mismo módulo real, no mockeado). Cada test que
 * necesita que su upsert dispare usa un `line_id` propio para no chocar con el hash que
 * dejó un test anterior sobre la misma línea/año/mes — solo el test de "dedupe" reutiliza
 * a propósito la misma línea en dos llamadas consecutivas.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const {
  mockReportsSelect,
  mockUpsert,
  mockUpsertResult,
  mockLinesSelect,
  mockClientsSelect,
  mockEmployeesSelect,
} = vi.hoisted(() => ({
  mockReportsSelect: vi.fn(() => ({ data: [], error: null })),
  mockUpsert: vi.fn(),
  mockUpsertResult: vi.fn(() => ({ data: { id: 'r-1' }, error: null })),
  mockLinesSelect: vi.fn(() => ({ data: [], error: null })),
  mockClientsSelect: vi.fn(() => ({ data: [], error: null })),
  mockEmployeesSelect: vi.fn(() => ({ data: [], error: null })),
}))

function readChainable(getResult) {
  const obj = {}
  ;['select', 'eq', 'order', 'is', 'in'].forEach((m) => {
    obj[m] = vi.fn(() => obj)
  })
  obj.then = (resolve, reject) => Promise.resolve(getResult()).then(resolve, reject)
  return obj
}

vi.mock('../supabase', () => ({
  supabase: {
    from: vi.fn((table) => {
      if (table === 'metric_reports') {
        return {
          select: vi.fn(() => readChainable(mockReportsSelect)),
          upsert: vi.fn((payload) => {
            mockUpsert(payload)
            return {
              select: vi.fn(() => ({ single: vi.fn(() => Promise.resolve(mockUpsertResult())) })),
            }
          }),
        }
      }
      if (table === 'metric_lines') return readChainable(mockLinesSelect)
      if (table === 'metric_clients') return readChainable(mockClientsSelect)
      if (table === 'users') return readChainable(mockEmployeesSelect)
      return readChainable(() => ({ data: [], error: null }))
    }),
  },
}))

const { loadReportSources } = vi.hoisted(() => ({ loadReportSources: vi.fn() }))
vi.mock('../components/metricas/reportSourcesApi', () => ({ loadReportSources }))

const { loadYearReportsEffective } = await import('../components/metricas/metricsApi')

const NOW = new Date(2026, 8, 15) // 15 sep 2026 — dentro del mes en curso

function baseReportData(overrides = {}) {
  return {
    reuniones: { realizadas: 1, meta: 2, justificativos: {} },
    productividad: { tareas: [] },
    crecimiento: { items: [] },
    solicitudes: { solicitudes: 5, editadas: 3 },
    pautas: { items: [] },
    piezas: { piezas: 4, editadas: 2 },
    feedback: { items: [] },
    finanzas: { ingresos: [{ monto: 999 }], gastosOperativos: [], sueldos: [], otrosGastos: [] },
    ...overrides,
  }
}

function hotRow(lineId, overrides = {}) {
  return {
    line_id: lineId,
    year: 2026,
    month: 9, // dentro de todas las eras (todas arrancan 2026-09 o antes)
    closed_at: null,
    company_id: 'co1',
    data: baseReportData(),
    ...overrides,
  }
}

beforeEach(() => {
  mockReportsSelect.mockReset().mockReturnValue({ data: [], error: null })
  mockUpsert.mockReset()
  mockUpsertResult.mockReset().mockReturnValue({ data: { id: 'r-1' }, error: null })
  mockLinesSelect.mockReset().mockReturnValue({ data: [], error: null })
  mockClientsSelect.mockReset().mockReturnValue({ data: [], error: null })
  mockEmployeesSelect.mockReset().mockReturnValue({ data: [], error: null })
  // Siembra meetingsCount:7 para cualquier par línea×mes pedido — realizadas pasa de 1
  // (guardado) a 7 (derivado), suficiente diff para ejercitar el auto-guardado.
  loadReportSources.mockReset().mockImplementation((_companyId, { months, lineIds }) => {
    const data = {}
    lineIds.forEach((l) =>
      months.forEach((m) => (data[`${l}__${m}`] = { meetingsCount: 7, heldClientIds: [] })),
    )
    return Promise.resolve({ data, error: null })
  })
})

describe('loadYearReportsEffective', () => {
  it('un reporte cerrado sale tal cual, sin auto-guardar', async () => {
    const row = hotRow('l1', { closed_at: '2026-10-05T00:00:00Z' })
    mockReportsSelect.mockReturnValue({ data: [row], error: null })

    const { data } = await loadYearReportsEffective('co1', 2026, { autoSave: true, now: NOW })

    expect(data[0].data).toEqual(row.data)
    expect(mockUpsert).not.toHaveBeenCalled()
  })

  it('deriva reuniones.realizadas de las fuentes en un reporte abierto', async () => {
    const row = hotRow('l2')
    mockReportsSelect.mockReturnValue({ data: [row], error: null })

    const { data } = await loadYearReportsEffective('co1', 2026, { now: NOW })

    expect(data[0].data.reuniones.realizadas).toBe(7)
  })

  it('no auto-guarda si autoSave es false (default)', async () => {
    const row = hotRow('l3')
    mockReportsSelect.mockReturnValue({ data: [row], error: null })

    await loadYearReportsEffective('co1', 2026, { now: NOW })

    expect(mockUpsert).not.toHaveBeenCalled()
  })

  it('auto-guarda cuando autoSave=true y lo derivado difiere de lo guardado', async () => {
    const row = hotRow('l4')
    mockReportsSelect.mockReturnValue({ data: [row], error: null })

    await loadYearReportsEffective('co1', 2026, { autoSave: true, now: NOW })

    expect(mockUpsert).toHaveBeenCalledTimes(1)
    const payload = mockUpsert.mock.calls[0][0]
    expect(payload.data.reuniones.realizadas).toBe(7)
  })

  it('el payload conserva `finanzas` intacta, byte a byte, aunque el efectivo la reconcilie', async () => {
    const row = hotRow('l5')
    mockReportsSelect.mockReturnValue({ data: [row], error: null })

    await loadYearReportsEffective('co1', 2026, { autoSave: true, now: NOW })

    const payload = mockUpsert.mock.calls[0][0]
    expect(payload.data.finanzas).toEqual(row.data.finanzas)
  })

  it('no auto-guarda dos veces con dos cargas consecutivas idénticas (dedupe)', async () => {
    const row = hotRow('l6')
    mockReportsSelect.mockReturnValue({ data: [row], error: null })

    await loadYearReportsEffective('co1', 2026, { autoSave: true, now: NOW })
    // La segunda carga ya vendría con reuniones.realizadas=7 en la fila (si alguien
    // recargara Resumen tras el primer auto-guardado); simulamos eso para probar que
    // sin diff no hay una segunda escritura.
    const rowAfterSave = hotRow('l6', {
      data: { ...row.data, reuniones: { ...row.data.reuniones, realizadas: 7 } },
    })
    mockReportsSelect.mockReturnValue({ data: [rowAfterSave], error: null })

    await loadYearReportsEffective('co1', 2026, { autoSave: true, now: NOW })

    expect(mockUpsert).toHaveBeenCalledTimes(1)
  })

  it('un error del upsert no lanza ni afecta el { data } devuelto', async () => {
    const row = hotRow('l7')
    mockReportsSelect.mockReturnValue({ data: [row], error: null })
    mockUpsertResult.mockReturnValue({ data: null, error: { message: 'RLS' } })

    const { data, error } = await loadYearReportsEffective('co1', 2026, {
      autoSave: true,
      now: NOW,
    })

    expect(error).toBeNull()
    expect(data[0].data.reuniones.realizadas).toBe(7)
  })

  it('un mes fuera de todas las eras sale tal cual, sin auto-guardar', async () => {
    const row = hotRow('l8', { month: 1, data: baseReportData() }) // enero 2026, antes de todas las eras
    mockReportsSelect.mockReturnValue({ data: [row], error: null })

    const { data } = await loadYearReportsEffective('co1', 2026, { autoSave: true, now: NOW })

    expect(data[0].data).toEqual(row.data)
    expect(mockUpsert).not.toHaveBeenCalled()
  })
})
