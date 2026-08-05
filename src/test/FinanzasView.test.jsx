/**
 * Tests de FinanzasView — reconciliación del reporte contra el roster de clientes.
 * Cubre que un mes ya PASADO (o cerrado) se muestre congelado tal cual se guardó,
 * sin re-sincronizar contra la cartera actual: un cliente archivado después de ese
 * mes debe seguir apareciendo, y uno agregado después no debe aparecer retroactivamente.
 */
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { vi } from 'vitest'

const mockLoadReport = vi.fn()
const mockLoadPrevReport = vi.fn()
const mockLoadClients = vi.fn()
const mockLoadCompanyEmployees = vi.fn()
const mockUpsertReport = vi.fn()
const mockUpdateEmployeeSalaries = vi.fn()
const mockLoadRecentReports = vi.fn()

vi.mock('../components/metricas/metricsApi', () => ({
  loadReport: (...a) => mockLoadReport(...a),
  loadPrevReport: (...a) => mockLoadPrevReport(...a),
  loadClients: (...a) => mockLoadClients(...a),
  loadCompanyEmployees: (...a) => mockLoadCompanyEmployees(...a),
  upsertReport: (...a) => mockUpsertReport(...a),
  updateEmployeeSalaries: (...a) => mockUpdateEmployeeSalaries(...a),
  loadRecentReports: (...a) => mockLoadRecentReports(...a),
}))

vi.mock('../context/AuthContext', () => ({
  useAuth: () => ({ can: () => true, userProfile: { admin: true } }),
}))

import FinanzasView from '../components/metricas/FinanzasView'

function makeReportData(ingresos) {
  return {
    reuniones: { realizadas: 0, meta: 15, comentario: null },
    productividad: { tareas: [] },
    crecimiento: { items: [] },
    solicitudes: { solicitudes: 0, editadas: 0 },
    pautas: { items: [] },
    piezas: { piezas: 0, editadas: 0 },
    feedback: { items: [] },
    finanzas: { ingresos, gastosOperativos: [], sueldos: [], otrosGastos: [] },
  }
}

const LINE = { id: 'line-1', name: 'Georgina', member_user_ids: [] }

function renderView(props = {}) {
  return render(
    <MemoryRouter>
      <FinanzasView line={LINE} companyId="co-1" year={2026} month={7} {...props} />
    </MemoryRouter>,
  )
}

describe('FinanzasView — meses pasados congelados no reconcilian contra el roster actual', () => {
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
    { id: 'c-1', name: 'Banco Exterior', logo_url: null, deleted_at: null, monthly_fee: 100 },
    // Se dio de baja el 20 de junio: en junio estuvo activa, en julio ya no.
    {
      id: 'c-2',
      name: 'Marca Archivada',
      logo_url: null,
      deleted_at: '2026-06-20T00:00:00Z',
      monthly_fee: 50,
    },
    // Se agregó recién ahora: no existía cuando se guardó el reporte de junio.
    { id: 'c-3', name: 'Marca Nueva', logo_url: null, deleted_at: null, monthly_fee: 75 },
  ]

  function reportSavedInJune() {
    // Snapshot tal como habría quedado guardado en junio: solo c-1 y c-2 (c-3 no existía).
    return makeReportData([
      { id: 'ing-c-1', clienteId: 'c-1', descripcion: 'Banco Exterior', monto: 100 },
      { id: 'ing-c-2', clienteId: 'c-2', descripcion: 'Marca Archivada', monto: 50 },
    ])
  }

  beforeEach(() => {
    vi.clearAllMocks()
    mockLoadPrevReport.mockResolvedValue({ data: null, error: null })
    mockLoadClients.mockResolvedValue({ data: CLIENTES_ROSTER, error: null })
    mockLoadCompanyEmployees.mockResolvedValue({ data: [], error: null })
    mockUpsertReport.mockResolvedValue({ data: null, error: null })
    mockUpdateEmployeeSalaries.mockResolvedValue({ error: null })
    mockLoadRecentReports.mockResolvedValue({ data: [], error: null })
    mockLoadReport.mockResolvedValue({ data: { data: reportSavedInJune() }, error: null })
  })

  it('junio (mes pasado): conserva el ingreso de la marca archivada y NO agrega el de la marca nueva', async () => {
    renderView({ month: 6 })
    await waitFor(() => {
      expect(screen.getByText(/Ingresos brutos/)).toBeInTheDocument()
    })
    expect(await screen.findByText('Marca Archivada')).toBeInTheDocument()
    expect(screen.queryByText('Marca Nueva')).not.toBeInTheDocument()
  })

  it('julio (mes en curso): descarta el ingreso de la marca archivada en junio y agrega el de la marca nueva', async () => {
    renderView({ month: 7 })
    await waitFor(() => {
      expect(screen.getByText(/Ingresos brutos/)).toBeInTheDocument()
    })
    expect(await screen.findByText('Marca Nueva')).toBeInTheDocument()
    expect(screen.queryByText('Marca Archivada')).not.toBeInTheDocument()
  })

  it('reporte cerrado en el mes en curso también queda congelado (conserva la marca archivada)', async () => {
    renderView({ month: 7, closed: true })
    await waitFor(() => {
      expect(screen.getByText(/Ingresos brutos/)).toBeInTheDocument()
    })
    expect(await screen.findByText('Marca Archivada')).toBeInTheDocument()
    expect(screen.queryByText('Marca Nueva')).not.toBeInTheDocument()
  })
})
