/**
 * Tests de reportSourcesApi.js — cargador por lote de las fuentes que alimenta
 * buildEffectiveReport para varios pares línea×mes a la vez.
 *
 * Mockea `../supabase` con un builder chainable/thenable (mismo patrón que
 * src/test/meetingsApi.test.js), dispatch por nombre de tabla.
 */
import { describe, it, expect, vi } from 'vitest'

const { mockMeetings, mockFixedTaskMarks, mockChecks, mockAvPautas, mockCnp, mockTasks } =
  vi.hoisted(() => ({
    mockMeetings: vi.fn(() => ({ data: [], error: null })),
    mockFixedTaskMarks: vi.fn(() => ({ data: [], error: null })),
    mockChecks: vi.fn(() => ({ data: [], error: null, count: 0 })),
    mockAvPautas: vi.fn(() => ({ data: [], error: null })),
    mockCnp: vi.fn(() => ({ data: [], error: null })),
    mockTasks: vi.fn(() => ({ data: [], error: null })),
  }))

function chainable(getResult) {
  const obj = {}
  const passthrough = [
    'select',
    'eq',
    'neq',
    'gte',
    'lte',
    'lt',
    'gt',
    'order',
    'in',
    'is',
    'contains',
    'overlaps',
    'range',
  ]
  passthrough.forEach((m) => {
    obj[m] = vi.fn(() => obj)
  })
  obj.then = (resolve, reject) => Promise.resolve(getResult()).then(resolve, reject)
  return obj
}

vi.mock('../supabase', () => ({
  supabase: {
    from: vi.fn((table) => {
      if (table === 'meetings') return chainable(mockMeetings)
      if (table === 'fixed_task_marks') return chainable(mockFixedTaskMarks)
      if (table === 'publication_checks') return chainable(mockChecks)
      if (table === 'av_pautas') return chainable(mockAvPautas)
      if (table === 'cnp_requests') return chainable(mockCnp)
      if (table === 'tasks') return chainable(mockTasks)
      return chainable(() => ({ data: [], error: null }))
    }),
  },
}))

const { loadReportSources } = await import('../components/metricas/reportSourcesApi')

function resetMocks() {
  mockMeetings.mockReturnValue({ data: [], error: null })
  mockFixedTaskMarks.mockReturnValue({ data: [], error: null })
  mockChecks.mockReturnValue({ data: [], error: null, count: 0 })
  mockAvPautas.mockReturnValue({ data: [], error: null })
  mockCnp.mockReturnValue({ data: [], error: null })
  mockTasks.mockReturnValue({ data: [], error: null })
}

// Fechas a mitad de mes para que la comparación local/UTC no dependa de la zona
// horaria de la máquina que corre el test.
const AUG_15 = new Date(2026, 7, 15, 12).toISOString()
const SEP_15 = new Date(2026, 8, 15, 12).toISOString()

describe('loadReportSources', () => {
  it('no toca la red si months o lineIds vienen vacíos', async () => {
    resetMocks()
    const { data, error } = await loadReportSources('co1', {
      year: 2026,
      months: [],
      lineIds: ['A'],
    })
    expect(data).toEqual({})
    expect(error).toBeNull()
    expect(mockMeetings).not.toHaveBeenCalled()

    const { data: data2 } = await loadReportSources('co1', { year: 2026, months: [8], lineIds: [] })
    expect(data2).toEqual({})
  })

  it('devuelve una entrada completa con ceros para pares sin filas fuente', async () => {
    resetMocks()
    const { data } = await loadReportSources('co1', {
      year: 2026,
      months: [8, 9],
      lineIds: ['A', 'B'],
    })
    expect(Object.keys(data).sort()).toEqual(['A__8', 'A__9', 'B__8', 'B__9'])
    expect(data['A__8']).toEqual({
      meetingsCount: 0,
      heldClientIds: [],
      fixedTaskMarks: [],
      checks: [],
      piezas: { piezas: 0, editadas: 0, porGrupo: expect.any(Object) },
      pautasByClient: {},
      cnpSolicitudes: { solicitudes: 0, entregados: 0 },
      tareasSolicitudes: { solicitudes: 0, entregados: 0 },
    })
  })

  it('reuniones: una fila con line_ids:["A"] y client_ids:[] aporta 1 a A y 0 a B (trampa del overlaps)', async () => {
    resetMocks()
    mockMeetings.mockReturnValue({
      data: [{ client_ids: [], line_ids: ['A'], starts_at: AUG_15 }],
      error: null,
    })
    const { data } = await loadReportSources('co1', {
      year: 2026,
      months: [8],
      lineIds: ['A', 'B'],
    })
    expect(data['A__8'].meetingsCount).toBe(1)
    expect(data['B__8'].meetingsCount).toBe(0)
  })

  it('reuniones: una fila con marcas de dos líneas aporta solo su cliente a cada línea', async () => {
    resetMocks()
    mockMeetings.mockReturnValue({
      data: [{ client_ids: ['c1', 'c2'], line_ids: ['A', 'B'], starts_at: SEP_15 }],
      error: null,
    })
    const { data } = await loadReportSources('co1', {
      year: 2026,
      months: [9],
      lineIds: ['A', 'B'],
    })
    expect(data['A__9'].meetingsCount).toBe(1)
    expect(data['A__9'].heldClientIds).toEqual(['c1'])
    expect(data['B__9'].meetingsCount).toBe(1)
    expect(data['B__9'].heldClientIds).toEqual(['c2'])
  })

  it('reuniones: bucketing correcto con 2 líneas × 2 meses mezclados', async () => {
    resetMocks()
    mockMeetings.mockReturnValue({
      data: [
        { client_ids: ['c1'], line_ids: ['A'], starts_at: AUG_15 },
        { client_ids: ['c2'], line_ids: ['B'], starts_at: SEP_15 },
      ],
      error: null,
    })
    const { data } = await loadReportSources('co1', {
      year: 2026,
      months: [8, 9],
      lineIds: ['A', 'B'],
    })
    expect(data['A__8'].meetingsCount).toBe(1)
    expect(data['A__9'].meetingsCount).toBe(0)
    expect(data['B__8'].meetingsCount).toBe(0)
    expect(data['B__9'].meetingsCount).toBe(1)
  })

  it('fixed_task_marks: agrupa por line_id + period_month', async () => {
    resetMocks()
    mockFixedTaskMarks.mockReturnValue({
      data: [
        {
          line_id: 'A',
          period_month: 8,
          client_id: 'c1',
          task_key: 'metricas',
          period_week: 1,
          status: 'si',
        },
        {
          line_id: 'B',
          period_month: 9,
          client_id: 'c2',
          task_key: 'metricas',
          period_week: 1,
          status: 'si',
        },
      ],
      error: null,
    })
    const { data } = await loadReportSources('co1', {
      year: 2026,
      months: [8, 9],
      lineIds: ['A', 'B'],
    })
    expect(data['A__8'].fixedTaskMarks).toHaveLength(1)
    expect(data['A__9'].fixedTaskMarks).toHaveLength(0)
    expect(data['B__9'].fixedTaskMarks).toHaveLength(1)
  })

  it('publication_checks: company-wide, se reparte al mismo mes de todas las líneas', async () => {
    resetMocks()
    mockChecks.mockReturnValue({
      data: [
        {
          id: 1,
          client_id: 'c1',
          network: 'Instagram',
          content_type: 'publicaciones',
          period_month: 8,
        },
      ],
      error: null,
      count: 1,
    })
    const { data } = await loadReportSources('co1', {
      year: 2026,
      months: [8, 9],
      lineIds: ['A', 'B'],
    })
    expect(data['A__8'].checks).toHaveLength(1)
    expect(data['B__8'].checks).toHaveLength(1)
    expect(data['A__9'].checks).toHaveLength(0)
  })

  it('av_pautas: piezas y pautasByClient por línea + mes', async () => {
    resetMocks()
    mockAvPautas.mockReturnValue({
      data: [
        {
          line_id: 'B',
          client_id: 'cX',
          pauta_date: '2026-08-10',
          piezas_totales: 2,
          piezas_editadas: 1,
          status: 'realizada',
          formats: ['V'],
          piezas_por_formato: null,
        },
      ],
      error: null,
    })
    const { data } = await loadReportSources('co1', {
      year: 2026,
      months: [8, 9],
      lineIds: ['A', 'B'],
    })
    expect(data['B__8'].piezas.piezas).toBe(2)
    expect(data['B__8'].piezas.editadas).toBe(1)
    expect(data['B__8'].pautasByClient).toEqual({ cX: 1 })
    expect(data['A__8'].piezas.piezas).toBe(0)
  })

  it('cnp_requests: solicitudes/entregados por línea + mes (UTC)', async () => {
    resetMocks()
    mockCnp.mockReturnValue({
      data: [
        {
          line_id: 'A',
          status: 'Terminado',
          pieces: [{ done: true }, { done: false }],
          created_at: SEP_15,
        },
      ],
      error: null,
    })
    const { data } = await loadReportSources('co1', {
      year: 2026,
      months: [8, 9],
      lineIds: ['A', 'B'],
    })
    expect(data['A__9'].cnpSolicitudes.solicitudes).toBe(2)
    expect(data['A__9'].cnpSolicitudes.entregados).toBe(2) // Terminado → todas cuentan
  })

  it('tasks: solicitudes/entregados por team_id + mes', async () => {
    resetMocks()
    mockTasks.mockReturnValue({
      data: [
        { team_id: 'B', status: 'Terminado', request_date: '2026-08-05' },
        { team_id: 'B', status: 'Pendiente', request_date: '2026-08-06' },
      ],
      error: null,
    })
    const { data } = await loadReportSources('co1', {
      year: 2026,
      months: [8, 9],
      lineIds: ['A', 'B'],
    })
    expect(data['B__8'].tareasSolicitudes).toEqual({ solicitudes: 2, entregados: 1 })
  })

  it('propaga el primer error de cualquiera de las 6 queries', async () => {
    resetMocks()
    mockCnp.mockReturnValue({ data: null, error: { message: 'boom' } })
    const { error } = await loadReportSources('co1', { year: 2026, months: [8], lineIds: ['A'] })
    expect(error).toEqual({ message: 'boom' })
  })
})
