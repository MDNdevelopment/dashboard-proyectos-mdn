/**
 * Tests de la feature "Cerrar reporte" (Métricas):
 * - LineView: botón "Cerrar reporte" gated por capability reportes.close,
 *   modal de confirmación, badge "Reporte cerrado", propagación de `closed`
 *   a OperacionesView/FinanzasView
 *
 * El test de metricsApi.closeReport (el UPDATE real sobre metric_reports) vive en
 * metricsApiClose.test.js, en un archivo aparte porque este archivo mockea todo el
 * módulo metricsApi para poder testear LineView de forma aislada.
 */
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { vi } from 'vitest'

// ─── LineView — botón "Cerrar reporte", modal, badge, propagación ──────────────

vi.mock('../components/metricas/LineHubView', () => ({
  default: () => <div data-testid="hub-view" />,
}))
vi.mock('../components/metricas/OperacionesView', () => ({
  default: (props) => <div data-testid="operaciones-view" data-closed={String(!!props.closed)} />,
}))
vi.mock('../components/metricas/FinanzasView', () => ({
  default: (props) => <div data-testid="finanzas-view" data-closed={String(!!props.closed)} />,
}))

const mockLoadReport = vi.fn()
const mockCloseReport = vi.fn()
vi.mock('../components/metricas/metricsApi', () => ({
  loadReport: (...a) => mockLoadReport(...a),
  closeReport: (...a) => mockCloseReport(...a),
}))

const mockUseAuth = vi.fn()
vi.mock('../context/AuthContext', () => ({
  useAuth: () => mockUseAuth(),
}))

import LineView from '../components/metricas/LineView'

const MOCK_LINE = { id: 'l-1', name: 'Georgina', color: '#FAB51A', member_user_ids: [] }

function renderLineView(initialEntry = '/reportes/linea/l-1?tab=operaciones') {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <LineView line={MOCK_LINE} companyId="co-1" />
    </MemoryRouter>,
  )
}

describe('LineView — "Cerrar reporte" (nivel 4 / admin)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockUseAuth.mockReturnValue({
      can: () => true,
      userProfile: { user_id: 'u-1', access_level: 4, admin: true },
    })
    mockLoadReport.mockResolvedValue({
      data: { id: 'r-1', closed_at: null, closed_by: null },
      error: null,
    })
  })

  it('muestra el botón "Cerrar reporte" cuando el usuario tiene la capability y el reporte no está cerrado', async () => {
    renderLineView()
    await waitFor(() => {
      expect(screen.getByText('Cerrar reporte')).toBeInTheDocument()
    })
  })

  it('no muestra el botón para un usuario sin la capability reportes.close', async () => {
    mockUseAuth.mockReturnValue({
      can: () => false,
      userProfile: { user_id: 'u-2', access_level: 3, admin: false },
    })
    renderLineView()
    await waitFor(() => {
      expect(screen.getByTestId('operaciones-view')).toBeInTheDocument()
    })
    expect(screen.queryByText('Cerrar reporte')).not.toBeInTheDocument()
  })

  it('al confirmar el cierre, llama a closeReport y muestra el badge "Reporte cerrado"', async () => {
    const user = userEvent.setup()
    mockCloseReport.mockResolvedValue({
      data: { id: 'r-1', closed_at: '2026-07-15T12:00:00.000Z', closed_by: 'u-1' },
      error: null,
    })
    renderLineView()
    await waitFor(() => {
      expect(screen.getByText('Cerrar reporte')).toBeInTheDocument()
    })

    await user.click(screen.getByText('Cerrar reporte'))
    expect(await screen.findByText(/Sí, cerrar permanentemente/)).toBeInTheDocument()

    await user.click(screen.getByText(/Sí, cerrar permanentemente/))

    await waitFor(() => {
      expect(mockCloseReport).toHaveBeenCalledWith(
        'l-1',
        expect.any(Number),
        expect.any(Number),
        'u-1',
      )
    })
    expect(await screen.findByText('Reporte cerrado')).toBeInTheDocument()
    expect(screen.queryByText('Cerrar reporte')).not.toBeInTheDocument()
  })

  it('propaga closed=true a OperacionesView y FinanzasView cuando el reporte ya está cerrado', async () => {
    mockLoadReport.mockResolvedValue({
      data: { id: 'r-1', closed_at: '2026-07-01T00:00:00.000Z', closed_by: 'u-1' },
      error: null,
    })
    renderLineView()
    await waitFor(() => {
      expect(screen.getByTestId('operaciones-view')).toHaveAttribute('data-closed', 'true')
    })
    expect(screen.getByText('Reporte cerrado')).toBeInTheDocument()

    await userEvent.click(screen.getByText('Finanzas'))
    await waitFor(() => {
      expect(screen.getByTestId('finanzas-view')).toHaveAttribute('data-closed', 'true')
    })
  })

  it('cancelar el modal no cierra el reporte', async () => {
    const user = userEvent.setup()
    renderLineView()
    await waitFor(() => {
      expect(screen.getByText('Cerrar reporte')).toBeInTheDocument()
    })
    await user.click(screen.getByText('Cerrar reporte'))
    expect(await screen.findByText(/Sí, cerrar permanentemente/)).toBeInTheDocument()
    await user.click(screen.getByText('Cancelar'))
    expect(screen.queryByText(/Sí, cerrar permanentemente/)).not.toBeInTheDocument()
    expect(mockCloseReport).not.toHaveBeenCalled()
  })

  it('el badge dice "Cerrado automáticamente" cuando closed_auto es true', async () => {
    mockLoadReport.mockResolvedValue({
      data: {
        id: 'r-1',
        closed_at: '2026-08-05T11:30:00.000Z',
        closed_by: null,
        closed_auto: true,
      },
      error: null,
    })
    renderLineView()
    expect(await screen.findByText('Cerrado automáticamente')).toBeInTheDocument()
  })
})

describe('LineView — jefa de línea puede cerrar su propio reporte', () => {
  const LEAD_LINE = { ...MOCK_LINE, lead_user_id: 'u-lead' }

  beforeEach(() => {
    vi.clearAllMocks()
    mockLoadReport.mockResolvedValue({
      data: { id: 'r-1', closed_at: null, closed_by: null },
      error: null,
    })
  })

  it('la jefa de la línea ve "Marcar reporte como listo" aunque no tenga reportes.close', async () => {
    mockUseAuth.mockReturnValue({
      can: () => false,
      userProfile: { user_id: 'u-lead', access_level: 3, admin: false },
    })
    render(
      <MemoryRouter initialEntries={['/reportes/linea/l-1?tab=operaciones']}>
        <LineView line={LEAD_LINE} companyId="co-1" />
      </MemoryRouter>,
    )
    expect(await screen.findByText('Marcar reporte como listo')).toBeInTheDocument()
  })

  it('una usuaria que no lidera la línea y sin la capability no ve ningún botón', async () => {
    mockUseAuth.mockReturnValue({
      can: () => false,
      userProfile: { user_id: 'u-otra', access_level: 3, admin: false },
    })
    render(
      <MemoryRouter initialEntries={['/reportes/linea/l-1?tab=operaciones']}>
        <LineView line={LEAD_LINE} companyId="co-1" />
      </MemoryRouter>,
    )
    await waitFor(() => {
      expect(screen.getByTestId('operaciones-view')).toBeInTheDocument()
    })
    expect(screen.queryByText('Marcar reporte como listo')).not.toBeInTheDocument()
    expect(screen.queryByText('Cerrar reporte')).not.toBeInTheDocument()
  })
})
