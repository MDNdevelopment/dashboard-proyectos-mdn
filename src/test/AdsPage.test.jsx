/**
 * Tests de AdsPage: tabs internas "Tácticas" / "Ads". El selector de periodo es solo de Ads;
 * Tácticas tiene dos subvistas, como Tareas: Dashboard y Base (?view=base).
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
import { VENCEN_SEEN_KEY } from '../components/ads/tacticas/TacticasVencenModal'

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
    // El aviso "vencen pronto" del Dashboard sale una vez por sesión: aquí ya se vio.
    window.sessionStorage.setItem(VENCEN_SEEN_KEY, '1')
  })
  afterEach(() => {
    vi.useRealTimers()
    window.sessionStorage.clear()
  })

  const waitDashboard = () =>
    waitFor(() => {
      expect(screen.getByRole('region', { name: 'Resumen de tácticas' })).toBeInTheDocument()
    })

  it('por defecto muestra la tab Tácticas, en el Dashboard', async () => {
    renderPage()
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Tácticas' })).toBeInTheDocument()
    })
    expect(screen.getByRole('button', { name: 'Ads' })).toBeInTheDocument()
    expect(screen.queryByTestId('ads-spend-view-stub')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Dashboard', pressed: true })).toBeInTheDocument()
    await waitDashboard()
    // El Dashboard no tiene la tabla de tácticas: esa vive en Base.
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
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
    await waitDashboard()
    // Tácticas es un historial por marca: no se filtra por mes.
    expect(screen.queryByText('Período')).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Ads' }))
    expect(screen.getByText('Período')).toBeInTheDocument()
    expect(screen.getByTestId('ads-spend-view-stub').textContent).toContain('periodo:7/2026')
  })

  describe('subvistas de Tácticas', () => {
    it('Base lista todas las tácticas, estén vigentes o no', async () => {
      const user = userEvent.setup()
      renderPage()
      await waitDashboard()

      await user.click(screen.getByRole('button', { name: 'Base' }))

      await waitFor(() => {
        expect(screen.getByText('Táctica Junio')).toBeInTheDocument()
      })
      expect(screen.getByText('Táctica Julio')).toBeInTheDocument()
      expect(screen.getByText('Táctica Cruzada')).toBeInTheDocument()
    })

    it('la subvista vive en la URL: ?view=base abre Base directamente', async () => {
      renderPage('/ads?view=base')
      await waitFor(() => {
        expect(screen.getByText('Táctica Junio')).toBeInTheDocument()
      })
      expect(screen.getByRole('button', { name: 'Base', pressed: true })).toBeInTheDocument()
    })

    it('el viejo ?view=historial abre Base', async () => {
      renderPage('/ads?view=historial')
      await waitFor(() => {
        expect(screen.getByText('Táctica Junio')).toBeInTheDocument()
      })
      expect(screen.getByRole('button', { name: 'Base', pressed: true })).toBeInTheDocument()
    })

    it('una ?view= desconocida cae en el Dashboard', async () => {
      renderPage('/ads?view=cualquier-cosa')
      await waitDashboard()
      expect(screen.getByRole('button', { name: 'Dashboard', pressed: true })).toBeInTheDocument()
    })
  })

  describe('Dashboard y filtros de Base', () => {
    it('la torta cuenta las tácticas vigentes y no hay tarjetas de vencimiento', async () => {
      renderPage()
      await waitDashboard()
      const resumen = screen.getByRole('region', { name: 'Resumen de tácticas' })
      // 1 vigente (Julio).
      expect(resumen).toHaveTextContent('1 táctica vigente')
      expect(within(resumen).queryByRole('button', { name: /Vencen/ })).not.toBeInTheDocument()
    })

    it('el filtro Estado de Base usa los grupos de la torta', async () => {
      const user = userEvent.setup()
      renderPage('/ads?view=base')
      await waitFor(() => {
        expect(screen.getByText('Táctica Julio')).toBeInTheDocument()
      })

      // Julio vence el 20-jul, a 5 días: es "Por vencer", no "Urgentes".
      await user.selectOptions(screen.getByLabelText('Estado'), 'urgentes')
      await waitFor(() => {
        expect(screen.getByText('No hay tácticas con esos filtros')).toBeInTheDocument()
      })

      await user.selectOptions(screen.getByLabelText('Estado'), 'por_vencer')
      expect(screen.getByText('Táctica Julio')).toBeInTheDocument()
    })

    it('el aviso "vencen pronto" sale al entrar al Dashboard', async () => {
      window.sessionStorage.removeItem(VENCEN_SEEN_KEY)
      renderPage()
      expect(
        await screen.findByRole('dialog', { name: '1 táctica vence en 10 días o menos' }),
      ).toBeInTheDocument()
    })
  })

  describe('deep-link desde una notificación', () => {
    it('?campaignId=<id> abre el detalle de esa táctica', async () => {
      renderPage('/ads?campaignId=camp-1')
      expect(await screen.findByRole('heading', { name: 'Táctica Julio' })).toBeInTheDocument()
    })

    it('un campaignId que no existe no abre nada ni rompe la página', async () => {
      renderPage('/ads?campaignId=no-existe')
      await waitDashboard()
      expect(screen.queryByRole('heading', { name: 'Táctica Julio' })).not.toBeInTheDocument()
    })
  })
})
