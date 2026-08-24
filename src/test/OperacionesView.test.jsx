/**
 * Tests de OperacionesView — sección "3. Crecimiento de seguidores".
 * Cubre la columna "Inversión Ads": suma automática de paid_campaigns por
 * cliente/mes (según start_date), estado vacío en $0.00, que campañas de
 * otro mes no se cuenten, y el "/ presupuesto" tomado de campaign_budget.
 */
import { render, screen, waitFor, fireEvent, within } from '@testing-library/react'
import { vi } from 'vitest'

const { MOCK_CLIENTS } = vi.hoisted(() => ({
  MOCK_CLIENTS: [
    { id: 'c-1', name: 'Banco Exterior', logo_url: null, deleted_at: null, campaign_budget: 200 },
    { id: 'c-2', name: 'Pepsi', logo_url: null, deleted_at: null, campaign_budget: null },
  ],
}))

function makeReportData() {
  return {
    reuniones: { realizadas: 10, meta: 15, comentario: null },
    productividad: { tareas: [] },
    crecimiento: {
      items: [
        {
          clienteId: 'c-1',
          seguidoresGanados: 100,
          seguidoresGanadosPrev: 50,
          seguidoresActuales: 500,
          seguidoresBase: 400,
          meta: 80,
        },
        {
          clienteId: 'c-2',
          seguidoresGanados: 20,
          seguidoresGanadosPrev: 10,
          seguidoresActuales: 220,
          seguidoresBase: 200,
          meta: 50,
        },
      ],
    },
    solicitudes: { solicitudes: 0, editadas: 0 },
    pautas: { items: [] },
    piezas: { piezas: 0, editadas: 0 },
    feedback: { items: [] },
    finanzas: { ingresos: [], gastosOperativos: [], sueldos: [], otrosGastos: [] },
  }
}

const mockLoadReport = vi.fn()
const mockLoadPrevReport = vi.fn()
const mockLoadClients = vi.fn()
const mockLoadCompanyEmployees = vi.fn()
const mockUpsertReport = vi.fn()
const mockLoadAds = vi.fn()
const mockCountMeetingsHeldForLine = vi.fn()
const mockLoadHeldClientIdsForLine = vi.fn()
const mockLoadFixedTaskMarks = vi.fn()
const mockLoadChecks = vi.fn()

vi.mock('../components/metricas/metricsApi', () => ({
  loadReport: (...a) => mockLoadReport(...a),
  loadPrevReport: (...a) => mockLoadPrevReport(...a),
  loadClients: (...a) => mockLoadClients(...a),
  loadCompanyEmployees: (...a) => mockLoadCompanyEmployees(...a),
  upsertReport: (...a) => mockUpsertReport(...a),
  loadFixedTaskMarks: (...a) => mockLoadFixedTaskMarks(...a),
}))

vi.mock('../components/chequeo/chequeoApi', () => ({
  loadChecks: (...a) => mockLoadChecks(...a),
}))

vi.mock('../components/ads/campaignSpendApi', async () => {
  const actual = await vi.importActual('../components/ads/campaignSpendApi')
  return {
    ...actual,
    loadAds: (...a) => mockLoadAds(...a),
  }
})

vi.mock('../components/reuniones/meetingsApi', () => ({
  countMeetingsHeldForLine: (...a) => mockCountMeetingsHeldForLine(...a),
  loadHeldClientIdsForLine: (...a) => mockLoadHeldClientIdsForLine(...a),
}))

vi.mock('../context/AuthContext', () => ({
  useAuth: () => ({ can: () => true }),
}))

import OperacionesView from '../components/metricas/OperacionesView'

const LINE = { id: 'line-1', name: 'Georgina', member_user_ids: [], metas: {} }

function renderView(props = {}) {
  return render(<OperacionesView line={LINE} companyId="co-1" year={2026} month={7} {...props} />)
}

// Default sin celdas de Chequeo — vi.clearAllMocks() (usado en los beforeEach de cada
// describe) limpia calls/results pero no la implementación, así que este default
// sobrevive salvo que un test lo pise explícitamente con mockLoadChecks.mockResolvedValue(...).
mockLoadChecks.mockResolvedValue({ data: [], error: null })

describe('OperacionesView — columna Inversión Ads (Crecimiento de seguidores)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockLoadReport.mockResolvedValue({ data: { data: makeReportData() }, error: null })
    mockLoadPrevReport.mockResolvedValue({ data: null, error: null })
    mockLoadClients.mockResolvedValue({ data: MOCK_CLIENTS, error: null })
    mockLoadCompanyEmployees.mockResolvedValue({ data: [], error: null })
    mockUpsertReport.mockResolvedValue({ data: null, error: null })
    mockCountMeetingsHeldForLine.mockResolvedValue({ count: 0, error: null })
    mockLoadHeldClientIdsForLine.mockResolvedValue({ clientIds: [], error: null })
    mockLoadFixedTaskMarks.mockResolvedValue({ data: [], error: null })
    mockLoadAds.mockResolvedValue({ data: [], error: null })
  })

  it('muestra la suma de campañas del cliente cuyo start_date cae en el mes del reporte', async () => {
    mockLoadAds.mockResolvedValue({
      data: [
        {
          id: 'ad-1',
          client_id: 'c-1',
          amount: 80,
          start_date: '2026-07-05',
          end_date: '2026-07-15',
        },
        {
          id: 'ad-2',
          client_id: 'c-1',
          amount: 45.5,
          start_date: '2026-07-20',
          end_date: '2026-07-25',
        },
      ],
      error: null,
    })
    renderView()
    await waitFor(() => {
      expect(screen.getByText('Guardar reporte')).toBeInTheDocument()
    })
    expect(await screen.findByText('$125.50')).toBeInTheDocument()
  })

  it('muestra el presupuesto del cliente (campaign_budget) junto al gasto, en fuente más pequeña', async () => {
    mockLoadAds.mockResolvedValue({
      data: [
        {
          id: 'ad-1',
          client_id: 'c-1',
          amount: 80,
          start_date: '2026-07-05',
          end_date: '2026-07-15',
        },
      ],
      error: null,
    })
    renderView()
    await waitFor(() => {
      expect(screen.getByText('Guardar reporte')).toBeInTheDocument()
    })
    const spentEl = await screen.findByText('$80.00')
    const budgetEl = await screen.findByText('/ $200.00')
    expect(spentEl).toBeInTheDocument()
    expect(budgetEl).toBeInTheDocument()
    expect(spentEl.className).toContain('text-[13px]')
    expect(budgetEl.className).toContain('text-[10px]')
    // Pepsi no tiene campaign_budget configurado → no debe mostrar el "/ total"
    expect(screen.queryByText('/ $0.00')).not.toBeInTheDocument()
  })

  it('muestra $0.00 cuando el cliente no tiene campañas ese mes', async () => {
    mockLoadAds.mockResolvedValue({ data: [], error: null })
    renderView()
    await waitFor(() => {
      expect(screen.getByText('Guardar reporte')).toBeInTheDocument()
    })
    // Un $0.00 por cada cliente sin pauta en la columna Inversión Ads (Banco Exterior y Pepsi)
    const zeros = await screen.findAllByText('$0.00')
    expect(zeros.length).toBeGreaterThanOrEqual(2)
  })

  it('no cuenta campañas cuyo start_date cae en otro mes', async () => {
    mockLoadAds.mockResolvedValue({
      data: [
        {
          id: 'ad-3',
          client_id: 'c-1',
          amount: 999,
          start_date: '2026-06-15',
          end_date: '2026-06-20',
        },
      ],
      error: null,
    })
    renderView()
    await waitFor(() => {
      expect(screen.getByText('Guardar reporte')).toBeInTheDocument()
    })
    expect(screen.queryByText('$999.00')).not.toBeInTheDocument()
    const zeros = await screen.findAllByText('$0.00')
    expect(zeros.length).toBeGreaterThanOrEqual(2)
  })
})

describe('OperacionesView — "Reuniones realizadas" (solo lectura, siempre derivado del módulo Reuniones)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockLoadPrevReport.mockResolvedValue({ data: null, error: null })
    mockLoadClients.mockResolvedValue({ data: MOCK_CLIENTS, error: null })
    mockLoadCompanyEmployees.mockResolvedValue({ data: [], error: null })
    mockUpsertReport.mockResolvedValue({ data: null, error: null })
    mockLoadAds.mockResolvedValue({ data: [], error: null })
    mockLoadHeldClientIdsForLine.mockResolvedValue({ clientIds: [], error: null })
  })

  it('sobreescribe el valor guardado con el conteo automático (ya no hay override manual)', async () => {
    // El reporte guardado tiene realizadas=10; el conteo automático (clientes distintos
    // con reunión realizada, máx. 1 por cliente) da 5 — debe prevalecer el derivado.
    mockLoadReport.mockResolvedValue({ data: { data: makeReportData() }, error: null })
    mockCountMeetingsHeldForLine.mockResolvedValue({ count: 5, error: null })
    renderView()
    await waitFor(() => {
      expect(screen.getByText('Guardar reporte')).toBeInTheDocument()
    })
    const realizadasInput = document.querySelectorAll('input[type="number"]')[0]
    expect(realizadasInput.value).toBe('5')
  })

  it('siembra "realizadas" con el conteo automático cuando el reporte no tiene valor guardado', async () => {
    const data = makeReportData()
    data.reuniones.realizadas = null
    mockLoadReport.mockResolvedValue({ data: { data }, error: null })
    mockCountMeetingsHeldForLine.mockResolvedValue({ count: 7, error: null })
    renderView()
    await waitFor(() => {
      expect(screen.getByText('Guardar reporte')).toBeInTheDocument()
    })
    const realizadasInput = document.querySelectorAll('input[type="number"]')[0]
    expect(realizadasInput.value).toBe('7')
  })

  it('siembra "realizadas" con el conteo automático en un reporte nuevo (sin fila previa)', async () => {
    mockLoadReport.mockResolvedValue({ data: null, error: null })
    mockCountMeetingsHeldForLine.mockResolvedValue({ count: 3, error: null })
    renderView()
    await waitFor(() => {
      expect(screen.getByText('Guardar reporte')).toBeInTheDocument()
    })
    const realizadasInput = document.querySelectorAll('input[type="number"]')[0]
    expect(realizadasInput.value).toBe('3')
  })

  it('el input de "Realizadas" es de solo lectura y ya no existe el botón "usar automático"', async () => {
    mockLoadReport.mockResolvedValue({ data: { data: makeReportData() }, error: null })
    mockCountMeetingsHeldForLine.mockResolvedValue({ count: 10, error: null })
    renderView()
    await waitFor(() => {
      expect(screen.getByText('Guardar reporte')).toBeInTheDocument()
    })
    const realizadasInput = document.querySelectorAll('input[type="number"]')[0]
    expect(realizadasInput).toBeDisabled()
    expect(screen.queryByText(/usar automático/)).not.toBeInTheDocument()
  })
})

describe('OperacionesView — meses previos al módulo Reuniones conservan el valor histórico', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockLoadPrevReport.mockResolvedValue({ data: null, error: null })
    mockLoadClients.mockResolvedValue({ data: MOCK_CLIENTS, error: null })
    mockLoadCompanyEmployees.mockResolvedValue({ data: [], error: null })
    mockUpsertReport.mockResolvedValue({ data: null, error: null })
    mockLoadAds.mockResolvedValue({ data: [], error: null })
    mockLoadHeldClientIdsForLine.mockResolvedValue({ clientIds: [], error: null })
  })

  it('junio 2026 (previo al módulo Reuniones) conserva el valor guardado en vez de pisarlo con el conteo automático (0)', async () => {
    // El reporte de junio tiene 10 reuniones guardadas manualmente antes del módulo.
    // El módulo Reuniones no existía en junio → el conteo automático da 0.
    mockLoadReport.mockResolvedValue({ data: { data: makeReportData() }, error: null })
    mockCountMeetingsHeldForLine.mockResolvedValue({ count: 0, error: null })
    renderView({ month: 6 })
    await waitFor(() => {
      expect(screen.getByText('Guardar reporte')).toBeInTheDocument()
    })
    const realizadasInput = document.querySelectorAll('input[type="number"]')[0]
    expect(realizadasInput.value).toBe('10')
  })

  it('julio 2026 (mes de lanzamiento del módulo, inclusive) sí usa el conteo automático', async () => {
    mockLoadReport.mockResolvedValue({ data: { data: makeReportData() }, error: null })
    mockCountMeetingsHeldForLine.mockResolvedValue({ count: 4, error: null })
    renderView({ month: 7 })
    await waitFor(() => {
      expect(screen.getByText('Guardar reporte')).toBeInTheDocument()
    })
    const realizadasInput = document.querySelectorAll('input[type="number"]')[0]
    expect(realizadasInput.value).toBe('4')
  })
})

describe('OperacionesView — "Productividad – Tareas Fijas" antes del lanzamiento del módulo (< sept. 2026) sigue siendo manual', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockLoadPrevReport.mockResolvedValue({ data: null, error: null })
    mockLoadClients.mockResolvedValue({ data: MOCK_CLIENTS, error: null })
    mockLoadCompanyEmployees.mockResolvedValue({ data: [], error: null })
    mockUpsertReport.mockResolvedValue({ data: null, error: null })
    mockLoadAds.mockResolvedValue({ data: [], error: null })
    mockCountMeetingsHeldForLine.mockResolvedValue({ count: 0, error: null })
    mockLoadHeldClientIdsForLine.mockResolvedValue({ clientIds: [], error: null })
    mockLoadFixedTaskMarks.mockResolvedValue({ data: [], error: null })
  })

  it('agosto 2026 (previo a septiembre): las tareas guardadas a mano se pueden editar y agregar', async () => {
    const data = makeReportData()
    data.productividad.tareas = [{ nombre: 'Grillas Redes→Diseño', realizado: 3, meta: 4 }]
    mockLoadReport.mockResolvedValue({ data: { data }, error: null })
    renderView({ month: 8 })
    await waitFor(() => {
      expect(screen.getByText('Guardar reporte')).toBeInTheDocument()
    })
    const nombreInput = screen.getByDisplayValue('Grillas Redes→Diseño')
    expect(nombreInput).not.toBeDisabled()
    fireEvent.change(nombreInput, { target: { value: 'Grillas editado' } })
    expect(screen.getByDisplayValue('Grillas editado')).toBeInTheDocument()
    expect(screen.getByText('Agregar tarea')).toBeInTheDocument()
  })

  it('septiembre 2026 (lanzamiento del módulo, inclusive): las tareas quedan de solo lectura', async () => {
    const data = makeReportData()
    data.productividad.tareas = [{ nombre: 'Grillas Redes→Diseño', realizado: 3, meta: 4 }]
    mockLoadReport.mockResolvedValue({ data: { data }, error: null })
    renderView({ month: 9 })
    await waitFor(() => {
      expect(screen.getByText('Guardar reporte')).toBeInTheDocument()
    })
    // Al ser la era del módulo, computeProductividad deriva las 4 tareas de TASK_KEYS +
    // la fila "Actualización de Plataformas" (derivada de Chequeo, ver
    // CHEQUEO_PRODUCTIVIDAD_START) en vez de conservar la fila guardada a mano.
    const section = screen.getByText('2. Productividad – Tareas Fijas').closest('div.space-y-3')
    const nombreInputs = within(section).getAllByRole('textbox')
    expect(nombreInputs.length).toBeGreaterThan(0)
    nombreInputs.forEach((input) => expect(input).toBeDisabled())
    expect(within(section).queryByText('Agregar tarea')).not.toBeInTheDocument()
  })

  it('agrega la fila "Actualización de Plataformas" derivada de la grilla de Chequeo del mes', async () => {
    const data = makeReportData()
    mockLoadReport.mockResolvedValue({ data: { data }, error: null })
    // c-1 tiene Instagram (social_links) → 3 celdas aplicables (publicaciones/reels/highlights)
    // × 5 semanas de septiembre 2026 (buildFixedWeeks) = meta 15. Una celda con fecha en
    // una semana → real 1.
    mockLoadClients.mockResolvedValue({
      data: [
        { ...MOCK_CLIENTS[0], social_links: [{ red: 'Instagram', link: '' }] },
        MOCK_CLIENTS[1],
      ],
      error: null,
    })
    mockLoadChecks.mockResolvedValueOnce({
      data: [
        {
          client_id: 'c-1',
          network: 'Instagram',
          content_type: 'publicaciones',
          last_published_at: '2026-09-05',
          period_year: 2026,
          period_month: 9,
          period_week: 1,
        },
      ],
      error: null,
    })
    renderView({ month: 9 })
    await waitFor(() => {
      expect(screen.getByText('2. Productividad – Tareas Fijas')).toBeInTheDocument()
    })
    const section = screen.getByText('2. Productividad – Tareas Fijas').closest('div.space-y-3')
    expect(within(section).getByDisplayValue('Actualización de Plataformas')).toBeInTheDocument()
    // "Real" y "Meta" de esa fila son los últimos inputs de la sección.
    const numberInputs = within(section).getAllByRole('spinbutton')
    expect(numberInputs.at(-2).value).toBe('1') // real
    expect(numberInputs.at(-1).value).toBe('15') // meta
  })
})

describe('OperacionesView — reporte cerrado (prop "closed")', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockLoadPrevReport.mockResolvedValue({ data: null, error: null })
    mockLoadClients.mockResolvedValue({ data: MOCK_CLIENTS, error: null })
    mockLoadCompanyEmployees.mockResolvedValue({ data: [], error: null })
    mockUpsertReport.mockResolvedValue({ data: null, error: null })
    mockLoadAds.mockResolvedValue({ data: [], error: null })
    mockLoadHeldClientIdsForLine.mockResolvedValue({ clientIds: [], error: null })
  })

  it('conserva "realizadas" guardado sin recalcular, aunque el mes esté en la era del módulo Reuniones', async () => {
    mockLoadReport.mockResolvedValue({ data: { data: makeReportData() }, error: null })
    mockCountMeetingsHeldForLine.mockResolvedValue({ count: 999, error: null })
    renderView({ month: 7, closed: true })
    await waitFor(() => {
      expect(screen.getByText('Guardar reporte')).toBeInTheDocument()
    })
    const realizadasInput = document.querySelectorAll('input[type="number"]')[0]
    expect(realizadasInput.value).toBe('10')
  })

  it('deshabilita todos los inputs del reporte', async () => {
    mockLoadReport.mockResolvedValue({ data: { data: makeReportData() }, error: null })
    mockCountMeetingsHeldForLine.mockResolvedValue({ count: 0, error: null })
    renderView({ month: 7, closed: true })
    await waitFor(() => {
      expect(screen.getByText('Guardar reporte')).toBeInTheDocument()
    })
    const inputs = document.querySelectorAll('input, textarea')
    expect(inputs.length).toBeGreaterThan(0)
    inputs.forEach((input) => expect(input).toBeDisabled())
  })

  it('deshabilita el botón "Guardar reporte"', async () => {
    mockLoadReport.mockResolvedValue({ data: { data: makeReportData() }, error: null })
    mockCountMeetingsHeldForLine.mockResolvedValue({ count: 0, error: null })
    renderView({ month: 7, closed: true })
    await waitFor(() => {
      expect(screen.getByText('Guardar reporte')).toBeInTheDocument()
    })
    expect(screen.getByText('Guardar reporte')).toBeDisabled()
  })
})

describe('OperacionesView — meta de reuniones topada a la cantidad de marcas activas', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockLoadPrevReport.mockResolvedValue({ data: null, error: null })
    mockLoadClients.mockResolvedValue({ data: MOCK_CLIENTS, error: null }) // 2 marcas activas
    mockLoadCompanyEmployees.mockResolvedValue({ data: [], error: null })
    mockUpsertReport.mockResolvedValue({ data: null, error: null })
    mockLoadAds.mockResolvedValue({ data: [], error: null })
    mockCountMeetingsHeldForLine.mockResolvedValue({ count: 0, error: null })
    mockLoadHeldClientIdsForLine.mockResolvedValue({ clientIds: [], error: null })
    mockLoadFixedTaskMarks.mockResolvedValue({ data: [], error: null })
  })

  it('clampa un valor tipeado por encima de la cantidad de marcas activas', async () => {
    mockLoadReport.mockResolvedValue({ data: { data: makeReportData() }, error: null })
    renderView()
    await waitFor(() => {
      expect(screen.getByText('Guardar reporte')).toBeInTheDocument()
    })
    const metaInput = document.querySelectorAll('input[type="number"]')[1]
    fireEvent.change(metaInput, { target: { value: '9' } })
    expect(metaInput.value).toBe('2') // MOCK_CLIENTS tiene 2 marcas
  })

  it('permite un valor dentro del límite', async () => {
    mockLoadReport.mockResolvedValue({ data: { data: makeReportData() }, error: null })
    renderView()
    await waitFor(() => {
      expect(screen.getByText('Guardar reporte')).toBeInTheDocument()
    })
    const metaInput = document.querySelectorAll('input[type="number"]')[1]
    fireEvent.change(metaInput, { target: { value: '1' } })
    expect(metaInput.value).toBe('1')
  })

  it('muestra el hint con el máximo permitido', async () => {
    mockLoadReport.mockResolvedValue({ data: { data: makeReportData() }, error: null })
    renderView()
    await waitFor(() => {
      expect(screen.getByText('Guardar reporte')).toBeInTheDocument()
    })
    expect(screen.getByText('Máx. 2 (1 por marca activa de la línea)')).toBeInTheDocument()
  })
})

describe('OperacionesView — meses pasados congelados no reconcilian contra el roster actual', () => {
  // Fija "hoy" en 2026-07-17 para que julio 2026 sea el mes en curso y junio 2026
  // sea un mes pasado, sin depender de la fecha real del sistema al correr el test.
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    vi.setSystemTime(new Date('2026-07-17T12:00:00'))
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  const CLIENTES_ROSTER = [
    { id: 'c-1', name: 'Banco Exterior', logo_url: null, deleted_at: null, campaign_budget: 200 },
    // Se dio de baja el 20 de junio: en junio estuvo activa, en julio ya no.
    {
      id: 'c-2',
      name: 'Marca Archivada',
      logo_url: null,
      deleted_at: '2026-06-20T00:00:00Z',
      campaign_budget: null,
    },
    // Se agregó recién ahora: no existía cuando se guardó el reporte de junio.
    { id: 'c-3', name: 'Marca Nueva', logo_url: null, deleted_at: null, campaign_budget: null },
  ]

  function reportSavedInJune() {
    // Snapshot tal como habría quedado guardado en junio: solo c-1 y c-2 (c-3 no existía).
    const data = makeReportData()
    data.crecimiento.items = [
      {
        clienteId: 'c-1',
        seguidoresGanados: 100,
        seguidoresGanadosPrev: 50,
        seguidoresActuales: 500,
        seguidoresBase: 400,
        meta: 80,
      },
      {
        clienteId: 'c-2',
        seguidoresGanados: 20,
        seguidoresGanadosPrev: 10,
        seguidoresActuales: 220,
        seguidoresBase: 200,
        meta: 50,
      },
    ]
    return data
  }

  beforeEach(() => {
    vi.clearAllMocks()
    mockLoadPrevReport.mockResolvedValue({ data: null, error: null })
    mockLoadClients.mockResolvedValue({ data: CLIENTES_ROSTER, error: null })
    mockLoadCompanyEmployees.mockResolvedValue({ data: [], error: null })
    mockUpsertReport.mockResolvedValue({ data: null, error: null })
    mockLoadAds.mockResolvedValue({ data: [], error: null })
    mockCountMeetingsHeldForLine.mockResolvedValue({ count: 0, error: null })
    mockLoadHeldClientIdsForLine.mockResolvedValue({ clientIds: [], error: null })
    mockLoadFixedTaskMarks.mockResolvedValue({ data: [], error: null })
    mockLoadReport.mockResolvedValue({ data: { data: reportSavedInJune() }, error: null })
  })

  it('junio (mes pasado): conserva a la marca archivada y NO agrega a la marca nueva', async () => {
    renderView({ month: 6 })
    await waitFor(() => {
      expect(screen.getByText('Guardar reporte')).toBeInTheDocument()
    })
    expect(await screen.findByText('Marca Archivada')).toBeInTheDocument()
    expect(screen.queryByText('Marca Nueva')).not.toBeInTheDocument()
  })

  it('julio (mes en curso): descarta a la marca archivada en junio y agrega a la marca nueva', async () => {
    renderView({ month: 7 })
    await waitFor(() => {
      expect(screen.getByText('Guardar reporte')).toBeInTheDocument()
    })
    expect((await screen.findAllByText('Marca Nueva')).length).toBeGreaterThan(0)
    expect(screen.queryByText('Marca Archivada')).not.toBeInTheDocument()
  })

  it('reporte cerrado en el mes en curso también queda congelado (conserva la marca archivada)', async () => {
    renderView({ month: 7, closed: true })
    await waitFor(() => {
      expect(screen.getByText('Guardar reporte')).toBeInTheDocument()
    })
    expect(await screen.findByText('Marca Archivada')).toBeInTheDocument()
    expect(screen.queryByText('Marca Nueva')).not.toBeInTheDocument()
  })

  it('junio (mes pasado): el roster de Reuniones (meta máx. y modal) también respeta el congelamiento, no la asignación de línea actual', async () => {
    // c-3 ("Marca Nueva") está asignada HOY a esta línea (mockLoadClients la incluye),
    // pero el reporte de junio guardado (crecimiento.items) solo tiene c-1 y c-2 — igual
    // que le pasaría a una cuenta movida a otra línea después de junio: no debe contar
    // como "marca de la línea" para la meta ni aparecer en el picker de justificativos.
    renderView({ month: 6 })
    await waitFor(() => {
      expect(screen.getByText('Guardar reporte')).toBeInTheDocument()
    })
    expect(await screen.findByText('Máx. 2 (1 por marca activa de la línea)')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /Ver marcas/ }))
    const heading = await screen.findByText('Cobertura de reuniones por marca')
    const modal = heading.closest('div.bg-white')
    expect(within(modal).getByText('Banco Exterior')).toBeInTheDocument()
    expect(within(modal).getByText('Marca Archivada')).toBeInTheDocument()
    expect(within(modal).queryByText('Marca Nueva')).not.toBeInTheDocument()
  })
})

describe('OperacionesView — alineación de columnas en "Crecimiento de seguidores"', () => {
  // Regresión: el encabezado (JUNIO|JULIO) y cada fila de cliente son grillas CSS
  // independientes. Si sus columnas usan tracks "auto", el ancho de cada una depende del
  // contenido de esa fila (badge "—" vs "✓ Cumple 173%", "$0.00" vs "$400.00 / $400.00"),
  // por lo que filas distintas quedan desalineadas entre sí y con el encabezado.
  beforeEach(() => {
    vi.clearAllMocks()
    mockLoadPrevReport.mockResolvedValue({ data: null, error: null })
    mockLoadClients.mockResolvedValue({ data: MOCK_CLIENTS, error: null })
    mockLoadCompanyEmployees.mockResolvedValue({ data: [], error: null })
    mockUpsertReport.mockResolvedValue({ data: null, error: null })
    mockCountMeetingsHeldForLine.mockResolvedValue({ count: 0, error: null })
    mockLoadHeldClientIdsForLine.mockResolvedValue({ clientIds: [], error: null })
    mockLoadFixedTaskMarks.mockResolvedValue({ data: [], error: null })
    mockLoadAds.mockResolvedValue({ data: [], error: null })

    const data = makeReportData()
    // c-1: badge + % (contenido "largo"). c-2: sin datos → badge "—" sin %, y sin presupuesto.
    data.crecimiento.items = [
      {
        clienteId: 'c-1',
        seguidoresGanados: 100,
        seguidoresGanadosPrev: 50,
        seguidoresActuales: 500,
        seguidoresBase: 400,
        meta: 80,
      },
      {
        clienteId: 'c-2',
        seguidoresGanados: null,
        seguidoresGanadosPrev: null,
        seguidoresActuales: null,
        seguidoresBase: null,
        meta: 50,
      },
    ]
    mockLoadReport.mockResolvedValue({ data: { data }, error: null })
  })

  it('el encabezado y todas las filas de cliente comparten el mismo grid-template-columns fijo (sin "auto")', async () => {
    renderView()
    await waitFor(() => {
      expect(screen.getByText('Guardar reporte')).toBeInTheDocument()
    })

    const sectionTitle = await screen.findByText('3. Crecimiento de seguidores')
    const section = sectionTitle.closest('div.bg-white')

    const headerCell = within(section).getByText('Julio')
    const headerGrid = headerCell.closest('div.grid')
    expect(headerGrid).toBeTruthy()
    expect(headerGrid.className).not.toContain('auto')

    const clienteRow = within(section).getByText('Banco Exterior').closest('div.grid')
    const clienteRow2 = within(section).getByText('Pepsi').closest('div.grid')
    expect(clienteRow.className).not.toContain('auto')
    expect(clienteRow2.className).not.toContain('auto')

    // Mismo template de columnas para el encabezado y ambas filas, sin importar si tienen badge+% o no.
    const gridColsOf = (cls) => cls.match(/grid-cols-\[[^\]]+\]/)?.[0]
    expect(gridColsOf(headerGrid.className)).toBeTruthy()
    expect(gridColsOf(clienteRow.className)).toBe(gridColsOf(headerGrid.className))
    expect(gridColsOf(clienteRow2.className)).toBe(gridColsOf(headerGrid.className))
  })
})

describe('OperacionesView — cuenta movida a otra línea resuelve nombre (no "[Cliente eliminado]")', () => {
  // Roster de ESTA línea: solo c-1. La cuenta c-moved ya no está aquí (se movió),
  // pero sigue existiendo company-wide en otra línea.
  const ROSTER = [
    { id: 'c-1', name: 'Banco Exterior', logo_url: null, deleted_at: null, campaign_budget: 200 },
  ]
  const COMPANY_WIDE = [
    ...ROSTER,
    {
      id: 'c-moved',
      name: 'Marca Movida',
      logo_url: null,
      deleted_at: null,
      line_id: 'other-line',
    },
  ]

  beforeEach(() => {
    vi.clearAllMocks()
    mockLoadPrevReport.mockResolvedValue({ data: null, error: null })
    // Distingue la llamada de roster (lineId != null) de la company-wide (lineId == null).
    mockLoadClients.mockImplementation((companyId, lineId) =>
      Promise.resolve({ data: lineId == null ? COMPANY_WIDE : ROSTER, error: null }),
    )
    mockLoadCompanyEmployees.mockResolvedValue({ data: [], error: null })
    mockUpsertReport.mockResolvedValue({ data: null, error: null })
    mockLoadAds.mockResolvedValue({ data: [], error: null })
    mockCountMeetingsHeldForLine.mockResolvedValue({ count: 0, error: null })
    mockLoadHeldClientIdsForLine.mockResolvedValue({ clientIds: [], error: null })
    mockLoadFixedTaskMarks.mockResolvedValue({ data: [], error: null })

    const data = makeReportData()
    data.crecimiento.items = [
      {
        clienteId: 'c-1',
        seguidoresGanados: 10,
        seguidoresGanadosPrev: 5,
        seguidoresActuales: 100,
        seguidoresBase: 90,
        meta: 20,
      },
      {
        clienteId: 'c-moved',
        seguidoresGanados: 30,
        seguidoresGanadosPrev: 20,
        seguidoresActuales: 500,
        seguidoresBase: 470,
        meta: 50,
      },
    ]
    mockLoadReport.mockResolvedValue({ data: { data }, error: null })
  })

  it('muestra el nombre de la cuenta movida y la marca "otra línea" (reporte cerrado, congelado)', async () => {
    // closed => congelado => no corre syncReportClients => el item de c-moved se conserva.
    renderView({ month: 7, closed: true })
    await waitFor(() => {
      expect(screen.getByText('Guardar reporte')).toBeInTheDocument()
    })
    expect(await screen.findByText('Marca Movida')).toBeInTheDocument()
    expect(screen.queryByText('[Cliente eliminado]')).not.toBeInTheDocument()
    expect(screen.getAllByText('· otra línea').length).toBeGreaterThan(0)
  })
})

describe('OperacionesView — modal de cobertura de reuniones por marca', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockLoadReport.mockResolvedValue({ data: { data: makeReportData() }, error: null })
    mockLoadPrevReport.mockResolvedValue({ data: null, error: null })
    mockLoadClients.mockResolvedValue({ data: MOCK_CLIENTS, error: null })
    mockLoadCompanyEmployees.mockResolvedValue({ data: [], error: null })
    mockUpsertReport.mockResolvedValue({ data: null, error: null })
    mockLoadAds.mockResolvedValue({ data: [], error: null })
    mockCountMeetingsHeldForLine.mockResolvedValue({ count: 1, error: null })
  })

  it('el botón "Ver marcas" abre el modal con check para la marca cubierta y select para la otra', async () => {
    mockLoadHeldClientIdsForLine.mockResolvedValue({ clientIds: ['c-1'], error: null })
    renderView()
    await waitFor(() => {
      expect(screen.getByText('Guardar reporte')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByRole('button', { name: /Ver marcas/ }))

    const heading = await screen.findByText('Cobertura de reuniones por marca')
    const modal = heading.closest('div.bg-white')
    expect(within(modal).getByText('1/2 marcas con reunión realizada')).toBeInTheDocument()
    expect(within(modal).getByText('Banco Exterior')).toBeInTheDocument()
    expect(within(modal).getByText('Reunión realizada')).toBeInTheDocument()
    // Pepsi (c-2) no tiene reunión → debe mostrar el select de justificativo
    expect(within(modal).getByText('Pepsi')).toBeInTheDocument()
    expect(within(modal).getByRole('combobox')).toBeInTheDocument()
  })

  it('el botón "Ver marcas" muestra la cantidad de marcas sin reunión', async () => {
    mockLoadHeldClientIdsForLine.mockResolvedValue({ clientIds: ['c-1'], error: null })
    renderView()
    await waitFor(() => {
      expect(screen.getByText('Guardar reporte')).toBeInTheDocument()
    })
    expect(screen.getByRole('button', { name: /Ver marcas \(1 sin reunión\)/ })).toBeInTheDocument()
  })

  it('elegir un justificativo lo persiste en report.reuniones.justificativos', async () => {
    mockLoadHeldClientIdsForLine.mockResolvedValue({ clientIds: ['c-1'], error: null })
    renderView()
    await waitFor(() => {
      expect(screen.getByText('Guardar reporte')).toBeInTheDocument()
    })
    fireEvent.click(screen.getByRole('button', { name: /Ver marcas/ }))
    await screen.findByText('Cobertura de reuniones por marca')

    const select = screen.getByRole('combobox')
    fireEvent.change(select, { target: { value: 'no_cumplio' } })

    await waitFor(() => {
      expect(select.value).toBe('no_cumplio')
    })

    fireEvent.click(screen.getByText('Guardar reporte'))
    await waitFor(() => {
      expect(mockUpsertReport).toHaveBeenCalledWith(
        'co-1',
        'line-1',
        2026,
        7,
        expect.objectContaining({
          reuniones: expect.objectContaining({
            justificativos: { 'c-2': 'no_cumplio' },
          }),
        }),
      )
    })
  })
})
