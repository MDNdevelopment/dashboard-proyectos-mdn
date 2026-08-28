/**
 * Tests de OperacionesView — sección "5. Nº Pautas" (campo "Realizadas" por marca).
 * Cubre el auto-llenado desde las pautas 'realizada' de Tareas Fijas → Audiovisual
 * (AUDIOVISUAL_MODULE_START = sept. 2026): antes de esa era sigue siendo manual, desde
 * esa era "Realizadas" queda de solo lectura y derivado por cliente, "Meta" sigue
 * siempre editable, y un reporte cerrado conserva el valor guardado sin recalcular.
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
    pautas: { items: [{ clienteId: 'c-1', realizadas: 3, meta: 5 }] },
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

describe('OperacionesView — "5. Nº Pautas" (Realizadas)', () => {
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
    mockCountPiezasForLine.mockResolvedValue({ piezas: 0, editadas: 0, error: null })
    mockLoadChecks.mockResolvedValue({ data: [], error: null })
    mockCountCnpSolicitudesForLine.mockResolvedValue({ solicitudes: 0, entregados: 0, error: null })
    mockCountTareasSolicitudesForLine.mockResolvedValue({
      solicitudes: 0,
      entregados: 0,
      error: null,
    })
  })

  it('agosto 2026 (previo a septiembre): Realizadas y Meta se pueden editar a mano', async () => {
    mockLoadReport.mockResolvedValue({ data: { data: makeReportData() }, error: null })
    mockCountPautasRealizadasByClient.mockResolvedValue({ byClient: { 'c-1': 999 }, error: null })
    renderView({ month: 8 })
    await waitFor(() => {
      expect(screen.getByText('Guardar reporte')).toBeInTheDocument()
    })
    const realizadasInput = screen.getByDisplayValue('3')
    const metaInput = screen.getByDisplayValue('5')
    expect(realizadasInput).not.toBeDisabled()
    expect(metaInput).not.toBeDisabled()
    expect(screen.queryByText('Derivado de Audiovisual')).not.toBeInTheDocument()
  })

  it('septiembre 2026 (lanzamiento del módulo, inclusive): Realizadas queda de solo lectura con el conteo por cliente, Meta sigue editable', async () => {
    mockLoadReport.mockResolvedValue({ data: { data: makeReportData() }, error: null })
    mockCountPautasRealizadasByClient.mockResolvedValue({ byClient: { 'c-1': 7 }, error: null })
    renderView({ month: 9 })
    await waitFor(() => {
      expect(screen.getByText('Guardar reporte')).toBeInTheDocument()
    })
    // El título es único al input de Realizadas derivado; se ubica la fila del cliente
    // a partir de ahí para encontrar, dentro de esa misma fila, el input de Meta.
    const realizadasInput = screen.getByTitle(
      'Derivado automáticamente de Audiovisual: pautas realizadas del cliente en el mes',
    )
    expect(realizadasInput).toBeDisabled()
    expect(realizadasInput.value).toBe('7')
    const row = realizadasInput.closest('div.grid')
    const metaInput = within(row).getByDisplayValue('5')
    expect(metaInput).not.toBeDisabled()
    expect(within(row).getByText('Derivado de Audiovisual')).toBeInTheDocument()
  })

  it('un cliente sin pautas realizadas ese mes cae a 0, no se deja el valor guardado', async () => {
    mockLoadReport.mockResolvedValue({ data: { data: makeReportData() }, error: null })
    mockCountPautasRealizadasByClient.mockResolvedValue({ byClient: {}, error: null })
    renderView({ month: 9 })
    await waitFor(() => {
      expect(screen.getByText('Guardar reporte')).toBeInTheDocument()
    })
    const realizadasInput = screen.getByTitle(
      'Derivado automáticamente de Audiovisual: pautas realizadas del cliente en el mes',
    )
    expect(realizadasInput.value).toBe('0')
  })

  it('reporte cerrado en la era del módulo: conserva el valor guardado sin recalcular', async () => {
    mockLoadReport.mockResolvedValue({ data: { data: makeReportData() }, error: null })
    mockCountPautasRealizadasByClient.mockResolvedValue({ byClient: { 'c-1': 999 }, error: null })
    renderView({ month: 9, closed: true })
    await waitFor(() => {
      expect(screen.getByText('Guardar reporte')).toBeInTheDocument()
    })
    expect(screen.getByDisplayValue('3')).toBeInTheDocument()
    expect(screen.getByDisplayValue('5')).toBeInTheDocument()
  })
})
