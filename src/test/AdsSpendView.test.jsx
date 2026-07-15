/**
 * Tests de la tab "Ads" (pauta pagada) — AdsSpendView.
 * Cubre: cards de resumen, filtros (búsqueda/estado/cliente/periodo), y el
 * tracking invertido vs. presupuesto.
 */
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi } from 'vitest'

const { MOCK_CLIENTS } = vi.hoisted(() => ({
  MOCK_CLIENTS: [
    { id: 'c-1', name: 'Banco Exterior', campaign_budget: 100, logo_url: 'https://cdn.example.com/banco.png' },
    { id: 'c-2', name: 'Pepsi', campaign_budget: null, logo_url: null },
  ],
}))

const MOCK_ADS = [
  { id: 'ad-1', client_id: 'c-1', client: 'Banco Exterior', name: 'Ad Julio', objective: 'Alcance', piece_url: null, amount: 80, start_date: '2026-07-05', end_date: '2026-07-15', status: 'En Curso' },
  { id: 'ad-2', client_id: 'c-1', client: 'Banco Exterior', name: 'Ad Junio', objective: 'Tráfico', piece_url: null, amount: 50, start_date: '2026-06-01', end_date: '2026-06-10', status: 'Finalizado' },
  { id: 'ad-3', client_id: 'c-2', client: 'Pepsi', name: 'Ad Pepsi', objective: 'Conversiones', piece_url: null, amount: 30, start_date: '2026-07-02', end_date: '2026-07-04', status: 'Pendiente' },
]

const mockLoadAds = vi.fn()
const mockDeleteAd = vi.fn()
const mockUpdateAd = vi.fn()
const mockLoadAdsResponsables = vi.fn()

vi.mock('../components/ads/campaignSpendApi', async () => {
  const actual = await vi.importActual('../components/ads/campaignSpendApi')
  return {
    ...actual,
    loadAds: (...a) => mockLoadAds(...a),
    deleteAd: (...a) => mockDeleteAd(...a),
    updateAd: (...a) => mockUpdateAd(...a),
    loadAdsResponsables: (...a) => mockLoadAdsResponsables(...a),
  }
})

vi.mock('../components/metricas/metricsApi', () => ({
  loadClients: vi.fn().mockResolvedValue({ data: MOCK_CLIENTS, error: null }),
  loadLines: vi.fn().mockResolvedValue({ data: [], error: null }),
}))

vi.mock('../supabase', () => {
  const channel = { on: vi.fn().mockReturnThis(), subscribe: vi.fn().mockReturnThis() }
  return {
    supabase: {
      channel: vi.fn(() => channel),
      removeChannel: vi.fn(),
    },
  }
})

vi.mock('../context/AuthContext', () => ({
  useAuth: vi.fn(),
}))

const mockExportAdsToExcel = vi.fn()
vi.mock('../utils/exportAdsToExcel', () => ({
  exportAdsToExcel: (...a) => mockExportAdsToExcel(...a),
}))

import { useAuth } from '../context/AuthContext'
import AdsSpendView from '../components/ads/AdsSpendView'

function renderView(periodo = { month: 7, year: 2026 }) {
  return render(<AdsSpendView companyId="co-1" canManage={true} periodo={periodo} />)
}

describe('AdsSpendView', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockLoadAds.mockResolvedValue({ data: MOCK_ADS, error: null })
    mockLoadAdsResponsables.mockResolvedValue({ data: [], error: null })
    mockUpdateAd.mockResolvedValue({ data: null, error: null })
    useAuth.mockReturnValue({ userProfile: { user_id: 'u-1', company_id: 'co-1' } })
  })

  it('muestra solo los ads cuyo inicio de plazo cae en el periodo seleccionado', async () => {
    renderView({ month: 7, year: 2026 })
    await waitFor(() => { expect(screen.getByText('Ad Julio')).toBeInTheDocument() })
    expect(screen.getByText('Ad Pepsi')).toBeInTheDocument()
    expect(screen.queryByText('Ad Junio')).not.toBeInTheDocument()
  })

  it('cambiar de periodo actualiza los ads visibles', async () => {
    renderView({ month: 6, year: 2026 })
    await waitFor(() => { expect(screen.getByText('Ad Junio')).toBeInTheDocument() })
    expect(screen.queryByText('Ad Julio')).not.toBeInTheDocument()
  })

  it('filtrar por cliente reduce la tabla a sus ads', async () => {
    const user = userEvent.setup()
    renderView({ month: 7, year: 2026 })
    await waitFor(() => { expect(screen.getByText('Ad Julio')).toBeInTheDocument() })

    await user.selectOptions(screen.getByDisplayValue('Todos los clientes'), 'c-1')
    expect(screen.getByText('Ad Julio')).toBeInTheDocument()
    expect(screen.queryByText('Ad Pepsi')).not.toBeInTheDocument()
  })

  it('muestra el tracking de invertido vs. presupuesto al seleccionar un cliente', async () => {
    const user = userEvent.setup()
    renderView({ month: 7, year: 2026 })
    await waitFor(() => { expect(screen.getByText('Ad Julio')).toBeInTheDocument() })

    await user.selectOptions(screen.getByDisplayValue('Todos los clientes'), 'c-1')

    await waitFor(() => {
      expect(screen.getByText(/Invertido en Banco Exterior este periodo/)).toBeInTheDocument()
    })
    // "$80.00" aparece tanto en el tracking como en la columna Monto de la tabla
    expect(screen.getAllByText('$80.00').length).toBeGreaterThanOrEqual(2)
    expect(screen.getByText(/de \$100.00 presupuestados/)).toBeInTheDocument()
  })

  it('avisa cuando lo invertido supera el presupuesto del cliente', async () => {
    const user = userEvent.setup()
    mockLoadAds.mockResolvedValue({
      data: [
        ...MOCK_ADS,
        { id: 'ad-4', client_id: 'c-1', client: 'Banco Exterior', name: 'Ad Extra', objective: '', piece_url: null, amount: 40, start_date: '2026-07-20', end_date: '2026-07-25', status: 'Pendiente' },
      ],
      error: null,
    })
    renderView({ month: 7, year: 2026 })
    await waitFor(() => { expect(screen.getByText('Ad Julio')).toBeInTheDocument() })

    await user.selectOptions(screen.getByDisplayValue('Todos los clientes'), 'c-1')

    await waitFor(() => {
      expect(screen.getByText('Sobrepasando el presupuesto aprobado.')).toBeInTheDocument()
    })
  })

  it('muestra las cards de resumen (Total Ads, Invertido, En Curso, Completados, Avance Global) del periodo', async () => {
    renderView({ month: 7, year: 2026 })
    await waitFor(() => { expect(screen.getByText('Ad Julio')).toBeInTheDocument() })

    // Periodo julio 2026: Ad Julio (80, En Curso) + Ad Pepsi (30, Pendiente) = 2 ads, $110 invertidos
    // (el "2" de esta card convive con el índice de fila "2" en la tabla, por eso
    // se busca dentro de la card específica en vez de un getByText('2') global).
    const totalCard = screen.getByText('Total Ads').closest('div')
    expect(totalCard).toHaveTextContent('2')
    expect(screen.getByText('Invertido')).toBeInTheDocument()
    expect(screen.getByText('$110.00')).toBeInTheDocument()
    expect(screen.getByText('En Curso', { selector: 'p' })).toBeInTheDocument()
    expect(screen.getByText('Completados', { selector: 'p' })).toBeInTheDocument()
    expect(screen.getByText('Avance Global')).toBeInTheDocument()
  })

  describe('cards de resumen clickeables', () => {
    it('clic en "Total Ads" resetea los filtros de búsqueda/estado/cliente', async () => {
      const user = userEvent.setup()
      renderView({ month: 7, year: 2026 })
      await waitFor(() => { expect(screen.getByText('Ad Julio')).toBeInTheDocument() })

      await user.type(screen.getByPlaceholderText('Buscar ad, cliente, objetivo...'), 'Pepsi')
      expect(screen.queryByText('Ad Julio')).not.toBeInTheDocument()

      await user.click(screen.getByText('Total Ads'))
      await waitFor(() => { expect(screen.getByText('Ad Julio')).toBeInTheDocument() })
    })

    it('clic en "Invertido" abre el modal de presupuestos por cliente', async () => {
      const user = userEvent.setup()
      renderView({ month: 7, year: 2026 })
      await waitFor(() => { expect(screen.getByText('Ad Julio')).toBeInTheDocument() })

      await user.click(screen.getByText('Invertido'))

      await waitFor(() => {
        expect(screen.getByRole('heading', { name: 'Presupuestos por cliente' })).toBeInTheDocument()
      })
    })

    it('clic en "En Curso" filtra la tabla a ads En Curso', async () => {
      const user = userEvent.setup()
      renderView({ month: 7, year: 2026 })
      await waitFor(() => { expect(screen.getByText('Ad Julio')).toBeInTheDocument() })

      await user.click(screen.getByText('En Curso', { selector: 'p' }))
      expect(screen.getByText('Ad Julio')).toBeInTheDocument()
      expect(screen.queryByText('Ad Pepsi')).not.toBeInTheDocument()
    })

    it('clic en "Completados" filtra la tabla a ads Finalizado', async () => {
      const user = userEvent.setup()
      renderView({ month: 6, year: 2026 })
      await waitFor(() => { expect(screen.getByText('Ad Junio')).toBeInTheDocument() })

      await user.click(screen.getByText('Completados', { selector: 'p' }))
      expect(screen.getByText('Ad Junio')).toBeInTheDocument()
    })
  })

  it('el buscador filtra por nombre, cliente u objetivo', async () => {
    const user = userEvent.setup()
    renderView({ month: 7, year: 2026 })
    await waitFor(() => { expect(screen.getByText('Ad Julio')).toBeInTheDocument() })

    await user.type(screen.getByPlaceholderText('Buscar ad, cliente, objetivo...'), 'Pepsi')
    expect(screen.getByText('Ad Pepsi')).toBeInTheDocument()
    expect(screen.queryByText('Ad Julio')).not.toBeInTheDocument()
  })

  it('el filtro de estado reduce la tabla a ads con ese estado', async () => {
    const user = userEvent.setup()
    renderView({ month: 7, year: 2026 })
    await waitFor(() => { expect(screen.getByText('Ad Julio')).toBeInTheDocument() })

    await user.selectOptions(screen.getByDisplayValue('Todos los estados'), 'Pendiente')
    expect(screen.getByText('Ad Pepsi')).toBeInTheDocument()
    expect(screen.queryByText('Ad Julio')).not.toBeInTheDocument()
  })

  it('"Limpiar" resetea búsqueda, estado y cliente', async () => {
    const user = userEvent.setup()
    renderView({ month: 7, year: 2026 })
    await waitFor(() => { expect(screen.getByText('Ad Julio')).toBeInTheDocument() })

    await user.type(screen.getByPlaceholderText('Buscar ad, cliente, objetivo...'), 'Pepsi')
    expect(screen.queryByText('Ad Julio')).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Limpiar' }))
    await waitFor(() => { expect(screen.getByText('Ad Julio')).toBeInTheDocument() })
  })

  describe('click en fila abre el detalle', () => {
    it('clic en una fila abre AdsSpendDetail con los datos del ad', async () => {
      const user = userEvent.setup()
      renderView({ month: 7, year: 2026 })
      await waitFor(() => { expect(screen.getByText('Ad Julio')).toBeInTheDocument() })

      await user.click(screen.getByText('Ad Julio'))

      // El modal de detalle muestra el estado como select (canManage=true)
      await waitFor(() => {
        expect(screen.getByRole('heading', { name: 'Ad Julio' })).toBeInTheDocument()
      })
    })

    it('clic en "Editar" (acciones de fila) NO abre el detalle, abre el form de edición', async () => {
      const user = userEvent.setup()
      renderView({ month: 7, year: 2026 })
      await waitFor(() => { expect(screen.getByText('Ad Julio')).toBeInTheDocument() })

      const editButtons = screen.getAllByRole('button', { name: 'Editar' })
      await user.click(editButtons[0])

      expect(screen.getByRole('heading', { name: 'Editar ad' })).toBeInTheDocument()
      expect(screen.queryByRole('heading', { name: 'Ad Julio' })).not.toBeInTheDocument()
    })

    it('clic en "Eliminar" (acciones de fila) abre la confirmación de borrado, no el detalle', async () => {
      const user = userEvent.setup()
      renderView({ month: 7, year: 2026 })
      await waitFor(() => { expect(screen.getByText('Ad Julio')).toBeInTheDocument() })

      const deleteButtons = screen.getAllByRole('button', { name: 'Eliminar' })
      await user.click(deleteButtons[0])

      expect(screen.getByRole('heading', { name: 'Eliminar ad' })).toBeInTheDocument()
    })
  })

  it('el botón "Excel" exporta solo los ads visibles (filtrados) del periodo', async () => {
    const user = userEvent.setup()
    renderView({ month: 7, year: 2026 })
    await waitFor(() => { expect(screen.getByText('Ad Julio')).toBeInTheDocument() })

    await user.selectOptions(screen.getByDisplayValue('Todos los clientes'), 'c-1')
    await user.click(screen.getByRole('button', { name: /Excel/i }))

    expect(mockExportAdsToExcel).toHaveBeenCalledTimes(1)
    const arg = mockExportAdsToExcel.mock.calls[0][0]
    expect(arg.ads.map(a => a.id)).toEqual(['ad-1'])
    expect(arg.periodo).toEqual({ month: 7, year: 2026 })
  })

  it('el botón "Presupuestos por cliente" abre el modal de resumen por cliente', async () => {
    const user = userEvent.setup()
    renderView({ month: 7, year: 2026 })
    await waitFor(() => { expect(screen.getByText('Ad Julio')).toBeInTheDocument() })

    await user.click(screen.getByRole('button', { name: 'Presupuestos por cliente' }))

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Presupuestos por cliente' })).toBeInTheDocument()
    })
  })

  describe('paridad visual con la tabla de Tácticas', () => {
    it('el orden de columnas coincide con el especificado (Cliente, Nombre, Responsable, Inicio, Fecha fin, Duración, Objetivo, Pieza, Monto, Estado)', async () => {
      renderView({ month: 7, year: 2026 })
      await waitFor(() => { expect(screen.getByText('Ad Julio')).toBeInTheDocument() })

      const headers = screen.getAllByRole('columnheader').map(th => th.textContent)
      expect(headers).toEqual([
        'Cliente', 'Nombre de campaña', 'Responsable', 'Inicio',
        'Fecha fin', 'Duración', 'Objetivo', 'Pieza', 'Monto', 'Estado', '',
      ])
    })

    it('muestra el logo del cliente cuando existe, e inicial cuando no', async () => {
      renderView({ month: 7, year: 2026 })
      await waitFor(() => { expect(screen.getByText('Ad Julio')).toBeInTheDocument() })

      // Ad Julio → cliente Banco Exterior, con logo_url
      expect(screen.getByRole('img', { name: 'Banco Exterior' })).toHaveAttribute('src', 'https://cdn.example.com/banco.png')
      // Ad Pepsi → cliente Pepsi, sin logo_url → inicial "P"
      expect(screen.getByText('P')).toBeInTheDocument()
    })

    it('resuelve y muestra el nombre del responsable en la tabla', async () => {
      mockLoadAdsResponsables.mockResolvedValue({
        data: [{ user_id: 'r-1', first_name: 'Katherine', last_name: 'Mora' }],
        error: null,
      })
      mockLoadAds.mockResolvedValue({
        data: [{ ...MOCK_ADS[0], responsable_id: 'r-1' }],
        error: null,
      })
      renderView({ month: 7, year: 2026 })

      await waitFor(() => { expect(screen.getByText('Katherine Mora')).toBeInTheDocument() })
    })

    it('el estado es editable desde la tabla: elegir un estado que no sea Finalizado llama a updateAd directo', async () => {
      const user = userEvent.setup()
      renderView({ month: 7, year: 2026 })
      await waitFor(() => { expect(screen.getByText('Ad Julio')).toBeInTheDocument() })

      await user.click(screen.getByRole('button', { name: 'En Curso' }))
      await user.click(screen.getByRole('button', { name: 'Descartado' }))

      expect(mockUpdateAd).toHaveBeenCalledWith('ad-1', { status: 'Descartado' })
    })
  })

  describe('finalizar exige capturar resultados', () => {
    it('elegir "Finalizado" desde el pill de la fila abre el modal de resultados y NO llama a updateAd', async () => {
      const user = userEvent.setup()
      renderView({ month: 7, year: 2026 })
      await waitFor(() => { expect(screen.getByText('Ad Julio')).toBeInTheDocument() })

      await user.click(screen.getByRole('button', { name: 'En Curso' }))
      await user.click(screen.getByRole('button', { name: 'Finalizado' }))

      expect(screen.getByRole('heading', { name: 'Resultados del ad' })).toBeInTheDocument()
      expect(mockUpdateAd).not.toHaveBeenCalled()
    })

    it('guardar los 4 resultados en el modal llama a updateAd con status Finalizado y cierra el modal', async () => {
      const user = userEvent.setup()
      mockUpdateAd.mockResolvedValue({
        data: { ...MOCK_ADS[0], status: 'Finalizado', reach: 1000, interactions: 200, followers: 30, impressions: 5000 },
        error: null,
      })
      renderView({ month: 7, year: 2026 })
      await waitFor(() => { expect(screen.getByText('Ad Julio')).toBeInTheDocument() })

      await user.click(screen.getByRole('button', { name: 'En Curso' }))
      await user.click(screen.getByRole('button', { name: 'Finalizado' }))
      await waitFor(() => { expect(screen.getByRole('heading', { name: 'Resultados del ad' })).toBeInTheDocument() })

      await user.type(screen.getByLabelText('Alcance'), '1000')
      await user.type(screen.getByLabelText('Interacciones'), '200')
      await user.type(screen.getByLabelText('Seguidores'), '30')
      await user.type(screen.getByLabelText('Impresiones'), '5000')
      await user.click(screen.getByRole('button', { name: 'Guardar y finalizar' }))

      await waitFor(() => {
        expect(mockUpdateAd).toHaveBeenCalledWith('ad-1', {
          status: 'Finalizado', reach: 1000, interactions: 200, followers: 30, impressions: 5000,
        })
        expect(screen.queryByRole('heading', { name: 'Resultados del ad' })).not.toBeInTheDocument()
      })
    })

    it('elegir "Finalizado" desde el pill del detalle también abre el modal de resultados', async () => {
      const user = userEvent.setup()
      renderView({ month: 7, year: 2026 })
      await waitFor(() => { expect(screen.getByText('Ad Julio')).toBeInTheDocument() })

      await user.click(screen.getByText('Ad Julio'))
      await waitFor(() => { expect(screen.getByRole('heading', { name: 'Ad Julio' })).toBeInTheDocument() })

      // Dos pills "En Curso" en pantalla (fila de tabla + header del detalle): el del
      // detalle es el último en el orden del DOM (se renderiza después de la tabla).
      const enCursoPills = screen.getAllByRole('button', { name: 'En Curso' })
      await user.click(enCursoPills[enCursoPills.length - 1])
      await user.click(screen.getByRole('button', { name: 'Finalizado' }))

      expect(screen.getByRole('heading', { name: 'Resultados del ad' })).toBeInTheDocument()
      expect(mockUpdateAd).not.toHaveBeenCalled()
    })
  })
})
