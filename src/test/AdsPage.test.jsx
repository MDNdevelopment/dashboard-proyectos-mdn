/**
 * Tests de AdsPage: tabs internas "Tácticas" / "Ads" y selector de periodo compartido.
 * AdsSpendView se mockea como stub (tiene sus propios tests en AdsSpendView.test.jsx);
 * aquí solo verificamos que el tab lo monta y le pasa companyId/periodo/canManage.
 */
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { forwardRef, useImperativeHandle } from 'react'
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

vi.mock('../components/metricas/metricsApi', () => ({
  loadClients: vi.fn().mockResolvedValue({ data: [], error: null }),
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

function renderPage() {
  useAuth.mockReturnValue({
    userProfile: { user_id: 'u-1', company_id: 'co-1' },
    can: () => true,
  })
  return render(<AdsPage />)
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

  it('por defecto muestra la tab Tácticas con la tabla de campañas del periodo actual', async () => {
    renderPage()
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Tácticas' })).toBeInTheDocument()
    })
    expect(screen.getByRole('button', { name: 'Ads' })).toBeInTheDocument()
    expect(screen.queryByTestId('ads-spend-view-stub')).not.toBeInTheDocument()
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
    // Botón "Nueva campaña" solo pertenece a la tab Tácticas
    expect(screen.queryByRole('button', { name: 'Nueva campaña' })).not.toBeInTheDocument()
  })

  it('en la tab Ads, "Nuevo Ad" aparece en el header (misma ubicación que "Nueva campaña") y abre la creación', async () => {
    const user = userEvent.setup()
    renderPage()
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Ads' })).toBeInTheDocument()
    })

    // En Tácticas el botón del header es "Nueva campaña"
    expect(screen.getByRole('button', { name: 'Nueva campaña' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Nuevo Ad' })).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Ads' }))

    // En Ads el botón del header cambia a "Nuevo Ad" (misma posición)
    expect(screen.queryByRole('button', { name: 'Nueva campaña' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Nuevo Ad' })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Nuevo Ad' }))
    expect(mockOpenCreate).toHaveBeenCalled()
  })

  it('el selector de periodo filtra las tácticas mostradas', async () => {
    const user = userEvent.setup()
    renderPage()
    await waitFor(() => {
      expect(screen.getByText('Táctica Julio')).toBeInTheDocument()
    })
    expect(screen.queryByText('Táctica Junio')).not.toBeInTheDocument()

    // Cambiar el mes a Junio (6)
    const monthSelect = screen.getAllByRole('combobox')[0]
    await user.selectOptions(monthSelect, '6')

    await waitFor(() => {
      expect(screen.getByText('Táctica Junio')).toBeInTheDocument()
    })
    expect(screen.queryByText('Táctica Julio')).not.toBeInTheDocument()
  })

  describe('cards de resumen (Tácticas)', () => {
    it('ya no muestra la card "Pendientes"', async () => {
      renderPage()
      await waitFor(() => {
        expect(screen.getByText('Táctica Julio')).toBeInTheDocument()
      })
      expect(screen.queryByText('Pendientes')).not.toBeInTheDocument()
    })

    it('clic en "Total tácticas" resetea los filtros', async () => {
      const user = userEvent.setup()
      renderPage()
      await waitFor(() => {
        expect(screen.getByText('Táctica Julio')).toBeInTheDocument()
      })

      await user.type(
        screen.getByPlaceholderText('Buscar táctica, cliente, responsable...'),
        'Cruzada',
      )
      expect(screen.queryByText('Táctica Julio')).not.toBeInTheDocument()

      await user.click(screen.getByText('Total tácticas', { selector: 'p' }))
      await waitFor(() => {
        expect(screen.getByText('Táctica Julio')).toBeInTheDocument()
      })
    })

    it('clic en "En Curso" filtra la tabla a tácticas En Curso', async () => {
      const user = userEvent.setup()
      renderPage()
      await waitFor(() => {
        expect(screen.getByText('Táctica Julio')).toBeInTheDocument()
      })
      expect(screen.getByText('Táctica Cruzada')).toBeInTheDocument()

      await user.click(screen.getByText('En Curso', { selector: 'p' }))
      expect(screen.queryByText('Táctica Julio')).not.toBeInTheDocument()
      expect(screen.getByText('Táctica Cruzada')).toBeInTheDocument()
    })

    it('clic en "Completadas" filtra la tabla a tácticas Finalizado', async () => {
      const user = userEvent.setup()
      renderPage()
      await waitFor(() => {
        expect(screen.getByText('Táctica Julio')).toBeInTheDocument()
      })

      await user.click(screen.getByText('Completadas', { selector: 'p' }))
      await waitFor(() => {
        expect(screen.getByText('Sin resultados para los filtros aplicados')).toBeInTheDocument()
      })
    })
  })

  it('una táctica cuyo rango cruza dos meses aparece en ambos periodos', async () => {
    const user = userEvent.setup()
    renderPage()

    // Período por defecto (julio): la táctica cruzada (jun 25 -> jul 5) debe verse
    await waitFor(() => {
      expect(screen.getByText('Táctica Julio')).toBeInTheDocument()
    })
    expect(screen.getByText('Táctica Cruzada')).toBeInTheDocument()

    // Cambiar a junio: sigue apareciendo, y la de julio ya no
    const monthSelect = screen.getAllByRole('combobox')[0]
    await user.selectOptions(monthSelect, '6')

    await waitFor(() => {
      expect(screen.getByText('Táctica Junio')).toBeInTheDocument()
    })
    expect(screen.getByText('Táctica Cruzada')).toBeInTheDocument()
    expect(screen.queryByText('Táctica Julio')).not.toBeInTheDocument()
  })
})
