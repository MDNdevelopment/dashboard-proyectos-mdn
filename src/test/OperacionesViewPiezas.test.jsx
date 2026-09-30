/**
 * Tests de OperacionesView — sección "6. Nº Piezas vs Piezas editadas".
 * Cubre el auto-llenado desde las pautas 'realizada' de Tareas Fijas → Audiovisual
 * (AUDIOVISUAL_MODULE_START = sept. 2026): antes de esa era sigue siendo manual, desde
 * esa era queda de solo lectura y derivado, y un reporte cerrado conserva el valor guardado.
 */
import { render, screen, waitFor, within } from '@testing-library/react'
import { vi } from 'vitest'

const { MOCK_CLIENTS } = vi.hoisted(() => ({
  MOCK_CLIENTS: [{ id: 'c-1', name: 'Banco Exterior', logo_url: null, deleted_at: null }],
}))

function makeReportData() {
  return {
    reuniones: { realizadas: 0, meta: 0, comentario: null },
    productividad: { tareas: [] },
    crecimiento: { items: [] },
    solicitudes: { solicitudes: 0, editadas: 0 },
    pautas: { items: [] },
    piezas: { piezas: 12, editadas: 9 },
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
const mockCountPiezasForLine = vi.fn()
const mockCountPautasRealizadasByClient = vi.fn()
const mockLoadChecks = vi.fn()
const mockCountCnpSolicitudesForLine = vi.fn()
const mockCountTareasSolicitudesForLine = vi.fn()

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

vi.mock('../components/cnp/cnpApi', () => ({
  countCnpSolicitudesForLine: (...a) => mockCountCnpSolicitudesForLine(...a),
}))

vi.mock('../components/tareas/tareasMetricsApi', () => ({
  countTareasSolicitudesForLine: (...a) => mockCountTareasSolicitudesForLine(...a),
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

vi.mock('../components/pautas/avPautasApi', () => ({
  countPiezasForLine: (...a) => mockCountPiezasForLine(...a),
  countPautasRealizadasByClient: (...a) => mockCountPautasRealizadasByClient(...a),
}))

vi.mock('../context/AuthContext', () => ({
  useAuth: () => ({ can: () => true }),
}))

import OperacionesView from '../components/metricas/OperacionesView'

const LINE = { id: 'line-1', name: 'Georgina', member_user_ids: [], metas: {} }

function renderView(props = {}) {
  return render(<OperacionesView line={LINE} companyId="co-1" year={2026} month={7} {...props} />)
}

describe('OperacionesView — "6. Nº Piezas vs Piezas editadas"', () => {
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
    mockCountPautasRealizadasByClient.mockResolvedValue({ byClient: {}, error: null })
    mockLoadChecks.mockResolvedValue({ data: [], error: null })
    mockCountCnpSolicitudesForLine.mockResolvedValue({ solicitudes: 0, entregados: 0, error: null })
    mockCountTareasSolicitudesForLine.mockResolvedValue({
      solicitudes: 0,
      entregados: 0,
      error: null,
    })
  })

  it('agosto 2026 (previo a septiembre): el valor guardado a mano se puede editar', async () => {
    mockLoadReport.mockResolvedValue({ data: { data: makeReportData() }, error: null })
    mockCountPiezasForLine.mockResolvedValue({ piezas: 999, editadas: 999, error: null })
    renderView({ month: 8 })
    await waitFor(() => {
      expect(screen.getByText('Guardar reporte')).toBeInTheDocument()
    })
    const piezasInput = screen.getByDisplayValue('12')
    expect(piezasInput).not.toBeDisabled()
    const editadasInput = screen.getByDisplayValue('9')
    expect(editadasInput).not.toBeDisabled()
    expect(screen.queryByText('Derivado de Audiovisual')).not.toBeInTheDocument()
  })

  it('septiembre 2026 (lanzamiento del módulo, inclusive): queda de solo lectura y usa el conteo automático', async () => {
    mockLoadReport.mockResolvedValue({ data: { data: makeReportData() }, error: null })
    mockCountPiezasForLine.mockResolvedValue({ piezas: 20, editadas: 15, error: null })
    renderView({ month: 9 })
    await waitFor(() => {
      expect(screen.getByText('Guardar reporte')).toBeInTheDocument()
    })
    const piezasInput = screen.getByDisplayValue('20')
    const editadasInput = screen.getByDisplayValue('15')
    expect(piezasInput).toBeDisabled()
    expect(editadasInput).toBeDisabled()
    // Acotado a la sección de Piezas: el punto 5 (Pautas) también muestra su propio
    // "Derivado de Audiovisual" desde esta misma era, cubierto en OperacionesViewPautas.test.jsx.
    const piezasSection = screen
      .getByText('6. Nº Piezas vs Piezas editadas')
      .closest('div.space-y-3')
    expect(within(piezasSection).getAllByText('Derivado de Audiovisual').length).toBe(2)
  })

  it('con porGrupo, muestra la distinción Video 4K vs Reels', async () => {
    mockLoadReport.mockResolvedValue({ data: { data: makeReportData() }, error: null })
    mockCountPiezasForLine.mockResolvedValue({
      piezas: 20,
      editadas: 15,
      porGrupo: {
        video4k: { piezas: 12, editadas: 9 },
        reel: { piezas: 8, editadas: 6 },
        sinDesglose: { piezas: 0, editadas: 0 },
      },
      error: null,
    })
    renderView({ month: 9 })
    await waitFor(() => {
      expect(screen.getByText('Guardar reporte')).toBeInTheDocument()
    })
    expect(
      screen.getByText('Video 4K: 12 piezas / 9 editadas · Reels: 8 piezas / 6 editadas'),
    ).toBeInTheDocument()
  })

  it('con piezas sin desglosar (legacy V+R), lo muestra aparte', async () => {
    mockLoadReport.mockResolvedValue({ data: { data: makeReportData() }, error: null })
    mockCountPiezasForLine.mockResolvedValue({
      piezas: 7,
      editadas: 5,
      porGrupo: {
        video4k: { piezas: 0, editadas: 0 },
        reel: { piezas: 0, editadas: 0 },
        sinDesglose: { piezas: 7, editadas: 5 },
      },
      error: null,
    })
    renderView({ month: 9 })
    await waitFor(() => {
      expect(screen.getByText('Guardar reporte')).toBeInTheDocument()
    })
    expect(screen.getByText(/Sin desglosar: 7 piezas \/ 5 editadas/)).toBeInTheDocument()
  })

  it('sin piezas de video en el mes (porGrupo en cero), no muestra el desglose', async () => {
    mockLoadReport.mockResolvedValue({ data: { data: makeReportData() }, error: null })
    mockCountPiezasForLine.mockResolvedValue({
      piezas: 0,
      editadas: 0,
      porGrupo: {
        video4k: { piezas: 0, editadas: 0 },
        reel: { piezas: 0, editadas: 0 },
        sinDesglose: { piezas: 0, editadas: 0 },
      },
      error: null,
    })
    renderView({ month: 9 })
    await waitFor(() => {
      expect(screen.getByText('Guardar reporte')).toBeInTheDocument()
    })
    expect(screen.queryByText(/Video 4K:/)).not.toBeInTheDocument()
  })

  it('reporte cerrado en la era del módulo: conserva el valor guardado sin recalcular', async () => {
    mockLoadReport.mockResolvedValue({ data: { data: makeReportData() }, error: null })
    mockCountPiezasForLine.mockResolvedValue({ piezas: 999, editadas: 999, error: null })
    renderView({ month: 9, closed: true })
    await waitFor(() => {
      expect(screen.getByText('Guardar reporte')).toBeInTheDocument()
    })
    expect(screen.getByDisplayValue('12')).toBeInTheDocument()
    expect(screen.getByDisplayValue('9')).toBeInTheDocument()
  })
})
