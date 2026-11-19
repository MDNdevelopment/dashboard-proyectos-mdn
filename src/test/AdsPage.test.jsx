/**
 * Tests de AdsPage: tabs internas "Tácticas" / "Ads". El selector de periodo es solo de Ads;
 * Tácticas es un historial por marca con subvistas Vigentes / Por marca / Historial (?view=).
 * AdsSpendView se mockea como stub (tiene sus propios tests en AdsSpendView.test.jsx);
 * aquí solo verificamos que el tab lo monta y le pasa companyId/periodo/canManage.
 */
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { forwardRef, useImperativeHandle } from 'react'
import { MemoryRouter } from 'react-router-dom'
import { vi } from 'vitest'

const { mockOpenCreate } = vi.hoisted(() => ({ mockOpenCreate: vi.fn() }))

const MOCK_CAMPAIGNS = [
  {
    id: 'camp-1',
    name: 'Táctica Julio',
    client: 'Banco Exterior',
    client_id: 'c-1',
    assignee: 'u1',
    priority: 'Media',
    status: 'Pendiente',
    notes: '',
    start_date: '2026-07-05',
    end_date: '2026-07-20',
  },
  {
    id: 'camp-2',
    name: 'Táctica Junio',
    client: 'Pepsi',
    client_id: 'c-2',
    assignee: 'u2',
    priority: 'Alta',
    status: 'En Curso',
    notes: '',
    start_date: '2026-06-01',
    end_date: '2026-06-10',
  },
  {
    id: 'camp-3',
    name: 'Táctica Cruzada',
    client: 'Coca-Cola',
    client_id: 'c-3',
    assignee: 'u1',
    priority: 'Baja',
    status: 'En Curso',
    notes: '',
    start_date: '2026-06-25',
    end_date: '2026-07-05',
  },
]

vi.mock('../supabase', () => ({
  supabase: {
    from: vi.fn((table) => {
      if (table === 'campaigns') {
        return {
          select: vi.fn().mockReturnThis(),
          order: vi.fn().mockResolvedValue({ data: MOCK_CAMPAIGNS, error: null }),
        }
      }
      return {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        order: vi.fn().mockResolvedValue({ data: [], error: null }),
      }
    }),
  },
}))

vi.mock('../components/ads/tacticas/tacticasApi', () => ({
  loadPendingHandoffs: vi.fn().mockResolvedValue({ data: [], error: null }),
  updateHandoff: vi.fn().mockResolvedValue({ data: {}, error: null }),
  updateCampaign: vi.fn().mockResolvedValue({ data: null, error: null }),
}))

vi.mock('../components/metricas/metricsApi', () => ({
  loadClients: vi.fn().mockResolvedValue({ data: [], error: null }),
  loadLines: vi.fn().mockResolvedValue({ data: [], error: null }),
}))

vi.mock('../components/ads/AdsSpendView', () => ({
  default: forwardRef(function AdsSpendViewStub({ companyId, canManage, periodo }, ref) {
    useImperativeHandle(ref, () => ({ openCreate: mockOpenCreate }))
    return (
      <div data-testid="ads-spend-view-stub">
        Ads stub — company:{companyId} canManage:{String(canManage)} periodo:{periodo.month}/
        {periodo.year}
      </div>
    )
  }),
}))

vi.mock('../context/AuthContext', () => ({
  useAuth: vi.fn(),
}))

import { useAuth } from '../context/AuthContext'
import AdsPage from '../pages/AdsPage'

function renderPage(route = '/ads') {
  useAuth.mockReturnValue({
    // admin ⇒ canViewAll ⇒ arranca en "Todos" y no aplica filtro de línea, así estos
    // tests (período/estado, no scoping) ven todas las tácticas.
    userProfile: { user_id: 'u-1', company_id: 'co-1', admin: true },
    can: () => true,
  })
  return render(
    <MemoryRouter initialEntries={[route]}>
      <AdsPage />
    </MemoryRouter>,
  )
}

describe('AdsPage — tabs Tácticas/Ads', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Fija "hoy" en julio 2026: las fixtures asumen que el periodo por defecto
    // (mes actual) es julio. Sin esto, el test depende de la fecha real del
    // sistema y se rompe cada vez que deja de ser julio.
    vi.useFakeTimers({ shouldAdvanceTime: true })
    vi.setSystemTime(new Date('2026-07-15T12:00:00'))
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('por defecto muestra la tab Tácticas, en la subvista Vigentes', async () => {
    renderPage()
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Tácticas' })).toBeInTheDocument()
    })
    expect(screen.getByRole('button', { name: 'Ads' })).toBeInTheDocument()
    expect(screen.queryByTestId('ads-spend-view-stub')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Vigentes', pressed: true })).toBeInTheDocument()
    // "Táctica Julio" está Pendiente y vence el 20-jul (hoy es 15-jul): vigente.
    await waitFor(() => {
      expect(screen.getByText('Táctica Julio')).toBeInTheDocument()
    })
  })

  it('la subvista Vigentes no lista las tácticas ya vencidas', async () => {
    renderPage()
    await waitFor(() => {
      expect(screen.getByText('Táctica Julio')).toBeInTheDocument()
    })
    // Junio vencía el 10-jun y Cruzada el 5-jul: ya no están en marcha.
    expect(screen.queryByText('Táctica Junio')).not.toBeInTheDocument()
    expect(screen.queryByText('Táctica Cruzada')).not.toBeInTheDocument()
  })

  it('cambiar a la tab Ads oculta Tácticas y monta AdsSpendView con las props correctas', async () => {
    const user = userEvent.setup()
    renderPage()
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Ads' })).toBeInTheDocument()
    })

    await user.click(screen.getByRole('button', { name: 'Ads' }))

    expect(screen.getByTestId('ads-spend-view-stub')).toBeInTheDocument()
    expect(screen.getByTestId('ads-spend-view-stub').textContent).toContain('company:co-1')
    expect(screen.getByTestId('ads-spend-view-stub').textContent).toContain('canManage:true')
    // Botón "Nueva táctica" solo pertenece a la tab Tácticas
    expect(screen.queryByRole('button', { name: 'Nueva táctica' })).not.toBeInTheDocument()
  })

  it('en la tab Ads, "Nuevo Ad" aparece en el header (misma ubicación que "Nueva táctica") y abre la creación', async () => {
    const user = userEvent.setup()
    renderPage()
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Ads' })).toBeInTheDocument()
    })

    // En Tácticas el botón del header es "Nueva táctica"
    expect(screen.getByRole('button', { name: 'Nueva táctica' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Nuevo Ad' })).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Ads' }))

    // En Ads el botón del header cambia a "Nuevo Ad" (misma posición)
    expect(screen.queryByRole('button', { name: 'Nueva táctica' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Nuevo Ad' })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Nuevo Ad' }))
    expect(mockOpenCreate).toHaveBeenCalled()
  })

  it('el selector de período es solo de la tab Ads', async () => {
    const user = userEvent.setup()
    renderPage()
    await waitFor(() => {
      expect(screen.getByText('Táctica Julio')).toBeInTheDocument()
    })
    // Tácticas es un historial por marca: no se filtra por mes.
    expect(screen.queryByText('Período')).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Ads' }))
    expect(screen.getByText('Período')).toBeInTheDocument()
    expect(screen.getByTestId('ads-spend-view-stub').textContent).toContain('periodo:7/2026')
  })

  describe('subvistas de Tácticas', () => {
    it('Historial lista todas las tácticas, estén vigentes o no', async () => {
      const user = userEvent.setup()
      renderPage()
      await waitFor(() => {
        expect(screen.getByText('Táctica Julio')).toBeInTheDocument()
      })

      await user.click(screen.getByRole('button', { name: 'Historial' }))

      await waitFor(() => {
        expect(screen.getByText('Táctica Junio')).toBeInTheDocument()
      })
      expect(screen.getByText('Táctica Julio')).toBeInTheDocument()
      expect(screen.getByText('Táctica Cruzada')).toBeInTheDocument()
    })

    it('la subvista vive en la URL: ?view=historial abre el Historial directamente', async () => {
      renderPage('/ads?view=historial')
      await waitFor(() => {
        expect(screen.getByText('Táctica Junio')).toBeInTheDocument()
      })
      expect(screen.getByRole('button', { name: 'Historial', pressed: true })).toBeInTheDocument()
    })

    it('solo hay dos subvistas: la marca se elige en el filtro "Marca" de Vigentes', async () => {
      renderPage()
      await waitFor(() => {
        expect(screen.getByText('Táctica Julio')).toBeInTheDocument()
      })

      expect(screen.queryByRole('button', { name: 'Por marca' })).not.toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Marca' })).toHaveTextContent('Todas las marcas')
    })

    it('una ?view= desconocida cae en Vigentes', async () => {
      renderPage('/ads?view=cualquier-cosa')
      await waitFor(() => {
        expect(screen.getByText('Táctica Julio')).toBeInTheDocument()
      })
      expect(screen.getByRole('button', { name: 'Vigentes', pressed: true })).toBeInTheDocument()
    })
  })

  describe('tarjetas de resumen (Vigentes)', () => {
    it('cuenta las tácticas vigentes y no tiene tarjetas de vencimiento', async () => {
      renderPage()
      await waitFor(() => {
        expect(screen.getByText('Táctica Julio')).toBeInTheDocument()
      })
      const cards = screen.getByRole('region', { name: 'Resumen de tácticas' })
      // 1 vigente (Julio).
      expect(within(cards).getByText('Tácticas vigentes').nextElementSibling).toHaveTextContent('1')
      expect(within(cards).queryByText(/Vencen/)).not.toBeInTheDocument()
    })

    it('"Vencen en 3 días" sigue disponible como filtro de Estado', async () => {
      const user = userEvent.setup()
      renderPage()
      await waitFor(() => {
        expect(screen.getByText('Táctica Julio')).toBeInTheDocument()
      })

      // Julio vence el 20-jul, a 5 días: no entra en "3 días".
      await user.selectOptions(screen.getByLabelText('Estado'), 'vencen3')

      await waitFor(() => {
        expect(screen.getByText('Sin tácticas para los filtros aplicados')).toBeInTheDocument()
      })
    })
  })

  describe('deep-link desde una notificación', () => {
    it('?campaignId=<id> abre el detalle de esa táctica', async () => {
      renderPage('/ads?campaignId=camp-1')
      expect(await screen.findByRole('heading', { name: 'Táctica Julio' })).toBeInTheDocument()
    })

    it('un campaignId que no existe no abre nada ni rompe la página', async () => {
      renderPage('/ads?campaignId=no-existe')
      await waitFor(() => {
        expect(screen.getByText('Táctica Julio')).toBeInTheDocument()
      })
      expect(screen.queryByRole('heading', { name: 'Táctica Julio' })).not.toBeInTheDocument()
    })
  })
})
