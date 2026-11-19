/**
 * Tests de reportSourcesApi.js — cargador por lote de las fuentes que alimenta
 * buildEffectiveReport para varios pares línea×mes a la vez.
 *
 * Mockea `../supabase` con un builder chainable/thenable (mismo patrón que
 * src/test/meetingsApi.test.js), dispatch por nombre de tabla.
 */
import { describe, it, expect, vi } from 'vitest'

const { mockMeetings, mockFixedTaskMarks, mockChecks, mockAvPautas, mockCnp, mockTasks, mockRpc } =
  vi.hoisted(() => ({
    mockMeetings: vi.fn(() => ({ data: [], error: null })),
    mockFixedTaskMarks: vi.fn(() => ({ data: [], error: null })),
    mockChecks: vi.fn(() => ({ data: [], error: null, count: 0 })),
    mockAvPautas: vi.fn(() => ({ data: [], error: null })),
    mockCnp: vi.fn(() => ({ data: [], error: null })),
    mockTasks: vi.fn(() => ({ data: [], error: null })),
    mockRpc: vi.fn(),
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
    rpc: (...args) => mockRpc(...args),
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
  mockRpc.mockReset()
  mockRpc.mockResolvedValue({ data: [], error: null })
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
      piezas: {
        piezas: 0,
        editadas: 0,
        porGrupo: expect.any(Object),
        cnp: { solicitudes: 0, entregados: 0 },
      },
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

  it('fixed_task_marks: company-wide, se reparte al mismo mes de todas las líneas', async () => {
    resetMocks()
    // La marca de 'c1' quedó con line_id 'B' (quien la marcó antes del cambio de línea),
    // pero la cuenta hoy es de 'A'. Repartir por mes en vez de agrupar por line_id es lo
    // que deja que computeProductividad la sume en 'A' al acotar por client_id.
    mockFixedTaskMarks.mockReturnValue({
      data: [
        {
          id: 1,
          line_id: 'B',
          period_month: 8,
          client_id: 'c1',
          task_key: 'metricas',
          period_week: 1,
          status: 'si',
        },
        {
          id: 2,
          line_id: 'B',
          period_month: 9,
          client_id: 'c2',
          task_key: 'metricas',
          period_week: 1,
          status: 'si',
        },
      ],
      error: null,
      count: 2,
    })
    const { data } = await loadReportSources('co1', {
      year: 2026,
      months: [8, 9],
      lineIds: ['A', 'B'],
    })
    expect(data['A__8'].fixedTaskMarks.map((m) => m.id)).toEqual([1])
    expect(data['B__8'].fixedTaskMarks.map((m) => m.id)).toEqual([1])
    expect(data['A__9'].fixedTaskMarks.map((m) => m.id)).toEqual([2])
    expect(data['B__9'].fixedTaskMarks.map((m) => m.id)).toEqual([2])
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

  it('cnp_requests: los CNP de audiovisual van como fuente aparte, sin mezclarse con las piezas de las pautas', async () => {
    resetMocks()
    mockAvPautas.mockReturnValue({
      data: [
        {
          line_id: 'A',
          client_id: 'c1',
          pauta_date: '2026-09-10',
          status: 'realizada',
          formats: ['V'],
          piezas_totales: 4,
          piezas_editadas: 2,
          piezas_por_formato: null,
        },
      ],
      error: null,
    })
    mockCnp.mockReturnValue({
      data: [
        { line_id: 'A', status: 'Terminado', pieces: [], created_at: SEP_15, is_audiovisual: true },
        {
          line_id: 'A',
          status: 'Terminado',
          pieces: [],
          created_at: SEP_15,
          is_audiovisual: false,
        },
        { line_id: 'B', status: 'Terminado', pieces: [], created_at: SEP_15, is_audiovisual: true },
      ],
      error: null,
    })
    const { data } = await loadReportSources('co1', {
      year: 2026,
      months: [8, 9],
      lineIds: ['A', 'B'],
    })
    // A: las pautas siguen en 4/2; el CNP audiovisual (el de diseño no cuenta) es su propia fuente.
    expect(data['A__9'].piezas).toMatchObject({
      piezas: 4,
      editadas: 2,
      cnp: { solicitudes: 1, entregados: 1 },
    })
    // B: sin pautas, solo el CNP audiovisual.
    expect(data['B__9'].piezas).toMatchObject({
      piezas: 0,
      editadas: 0,
      cnp: { solicitudes: 1, entregados: 1 },
    })
    // «4. Solicitudes» sigue contando todos los CNP de la línea.
    expect(data['A__9'].cnpSolicitudes.solicitudes).toBe(2)
    // Otro mes: nada.
    expect(data['A__8'].piezas.cnp).toEqual({ solicitudes: 0, entregados: 0 })
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

// ─── Piezas: lo editado al último día del mes (desde noviembre 2026) ────────

describe('loadReportSources — editadas al último día del mes', () => {
  const pauta = (id, line_id, pauta_date, salieron, over = {}) => ({
    id,
    line_id,
    client_id: `c-${id}`,
    pauta_date,
    deleted_at: null,
    status: 'realizada',
    formats: ['V'],
    piezas_totales: salieron,
    piezas_editadas: salieron,
    // Contador vivo: hoy dice que todo está editado.
    piezas_por_formato: { V: { salieron, editadas: salieron } },
    ...over,
  })
  const lote = (pauta_id, listas) => ({
    pieza_id: `${pauta_id}-lote`,
    pauta_id,
    formato: 'V',
    listas,
  })
  // La RPC responde según la fecha pedida: { '2026-11-30': [...], '2026-12-31': [...] }.
  const rpcPorFecha = (porFecha) =>
    mockRpc.mockImplementation(async (_fn, { p_fecha }) => ({
      data: porFecha[p_fecha] ?? [],
      error: null,
    }))
  const run = (months, lineIds = ['A'], year = 2026) =>
    loadReportSources('co1', { year, months, lineIds })

  it('noviembre: editadas sale del historial al 30-nov, no del contador vivo', async () => {
    resetMocks()
    mockAvPautas.mockReturnValue({ data: [pauta('p1', 'A', '2026-11-05', 4)], error: null })
    rpcPorFecha({ '2026-11-30': [lote('p1', 1)] })

    const { data, error } = await run([11])

    expect(error).toBeNull()
    expect(mockRpc).toHaveBeenCalledTimes(1)
    expect(mockRpc).toHaveBeenCalledWith('av_lotes_listas_a_fecha', {
      p_pauta_ids: ['p1'],
      p_fecha: '2026-11-30',
    })
    expect(data['A__11'].piezas.piezas).toBe(4)
    expect(data['A__11'].piezas.editadas).toBe(1)
    expect(data['A__11'].piezas.pendientesPrevios).toEqual({
      piezas: 0,
      editadas: 0,
      pendientes: 0,
    })
  })

  it('noviembre y diciembre: una llamada por mes, cada una a su último día', async () => {
    resetMocks()
    mockAvPautas.mockReturnValue({
      data: [pauta('nov', 'A', '2026-11-20', 5), pauta('dic', 'A', '2026-12-03', 4)],
      error: null,
    })
    rpcPorFecha({
      '2026-11-30': [lote('nov', 1)],
      '2026-12-31': [lote('nov', 3), lote('dic', 2)],
    })

    const { data } = await run([11, 12])

    expect(mockRpc).toHaveBeenCalledTimes(2)
    const fechas = mockRpc.mock.calls.map((c) => c[1].p_fecha).sort()
    expect(fechas).toEqual(['2026-11-30', '2026-12-31'])
    // Noviembre queda como estaba al 30-nov (1 de 5), aunque en diciembre se editaron más.
    expect(data['A__11'].piezas).toMatchObject({ piezas: 5, editadas: 1 })
    // Diciembre cuenta solo lo grabado en diciembre…
    expect(data['A__12'].piezas).toMatchObject({ piezas: 4, editadas: 2 })
    // …y lo de noviembre sin editar al 31-dic va aparte, solo informativo.
    expect(data['A__12'].piezas.pendientesPrevios).toEqual({
      piezas: 5,
      editadas: 3,
      pendientes: 2,
    })
  })

  it('la llamada de noviembre no manda las pautas de diciembre', async () => {
    resetMocks()
    mockAvPautas.mockReturnValue({
      data: [pauta('nov', 'A', '2026-11-20', 5), pauta('dic', 'A', '2026-12-03', 4)],
      error: null,
    })
    await run([11, 12])
    const nov = mockRpc.mock.calls.find((c) => c[1].p_fecha === '2026-11-30')[1]
    const dic = mockRpc.mock.calls.find((c) => c[1].p_fecha === '2026-12-31')[1]
    expect(nov.p_pauta_ids).toEqual(['nov'])
    expect([...dic.p_pauta_ids].sort()).toEqual(['dic', 'nov'])
  })

  it('pidiendo solo diciembre igual trae las pautas de noviembre (límite inferior = 1-nov)', async () => {
    resetMocks()
    mockAvPautas.mockReturnValue({ data: [pauta('nov', 'A', '2026-11-20', 5)], error: null })
    rpcPorFecha({ '2026-12-31': [lote('nov', 2)] })

    const { data } = await run([12])
    const { supabase } = await import('../supabase')
    const i = supabase.from.mock.calls.map((c) => c[0]).lastIndexOf('av_pautas')
    expect(supabase.from.mock.results[i].value.gte.mock.calls[0]).toEqual([
      'pauta_date',
      '2026-11-01',
    ])

    expect(data['A__12'].piezas).toMatchObject({ piezas: 0, editadas: 0 })
    expect(data['A__12'].piezas.pendientesPrevios).toEqual({
      piezas: 5,
      editadas: 2,
      pendientes: 3,
    })
  })

  it('«Nº Pautas» (indicador 5) no cambia: las previas no cuentan y las de la Papelera sí', async () => {
    resetMocks()
    mockAvPautas.mockReturnValue({
      data: [
        pauta('nov', 'A', '2026-11-20', 5),
        pauta('dic1', 'A', '2026-12-03', 4),
        pauta('dic2', 'A', '2026-12-04', 2, { deleted_at: '2026-12-05T00:00:00Z' }),
      ],
      error: null,
    })
    const { data } = await run([12])
    expect(data['A__12'].pautasByClient).toEqual({ 'c-dic1': 1, 'c-dic2': 1 })
  })

  it('las pautas de la Papelera no cuentan en piezas ni se mandan a la RPC', async () => {
    resetMocks()
    mockAvPautas.mockReturnValue({
      data: [
        pauta('p1', 'A', '2026-11-05', 4),
        pauta('p2', 'A', '2026-11-06', 9, { deleted_at: '2026-11-10T00:00:00Z' }),
      ],
      error: null,
    })
    rpcPorFecha({ '2026-11-30': [lote('p1', 4)] })
    const { data } = await run([11])
    expect(data['A__11'].piezas.piezas).toBe(4)
    expect(mockRpc.mock.calls[0][1].p_pauta_ids).toEqual(['p1'])
  })

  it('separa por línea: los pendientes de una línea no se mezclan con los de otra', async () => {
    resetMocks()
    mockAvPautas.mockReturnValue({
      data: [pauta('nA', 'A', '2026-11-20', 5), pauta('nB', 'B', '2026-11-21', 8)],
      error: null,
    })
    rpcPorFecha({ '2026-12-31': [lote('nA', 5), lote('nB', 2)] })
    const { data } = await run([12], ['A', 'B'])
    expect(data['A__12'].piezas.pendientesPrevios.pendientes).toBe(0)
    expect(data['B__12'].piezas.pendientesPrevios.pendientes).toBe(6)
  })

  it('si la RPC falla en un mes, solo ese mes lleva el error (sin error global)', async () => {
    resetMocks()
    mockAvPautas.mockReturnValue({
      data: [pauta('nov', 'A', '2026-11-20', 5), pauta('dic', 'A', '2026-12-03', 4)],
      error: null,
    })
    mockRpc.mockImplementation(async (_fn, { p_fecha }) =>
      p_fecha === '2026-12-31'
        ? { data: null, error: { message: 'boom' } }
        : { data: [lote('nov', 2)], error: null },
    )
    const { data, error } = await run([11, 12])
    expect(error).toBeNull()
    expect(data['A__11'].piezas.error).toBeUndefined()
    expect(data['A__11'].piezas.editadas).toBe(2)
    expect(data['A__12'].piezas.error).toEqual({ message: 'boom' })
    expect(data['A__12'].piezas.pendientesPrevios).toBeNull()
  })

  it('sin pautas no llama a la RPC', async () => {
    resetMocks()
    const { data } = await run([11])
    expect(mockRpc).not.toHaveBeenCalled()
    expect(data['A__11'].piezas.piezas).toBe(0)
  })

  it('meses anteriores a noviembre: sin RPC y con la forma de siempre (contador vivo)', async () => {
    resetMocks()
    mockAvPautas.mockReturnValue({ data: [pauta('p1', 'A', '2026-10-10', 6)], error: null })
    const { data } = await run([10])
    expect(mockRpc).not.toHaveBeenCalled()
    expect(data['A__10'].piezas.editadas).toBe(6)
    expect(data['A__10'].piezas).not.toHaveProperty('pendientesPrevios')
  })

  it('octubre y noviembre juntos: solo noviembre usa la regla nueva', async () => {
    resetMocks()
    mockAvPautas.mockReturnValue({
      data: [pauta('oct', 'A', '2026-10-10', 6), pauta('nov', 'A', '2026-11-10', 4)],
      error: null,
    })
    rpcPorFecha({ '2026-11-30': [lote('nov', 1)] })
    const { data } = await run([10, 11])
    expect(mockRpc).toHaveBeenCalledTimes(1)
    expect(data['A__10'].piezas.editadas).toBe(6)
    expect(data['A__11'].piezas.editadas).toBe(1)
    // Octubre no entra a los pendientes: la regla cuenta solo lo grabado desde noviembre.
    expect(data['A__11'].piezas.pendientesPrevios.piezas).toBe(0)
  })

  it('enero 2027 cruza el año: fecha 2027-01-31 y trae desde el 1-nov-2026', async () => {
    resetMocks()
    mockAvPautas.mockReturnValue({ data: [pauta('nov', 'A', '2026-11-20', 3)], error: null })
    rpcPorFecha({ '2027-01-31': [lote('nov', 3)] })
    const { data } = await run([1], ['A'], 2027)
    expect(mockRpc.mock.calls[0][1].p_fecha).toBe('2027-01-31')
    expect(data['A__1'].piezas.pendientesPrevios).toEqual({ piezas: 3, editadas: 3, pendientes: 0 })
  })
})
