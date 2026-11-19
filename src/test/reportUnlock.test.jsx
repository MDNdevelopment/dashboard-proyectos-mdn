/**
 * LineView — desbloqueo de un reporte cerrado (solo admin). El UPDATE/RPC real se prueba en
 * metricsApiUnlock.test.js; aquí metricsApi está mockeado para aislar la vista.
 */
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { vi } from 'vitest'

vi.mock('../components/metricas/LineHubView', () => ({
  default: () => <div data-testid="hub-view" />,
}))
vi.mock('../components/metricas/OperacionesView', () => ({
  default: (props) => (
    <div
      data-testid="operaciones-view"
      data-closed={String(!!props.closed)}
      data-reopened={String(!!props.reopened)}
    />
  ),
}))
vi.mock('../components/metricas/FinanzasView', () => ({
  default: (props) => (
    <div
      data-testid="finanzas-view"
      data-closed={String(!!props.closed)}
      data-reopened={String(!!props.reopened)}
    />
  ),
}))

const mockLoadReport = vi.fn()
const mockCloseReport = vi.fn()
const mockUnlockReport = vi.fn()
vi.mock('../components/metricas/metricsApi', () => ({
  loadReport: (...a) => mockLoadReport(...a),
  closeReport: (...a) => mockCloseReport(...a),
  unlockReport: (...a) => mockUnlockReport(...a),
}))

const mockUseAuth = vi.fn()
vi.mock('../context/AuthContext', () => ({
  useAuth: () => mockUseAuth(),
}))

import LineView from '../components/metricas/LineView'

const MOCK_LINE = { id: 'l-1', name: 'Georgina', color: '#FAB51A', member_user_ids: [] }
const CERRADO = {
  id: 'r-1',
  closed_at: '2026-10-05T12:00:00.000Z',
  closed_by: 'u-9',
  closed_auto: false,
  reopened_at: null,
}
const DESBLOQUEADO = {
  id: 'r-1',
  closed_at: null,
  closed_by: null,
  closed_auto: false,
  reopened_at: '2026-11-19T12:00:00.000Z',
  reopened_by: 'u-1',
}

function renderLineView() {
  return render(
    <MemoryRouter initialEntries={['/reportes/linea/l-1?tab=operaciones']}>
      <LineView line={MOCK_LINE} companyId="co-1" />
    </MemoryRouter>,
  )
}

const admin = { user_id: 'u-1', access_level: 4, admin: true }
const MOTIVO = 'Corregir el sueldo de un empleado'

describe('LineView — desbloquear un reporte cerrado', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockUseAuth.mockReturnValue({ can: () => true, userProfile: admin })
    mockLoadReport.mockResolvedValue({ data: CERRADO, error: null })
    mockUnlockReport.mockResolvedValue({ data: DESBLOQUEADO, error: null })
    mockCloseReport.mockResolvedValue({
      data: { ...CERRADO, closed_at: '2026-11-20T00:00:00.000Z' },
      error: null,
    })
  })

  describe('quién ve el botón', () => {
    it('un admin lo ve en un reporte cerrado', async () => {
      renderLineView()
      expect(await screen.findByRole('button', { name: 'Desbloquear' })).toBeInTheDocument()
    })

    it('un usuario de nivel 4 que NO es admin no lo ve (aunque pueda cerrar)', async () => {
      mockUseAuth.mockReturnValue({
        can: () => true,
        userProfile: { user_id: 'u-2', access_level: 4, admin: false },
      })
      renderLineView()
      await screen.findByText('Reporte cerrado')
      expect(screen.queryByRole('button', { name: 'Desbloquear' })).not.toBeInTheDocument()
    })

    it('la jefa de la línea sin admin tampoco lo ve', async () => {
      mockUseAuth.mockReturnValue({
        can: () => false,
        userProfile: { user_id: 'u-3', access_level: 3, admin: false },
      })
      renderLineView()
      await screen.findByText('Reporte cerrado')
      expect(screen.queryByRole('button', { name: 'Desbloquear' })).not.toBeInTheDocument()
    })

    it('en modo «Ver como» no se ofrece, aunque el perfil sea admin', async () => {
      mockUseAuth.mockReturnValue({ can: () => true, userProfile: admin, isViewingAs: true })
      renderLineView()
      await screen.findByText('Reporte cerrado')
      expect(screen.queryByRole('button', { name: 'Desbloquear' })).not.toBeInTheDocument()
    })

    it('en un reporte abierto no hay nada que desbloquear', async () => {
      mockLoadReport.mockResolvedValue({ data: { id: 'r-1', closed_at: null }, error: null })
      renderLineView()
      await screen.findByText('Cerrar reporte')
      expect(screen.queryByRole('button', { name: 'Desbloquear' })).not.toBeInTheDocument()
    })
  })

  describe('el modal', () => {
    async function abrirModal(user) {
      renderLineView()
      await user.click(await screen.findByRole('button', { name: 'Desbloquear' }))
      return screen.findByLabelText(/Motivo/)
    }

    it('explica qué pasa y exige un motivo de al menos 10 caracteres', async () => {
      const user = userEvent.setup()
      const campo = await abrirModal(user)
      expect(screen.getByText(/Lo que se calcula solo/)).toBeInTheDocument()
      expect(
        screen.getByText(/Quedará registrado quién lo desbloqueó y por qué/),
      ).toBeInTheDocument()

      const confirmar = screen.getByRole('button', { name: 'Sí, desbloquear' })
      expect(confirmar).toBeDisabled()
      await user.type(campo, 'corto')
      expect(confirmar).toBeDisabled()
      await user.clear(campo)
      await user.type(campo, MOTIVO)
      expect(confirmar).toBeEnabled()
    })

    it('los espacios no cuentan como motivo', async () => {
      const user = userEvent.setup()
      const campo = await abrirModal(user)
      await user.type(campo, '              ')
      expect(screen.getByRole('button', { name: 'Sí, desbloquear' })).toBeDisabled()
    })

    it('cancelar cierra el modal sin llamar a la API y limpia el motivo', async () => {
      const user = userEvent.setup()
      const campo = await abrirModal(user)
      await user.type(campo, MOTIVO)
      await user.click(screen.getByRole('button', { name: 'Cancelar' }))
      expect(screen.queryByLabelText(/Motivo/)).not.toBeInTheDocument()
      expect(mockUnlockReport).not.toHaveBeenCalled()

      await user.click(screen.getByRole('button', { name: 'Desbloquear' }))
      expect(await screen.findByLabelText(/Motivo/)).toHaveValue('')
    })

    it('confirmar llama a unlockReport con la línea, el período y el motivo recortado', async () => {
      const user = userEvent.setup()
      const campo = await abrirModal(user)
      await user.type(campo, `  ${MOTIVO}  `)
      await user.click(screen.getByRole('button', { name: 'Sí, desbloquear' }))

      await waitFor(() => {
        expect(mockUnlockReport).toHaveBeenCalledWith(
          'l-1',
          expect.any(Number),
          expect.any(Number),
          MOTIVO,
        )
      })
    })

    it('si la RPC falla, muestra el error en línea y deja el modal abierto', async () => {
      const user = userEvent.setup()
      mockUnlockReport.mockResolvedValue({
        data: null,
        error: { message: 'Solo un administrador puede desbloquear un reporte cerrado' },
      })
      const campo = await abrirModal(user)
      await user.type(campo, MOTIVO)
      await user.click(screen.getByRole('button', { name: 'Sí, desbloquear' }))

      expect(await screen.findByRole('alert')).toHaveTextContent(/Solo un administrador/)
      expect(screen.getByLabelText(/Motivo/)).toHaveValue(MOTIVO)
      expect(screen.getByText('Reporte cerrado')).toBeInTheDocument()
    })
  })

  describe('después de desbloquear', () => {
    async function desbloquear(user) {
      renderLineView()
      await user.click(await screen.findByRole('button', { name: 'Desbloquear' }))
      await user.type(await screen.findByLabelText(/Motivo/), MOTIVO)
      // A partir de aquí la base ya devuelve el reporte desbloqueado (LineView recarga al cambiar de pestaña).
      mockLoadReport.mockResolvedValue({ data: DESBLOQUEADO, error: null })
      await user.click(screen.getByRole('button', { name: 'Sí, desbloquear' }))
      await screen.findByText('Reporte desbloqueado')
    }

    it('muestra el badge «Reporte desbloqueado» y ya no «Reporte cerrado» ni «Desbloquear»', async () => {
      const user = userEvent.setup()
      await desbloquear(user)
      expect(screen.queryByText('Reporte cerrado')).not.toBeInTheDocument()
      expect(screen.queryByRole('button', { name: 'Desbloquear' })).not.toBeInTheDocument()
      expect(screen.queryByLabelText(/Motivo/)).not.toBeInTheDocument()
    })

    it('el botón para volver a cerrar dice «Cerrar de nuevo»', async () => {
      const user = userEvent.setup()
      await desbloquear(user)
      expect(screen.getByRole('button', { name: 'Cerrar de nuevo' })).toBeInTheDocument()
      expect(screen.queryByText('Cerrar reporte')).not.toBeInTheDocument()
    })

    it('las vistas dejan de estar cerradas pero quedan marcadas como desbloqueadas', async () => {
      const user = userEvent.setup()
      await desbloquear(user)
      await waitFor(() => {
        expect(screen.getByTestId('operaciones-view')).toHaveAttribute('data-closed', 'false')
      })
      expect(screen.getByTestId('operaciones-view')).toHaveAttribute('data-reopened', 'true')

      await user.click(screen.getByText('Finanzas'))
      await waitFor(() => {
        expect(screen.getByTestId('finanzas-view')).toHaveAttribute('data-closed', 'false')
      })
      expect(screen.getByTestId('finanzas-view')).toHaveAttribute('data-reopened', 'true')
    })

    it('«Cerrar de nuevo» vuelve a cerrar y regresa al badge «Reporte cerrado»', async () => {
      const user = userEvent.setup()
      await desbloquear(user)
      await user.click(screen.getByRole('button', { name: 'Cerrar de nuevo' }))
      await user.click(await screen.findByRole('button', { name: 'Sí, cerrar el reporte' }))

      expect(await screen.findByText('Reporte cerrado')).toBeInTheDocument()
      expect(mockCloseReport).toHaveBeenCalledWith(
        'l-1',
        expect.any(Number),
        expect.any(Number),
        'u-1',
      )
    })
  })

  it('un reporte cerrado normal propaga reopened=false', async () => {
    renderLineView()
    await waitFor(() => {
      expect(screen.getByTestId('operaciones-view')).toHaveAttribute('data-closed', 'true')
    })
    expect(screen.getByTestId('operaciones-view')).toHaveAttribute('data-reopened', 'false')
  })

  it('un reporte que ya estaba desbloqueado al cargar se ve como desbloqueado', async () => {
    mockLoadReport.mockResolvedValue({ data: DESBLOQUEADO, error: null })
    renderLineView()
    expect(await screen.findByText('Reporte desbloqueado')).toBeInTheDocument()
    expect(screen.getByTestId('operaciones-view')).toHaveAttribute('data-reopened', 'true')
  })

  it('el texto del cierre ya no dice que no hay forma de reabrir', async () => {
    const user = userEvent.setup()
    mockLoadReport.mockResolvedValue({ data: { id: 'r-1', closed_at: null }, error: null })
    renderLineView()
    await user.click(await screen.findByText('Cerrar reporte'))
    expect(await screen.findByText(/Solo un administrador podrá desbloquearlo/)).toBeInTheDocument()
    expect(screen.queryByText(/no hay forma de reabrirlo/)).not.toBeInTheDocument()
  })
})
