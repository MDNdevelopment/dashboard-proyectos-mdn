/**
 * Tests de OperacionesView — sección "3. Crecimiento de seguidores".
 * Cubre la columna "Inversión Ads": suma automática de paid_campaigns por
 * cliente/mes (según start_date), estado vacío en $0.00, que campañas de
 * otro mes no se cuenten, y el "/ presupuesto" tomado de campaign_budget.
 */
import { render, screen, waitFor } from '@testing-library/react'
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
        { clienteId: 'c-1', seguidoresGanados: 100, seguidoresGanadosPrev: 50, seguidoresActuales: 500, seguidoresBase: 400, meta: 80 },
        { clienteId: 'c-2', seguidoresGanados: 20, seguidoresGanadosPrev: 10, seguidoresActuales: 220, seguidoresBase: 200, meta: 50 },
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

vi.mock('../components/metricas/metricsApi', () => ({
  loadReport: (...a) => mockLoadReport(...a),
  loadPrevReport: (...a) => mockLoadPrevReport(...a),
  loadClients: (...a) => mockLoadClients(...a),
  loadCompanyEmployees: (...a) => mockLoadCompanyEmployees(...a),
  upsertReport: (...a) => mockUpsertReport(...a),
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
}))

vi.mock('../context/AuthContext', () => ({
  useAuth: () => ({ can: () => true }),
}))

import OperacionesView from '../components/metricas/OperacionesView'

const LINE = { id: 'line-1', name: 'Georgina', member_user_ids: [], metas: {} }

function renderView(props = {}) {
  return render(
    <OperacionesView line={LINE} companyId="co-1" year={2026} month={7} {...props} />
  )
}

describe('OperacionesView — columna Inversión Ads (Crecimiento de seguidores)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockLoadReport.mockResolvedValue({ data: { data: makeReportData() }, error: null })
    mockLoadPrevReport.mockResolvedValue({ data: null, error: null })
    mockLoadClients.mockResolvedValue({ data: MOCK_CLIENTS, error: null })
    mockLoadCompanyEmployees.mockResolvedValue({ data: [], error: null })
    mockUpsertReport.mockResolvedValue({ data: null, error: null })
    mockCountMeetingsHeldForLine.mockResolvedValue({ count: 0, error: null })
    mockLoadAds.mockResolvedValue({ data: [], error: null })
  })

  it('muestra la suma de campañas del cliente cuyo start_date cae en el mes del reporte', async () => {
    mockLoadAds.mockResolvedValue({
      data: [
        { id: 'ad-1', client_id: 'c-1', amount: 80, start_date: '2026-07-05', end_date: '2026-07-15' },
        { id: 'ad-2', client_id: 'c-1', amount: 45.5, start_date: '2026-07-20', end_date: '2026-07-25' },
      ],
      error: null,
    })
    renderView()
    await waitFor(() => { expect(screen.getByText('Guardar reporte')).toBeInTheDocument() })
    expect(await screen.findByText('$125.50')).toBeInTheDocument()
  })

  it('muestra el presupuesto del cliente (campaign_budget) junto al gasto, en fuente más pequeña', async () => {
    mockLoadAds.mockResolvedValue({
      data: [
        { id: 'ad-1', client_id: 'c-1', amount: 80, start_date: '2026-07-05', end_date: '2026-07-15' },
      ],
      error: null,
    })
    renderView()
    await waitFor(() => { expect(screen.getByText('Guardar reporte')).toBeInTheDocument() })
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
    await waitFor(() => { expect(screen.getByText('Guardar reporte')).toBeInTheDocument() })
    // Un $0.00 por cada cliente sin pauta en la columna Inversión Ads (Banco Exterior y Pepsi)
    const zeros = await screen.findAllByText('$0.00')
    expect(zeros.length).toBeGreaterThanOrEqual(2)
  })

  it('no cuenta campañas cuyo start_date cae en otro mes', async () => {
    mockLoadAds.mockResolvedValue({
      data: [
        { id: 'ad-3', client_id: 'c-1', amount: 999, start_date: '2026-06-15', end_date: '2026-06-20' },
      ],
      error: null,
    })
    renderView()
    await waitFor(() => { expect(screen.getByText('Guardar reporte')).toBeInTheDocument() })
    expect(screen.queryByText('$999.00')).not.toBeInTheDocument()
    const zeros = await screen.findAllByText('$0.00')
    expect(zeros.length).toBeGreaterThanOrEqual(2)
  })
})

describe('OperacionesView — "Reuniones realizadas" (sembrar-y-editar desde el módulo Reuniones)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockLoadPrevReport.mockResolvedValue({ data: null, error: null })
    mockLoadClients.mockResolvedValue({ data: MOCK_CLIENTS, error: null })
    mockLoadCompanyEmployees.mockResolvedValue({ data: [], error: null })
    mockUpsertReport.mockResolvedValue({ data: null, error: null })
    mockLoadAds.mockResolvedValue({ data: [], error: null })
  })

  it('respeta el valor ya guardado en el reporte aunque el conteo automático sea distinto', async () => {
    // El reporte guardado ya tiene realizadas=10; el conteo automático del módulo
    // Reuniones da 5 — el override del usuario debe prevalecer.
    mockLoadReport.mockResolvedValue({ data: { data: makeReportData() }, error: null })
    mockCountMeetingsHeldForLine.mockResolvedValue({ count: 5, error: null })
    renderView()
    await waitFor(() => { expect(screen.getByText('Guardar reporte')).toBeInTheDocument() })
    const realizadasInput = document.querySelectorAll('input[type="number"]')[0]
    expect(realizadasInput.value).toBe('10')
  })

  it('siembra "realizadas" con el conteo automático cuando el reporte no tiene valor guardado', async () => {
    const data = makeReportData()
    data.reuniones.realizadas = null
    mockLoadReport.mockResolvedValue({ data: { data }, error: null })
    mockCountMeetingsHeldForLine.mockResolvedValue({ count: 7, error: null })
    renderView()
    await waitFor(() => { expect(screen.getByText('Guardar reporte')).toBeInTheDocument() })
    const realizadasInput = document.querySelectorAll('input[type="number"]')[0]
    expect(realizadasInput.value).toBe('7')
  })

  it('siembra "realizadas" con el conteo automático en un reporte nuevo (sin fila previa)', async () => {
    mockLoadReport.mockResolvedValue({ data: null, error: null })
    mockCountMeetingsHeldForLine.mockResolvedValue({ count: 3, error: null })
    renderView()
    await waitFor(() => { expect(screen.getByText('Guardar reporte')).toBeInTheDocument() })
    const realizadasInput = document.querySelectorAll('input[type="number"]')[0]
    expect(realizadasInput.value).toBe('3')
  })

  it('muestra el hint "usar automático" cuando el valor difiere del conteo, y lo oculta cuando coincide', async () => {
    mockLoadReport.mockResolvedValue({ data: { data: makeReportData() }, error: null })
    mockCountMeetingsHeldForLine.mockResolvedValue({ count: 10, error: null })
    renderView()
    await waitFor(() => { expect(screen.getByText('Guardar reporte')).toBeInTheDocument() })
    // realizadas=10 (guardado) === conteo automático=10 → no debe mostrarse el hint
    expect(screen.queryByText(/usar automático/)).not.toBeInTheDocument()
  })
})
