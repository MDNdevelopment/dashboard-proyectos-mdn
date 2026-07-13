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
  { id: 'ad-1', client_id: 'c-1', client: 'Banco Exterior', name: 'Ad Julio', objective: 'Alcance', piece_url: null, amount: 80, start_date: '2026-07-05', end_date: '2026-07-15', status: 'Aprobado' },
  { id: 'ad-2', client_id: 'c-1', client: 'Banco Exterior', name: 'Ad Junio', objective: 'Tráfico', piece_url: null, amount: 50, start_date: '2026-06-01', end_date: '2026-06-10', status: 'Finalizado' },
  { id: 'ad-3', client_id: 'c-2', client: 'Pepsi', name: 'Ad Pepsi', objective: 'Conversiones', piece_url: null, amount: 30, start_date: '2026-07-02', end_date: '2026-07-04', status: 'Pendiente' },
]

const mockLoadAds = vi.fn()
const mockDeleteAd = vi.fn()
const mockLoadAdsResponsables = vi.fn()

vi.mock('../components/ads/campaignSpendApi', async () => {
  const actual = await vi.importActual('../components/ads/campaignSpendApi')
  return {
    ...actual,
    loadAds: (...a) => mockLoadAds(...a),
    deleteAd: (...a) => mockDeleteAd(...a),
    loadAdsResponsables: (...a) => mockLoadAdsResponsables(...a),
  }
})

vi.mock('../components/metricas/metricsApi', () => ({
  loadClients: vi.fn().mockResolvedValue({ data: MOCK_CLIENTS, error: null }),
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

  it('muestra las cards de resumen (Total Ads, Invertido, En Revisión, Completados, Avance Global) del periodo', async () => {
    renderView({ month: 7, year: 2026 })
    await waitFor(() => { expect(screen.getByText('Ad Julio')).toBeInTheDocument() })

    // Periodo julio 2026: Ad Julio (80, Aprobado) + Ad Pepsi (30, Pendiente) = 2 ads, $110 invertidos
    // (el "2" de esta card convive con el índice de fila "2" en la tabla, por eso
    // se busca dentro de la card específica en vez de un getByText('2') global).
    const totalCard = screen.getByText('Total Ads').closest('div')
    expect(totalCard).toHaveTextContent('2')
    expect(screen.getByText('Invertido')).toBeInTheDocument()
    expect(screen.getByText('$110.00')).toBeInTheDocument()
    expect(screen.getByText('Completados')).toBeInTheDocument()
    expect(screen.getByText('Avance Global')).toBeInTheDocument()
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

  describe('paridad visual con la tabla de Tácticas', () => {
    it('el orden de columnas coincide con el especificado (#, Inicio, Nombre, Cliente, Responsable, Fecha fin, Duración, Objetivo, Pieza, Monto, Estado)', async () => {
      renderView({ month: 7, year: 2026 })
      await waitFor(() => { expect(screen.getByText('Ad Julio')).toBeInTheDocument() })

      const headers = screen.getAllByRole('columnheader').map(th => th.textContent)
      expect(headers).toEqual([
        '#', 'Inicio', 'Nombre de campaña', 'Cliente', 'Responsable',
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

    it('la columna índice numera las filas empezando en 1', async () => {
      renderView({ month: 7, year: 2026 })
      await waitFor(() => { expect(screen.getByText('Ad Julio')).toBeInTheDocument() })

      const firstRow = screen.getByText('Ad Julio').closest('tr')
      const indexCell = firstRow.querySelector('td')
      expect(indexCell).toHaveTextContent('1')
    })
  })
})
