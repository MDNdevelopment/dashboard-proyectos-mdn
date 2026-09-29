import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi } from 'vitest'

const mockUpdateClient = vi.fn().mockResolvedValue({ data: {}, error: null })
vi.mock('../components/metricas/metricsApi', () => ({
  updateClient: (...a) => mockUpdateClient(...a),
}))

import ClienteFinanzasModal from '../components/finanzas/ClienteFinanzasModal'

const CLIENT = {
  id: 'c-1',
  name: 'Turbopre',
  monthly_fee: 1000,
  payment_day: 5,
  line_id: 'l-1',
  mdn_since: '2024-01-01',
  deleted_at: null,
  contract_end: null,
}
const LINES = [{ id: 'l-1', name: 'Sabrina Bilbao' }]

function renderModal(props = {}) {
  const onClose = vi.fn()
  const onSaved = vi.fn()
  render(
    <ClienteFinanzasModal
      client={CLIENT}
      lines={LINES}
      canManage
      onClose={onClose}
      onSaved={onSaved}
      {...props}
    />,
  )
  return { onClose, onSaved }
}

describe('ClienteFinanzasModal', () => {
  beforeEach(() => vi.clearAllMocks())

  it('precarga la mensualidad y el día de pago del cliente', () => {
    renderModal()
    expect(screen.getByLabelText('Mensualidad (USD)')).toHaveValue(1000)
    expect(screen.getByLabelText('Día de pago')).toHaveValue(5)
  })

  it('guarda los cambios con el payload económico completo', async () => {
    const user = userEvent.setup()
    const { onSaved } = renderModal()
    const monto = screen.getByLabelText('Mensualidad (USD)')
    await user.clear(monto)
    await user.type(monto, '1500')
    await user.click(screen.getByRole('button', { name: 'Guardar cambios' }))

    await waitFor(() => expect(mockUpdateClient).toHaveBeenCalled())
    const [id, payload] = mockUpdateClient.mock.calls[0]
    expect(id).toBe('c-1')
    expect(payload).toEqual({
      es_intercambio: false,
      monthly_fee: 1500,
      payment_day: 5,
    })
    expect(onSaved).toHaveBeenCalled()
  })

  it('al marcar Intercambio limpia y deshabilita la mensualidad', async () => {
    const user = userEvent.setup()
    renderModal()
    await user.click(screen.getByLabelText(/Intercambio/))
    const monto = screen.getByLabelText('Mensualidad (USD)')
    expect(monto).toHaveValue(null)
    expect(monto).toBeDisabled()
  })

  it('guarda el intercambio con la mensualidad en null', async () => {
    const user = userEvent.setup()
    renderModal()
    await user.click(screen.getByLabelText(/Intercambio/))
    await user.click(screen.getByRole('button', { name: 'Guardar cambios' }))
    await waitFor(() => expect(mockUpdateClient).toHaveBeenCalled())
    const [, payload] = mockUpdateClient.mock.calls[0]
    expect(payload.es_intercambio).toBe(true)
    expect(payload.monthly_fee).toBeNull()
  })

  it('no guarda un día de pago fuera de 1–31', async () => {
    const user = userEvent.setup()
    renderModal()
    const dia = screen.getByLabelText('Día de pago')
    await user.clear(dia)
    await user.type(dia, '45')
    await user.click(screen.getByRole('button', { name: 'Guardar cambios' }))
    expect(mockUpdateClient).not.toHaveBeenCalled()
  })

  it('sin canManage no hay botón de guardar y los campos están bloqueados', () => {
    renderModal({ canManage: false })
    expect(screen.queryByRole('button', { name: 'Guardar cambios' })).not.toBeInTheDocument()
    expect(screen.getByLabelText('Mensualidad (USD)')).toBeDisabled()
    expect(screen.getByLabelText('Día de pago')).toBeDisabled()
  })

  // Los impuestos se marcan al registrar el cobro (CobroModal), no aquí.
  it('no configura impuestos: eso vive en el modal de cobro', () => {
    renderModal()
    expect(screen.queryByLabelText('ISL')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('IVA')).not.toBeInTheDocument()
    expect(screen.queryByText(/Impuesto municipal/)).not.toBeInTheDocument()
    expect(screen.queryByText('Neto a cobrar')).not.toBeInTheDocument()
  })
})
