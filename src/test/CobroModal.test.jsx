/**
 * CobroModal sigue el mismo patrón que InvoiceModal.jsx: el monto se escribe
 * SIEMPRE en USD (nunca en Bs); un toggle de moneda decide si el cobro entró
 * en Bs, y en ese caso solo se pide/confirma la tasa (BCV auto-resuelta con
 * los 3 escalones de resolveRateBcv, o una tasa personalizada). El
 * equivalente en Bs se deriva de `amount × tasa`. Una tasa personalizada
 * nunca se sube a fin_rates (upsertRate no se llama nunca desde este modal).
 */
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { vi } from 'vitest'

vi.mock('../context/AuthContext', () => ({
  useAuth: () => ({ userProfile: { user_id: 'u-1' } }),
}))

const mockAddPayment = vi.fn().mockResolvedValue({ data: {}, error: null })
const mockResolveRateBcv = vi.fn()
const mockUpdateInvoice = vi.fn().mockResolvedValue({ data: {}, error: null })
const mockLoadUltimasRetenciones = vi.fn().mockResolvedValue({ data: null, error: null })
vi.mock('../components/finanzas/finanzasApi', () => ({
  addPayment: (...a) => mockAddPayment(...a),
  deletePayment: vi.fn(),
  deleteDistributionsForInvoice: vi.fn(),
  resolveRateBcv: (...a) => mockResolveRateBcv(...a),
  updateInvoice: (...a) => mockUpdateInvoice(...a),
  loadUltimasRetenciones: (...a) => mockLoadUltimasRetenciones(...a),
}))

import CobroModal from '../components/finanzas/CobroModal'

const invoice = {
  id: 'inv-1',
  clientName: 'Turbopre',
  concept: 'Gestión de redes',
  amount: 750,
  payments: [],
}

function selectBs() {
  fireEvent.click(screen.getByRole('button', { name: 'Bs' }))
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('CobroModal — el monto siempre se escribe en USD', () => {
  it('sin elegir Bs, no aparece la sección de tasa', () => {
    render(
      <CobroModal
        invoice={invoice}
        companyId="co-1"
        canManage={true}
        onClose={() => {}}
        onSaved={() => {}}
      />,
    )
    expect(screen.queryByText('Tasa BCV')).not.toBeInTheDocument()
    expect(mockResolveRateBcv).not.toHaveBeenCalled()
  })

  it('el monto USD es editable también en modo Bs', async () => {
    mockResolveRateBcv.mockResolvedValue({
      data: { rate: 816, rateDate: '2026-09-23', source: 'bcv' },
      error: null,
    })
    render(
      <CobroModal
        invoice={invoice}
        companyId="co-1"
        canManage={true}
        onClose={() => {}}
        onSaved={() => {}}
      />,
    )
    selectBs()
    await screen.findByText(/BCV 23\/09\/2026/)

    const amountInput = screen.getAllByRole('spinbutton')[0]
    expect(amountInput).not.toHaveAttribute('readonly')
    fireEvent.change(amountInput, { target: { value: '500' } })
    expect(amountInput.value).toBe('500')
  })
})

describe('CobroModal — resolución de la tasa BCV', () => {
  it('con tasa exacta, la muestra y no bloquea', async () => {
    mockResolveRateBcv.mockResolvedValue({
      data: { rate: 816, rateDate: '2026-09-23', source: 'bcv' },
      error: null,
    })
    render(
      <CobroModal
        invoice={invoice}
        companyId="co-1"
        canManage={true}
        onClose={() => {}}
        onSaved={() => {}}
      />,
    )
    selectBs()

    expect(mockResolveRateBcv).toHaveBeenCalledWith('co-1', expect.any(String))
    expect(await screen.findByText(/BCV 23\/09\/2026/)).toBeInTheDocument()
  })

  it('sin tasa exacta, cae a la anterior más reciente y lo avisa', async () => {
    mockResolveRateBcv.mockResolvedValue({
      data: { rate: 800, rateDate: '2026-09-20', source: 'stale' },
      error: null,
    })
    render(
      <CobroModal
        invoice={invoice}
        companyId="co-1"
        canManage={true}
        onClose={() => {}}
        onSaved={() => {}}
      />,
    )
    selectBs()

    expect(await screen.findByText(/No se pudo obtener la tasa de hoy/)).toBeInTheDocument()
    expect(screen.getByText(/20\/09\/2026/)).toBeInTheDocument()
  })

  it('sin ninguna tasa, invita a usar una tasa personalizada y no bloquea el registro', async () => {
    mockResolveRateBcv.mockResolvedValue({
      data: { rate: null, rateDate: null, source: 'missing' },
      error: null,
    })
    render(
      <CobroModal
        invoice={invoice}
        companyId="co-1"
        canManage={true}
        onClose={() => {}}
        onSaved={() => {}}
      />,
    )
    selectBs()

    expect(
      await screen.findByText(/No hay tasa BCV disponible — usa una tasa personalizada/),
    ).toBeInTheDocument()
  })
})

describe('CobroModal — "Usar tasa personalizada"', () => {
  it('precarga la BCV vigente y queda editable', async () => {
    mockResolveRateBcv.mockResolvedValue({
      data: { rate: 816, rateDate: '2026-09-23', source: 'bcv' },
      error: null,
    })
    render(
      <CobroModal
        invoice={invoice}
        companyId="co-1"
        canManage={true}
        onClose={() => {}}
        onSaved={() => {}}
      />,
    )
    selectBs()
    await screen.findByText(/BCV 23\/09\/2026/)

    fireEvent.click(screen.getByRole('button', { name: 'Usar tasa personalizada' }))

    const rateInput = screen.getAllByRole('spinbutton').at(-1)
    expect(rateInput.value).toBe('816')
    expect(screen.getByRole('button', { name: 'Usar tasa BCV' })).toBeInTheDocument()
  })
})

describe('CobroModal — guardar el cobro', () => {
  it('en USD, no envía amountBs/rate/rateSource', async () => {
    render(
      <CobroModal
        invoice={invoice}
        companyId="co-1"
        canManage={true}
        onClose={() => {}}
        onSaved={() => {}}
      />,
    )
    fireEvent.change(screen.getAllByRole('spinbutton')[0], { target: { value: '750' } })

    fireEvent.click(screen.getByRole('button', { name: 'Registrar cobro' }))

    await waitFor(() => expect(mockAddPayment).toHaveBeenCalled())
    expect(mockAddPayment).toHaveBeenCalledWith(
      'inv-1',
      expect.objectContaining({
        currency: 'USD',
        amount: 750,
        amountBs: null,
        rate: null,
        rateSource: null,
      }),
    )
  })

  it('con la BCV auto-resuelta, deriva amountBs de amount × tasa', async () => {
    mockResolveRateBcv.mockResolvedValue({
      data: { rate: 816, rateDate: '2026-09-23', source: 'bcv' },
      error: null,
    })
    render(
      <CobroModal
        invoice={invoice}
        companyId="co-1"
        canManage={true}
        onClose={() => {}}
        onSaved={() => {}}
      />,
    )
    fireEvent.change(screen.getAllByRole('spinbutton')[0], { target: { value: '750' } })
    selectBs()
    await screen.findByText(/BCV 23\/09\/2026/)

    fireEvent.click(screen.getByRole('button', { name: 'Registrar cobro' }))

    await waitFor(() => expect(mockAddPayment).toHaveBeenCalled())
    expect(mockAddPayment).toHaveBeenCalledWith(
      'inv-1',
      expect.objectContaining({
        currency: 'Bs',
        amount: 750,
        amountBs: 612000, // 750 * 816
        rate: 816,
        rateSource: 'bcv',
      }),
    )
  })

  it('con tasa personalizada, deriva amountBs con esa tasa y no llama a upsertRate', async () => {
    mockResolveRateBcv.mockResolvedValue({
      data: { rate: 816, rateDate: '2026-09-23', source: 'bcv' },
      error: null,
    })
    render(
      <CobroModal
        invoice={invoice}
        companyId="co-1"
        canManage={true}
        onClose={() => {}}
        onSaved={() => {}}
      />,
    )
    fireEvent.change(screen.getAllByRole('spinbutton')[0], { target: { value: '750' } })
    selectBs()
    await screen.findByText(/BCV 23\/09\/2026/)

    fireEvent.click(screen.getByRole('button', { name: 'Usar tasa personalizada' }))
    const rateInput = screen.getAllByRole('spinbutton').at(-1)
    fireEvent.change(rateInput, { target: { value: '800' } })

    fireEvent.click(screen.getByRole('button', { name: 'Registrar cobro' }))

    await waitFor(() => expect(mockAddPayment).toHaveBeenCalled())
    expect(mockAddPayment).toHaveBeenCalledWith(
      'inv-1',
      expect.objectContaining({
        currency: 'Bs',
        amount: 750,
        amountBs: 600000, // 750 * 800
        rate: 800,
        rateSource: 'manual',
      }),
    )
  })

  it('valida que haya una tasa antes de guardar', async () => {
    mockResolveRateBcv.mockResolvedValue({
      data: { rate: null, rateDate: null, source: 'missing' },
      error: null,
    })
    render(
      <CobroModal
        invoice={invoice}
        companyId="co-1"
        canManage={true}
        onClose={() => {}}
        onSaved={() => {}}
      />,
    )
    fireEvent.change(screen.getAllByRole('spinbutton')[0], { target: { value: '750' } })
    selectBs()
    await screen.findByText(/No hay tasa BCV disponible/)

    fireEvent.click(screen.getByRole('button', { name: 'Registrar cobro' }))

    expect(await screen.findByText('Ingresa o confirma la tasa BCV')).toBeInTheDocument()
    expect(mockAddPayment).not.toHaveBeenCalled()
  })
})

// ─── Retenciones: se marcan AQUÍ, no en el cliente ni en la factura ──────────
describe('CobroModal — retenciones de impuestos', () => {
  const TODAS = { isl: true, islRate: 0.05, iva: true, ivaRate: 0.75, municipal: true }
  const CON_CLIENTE = { ...invoice, clientId: 'c-1', amount: 1000 }

  function renderCobro(inv = CON_CLIENTE, props = {}) {
    render(
      <CobroModal
        invoice={inv}
        companyId="co-1"
        canManage
        onClose={() => {}}
        onSaved={() => {}}
        {...props}
      />,
    )
  }

  it('sugiere el neto, no el monto facturado, cuando la factura ya trae retenciones', () => {
    renderCobro({ ...CON_CLIENTE, retenciones: TODAS })
    expect(screen.getAllByRole('spinbutton')[0]).toHaveValue(844.83)
    expect(screen.getByText('Neto a cobrar')).toBeInTheDocument()
  })

  it('al marcar un impuesto el monto sugerido baja solo', () => {
    renderCobro()
    expect(screen.getAllByRole('spinbutton')[0]).toHaveValue(1000)
    fireEvent.click(screen.getByLabelText('ISL'))
    // ISL 5% sobre la base de 1.000 → 43,10 retenido.
    expect(screen.getAllByRole('spinbutton')[0]).toHaveValue(956.9)
  })

  it('no pisa el monto si el usuario ya lo escribió a mano', () => {
    renderCobro()
    fireEvent.change(screen.getAllByRole('spinbutton')[0], { target: { value: '500' } })
    fireEvent.click(screen.getByLabelText('ISL'))
    expect(screen.getAllByRole('spinbutton')[0]).toHaveValue(500)
  })

  it('precarga lo que ese cliente retuvo la última vez', async () => {
    mockLoadUltimasRetenciones.mockResolvedValueOnce({ data: TODAS, error: null })
    renderCobro()
    await waitFor(() => expect(screen.getByLabelText('ISL')).toBeChecked())
    expect(screen.getAllByRole('spinbutton')[0]).toHaveValue(844.83)
  })

  it('un cargo externo (sin cliente) no consulta el historial', () => {
    renderCobro({ ...invoice, clientId: null })
    expect(mockLoadUltimasRetenciones).not.toHaveBeenCalled()
  })

  it('guarda las retenciones en la factura ANTES de registrar el pago', async () => {
    const orden = []
    mockUpdateInvoice.mockImplementationOnce(async () => {
      orden.push('updateInvoice')
      return { data: {}, error: null }
    })
    mockAddPayment.mockImplementationOnce(async () => {
      orden.push('addPayment')
      return { data: {}, error: null }
    })
    renderCobro()
    fireEvent.click(screen.getByLabelText('ISL'))
    fireEvent.click(screen.getByRole('button', { name: 'Registrar cobro' }))

    await waitFor(() => expect(mockAddPayment).toHaveBeenCalled())
    expect(orden).toEqual(['updateInvoice', 'addPayment'])
    expect(mockUpdateInvoice).toHaveBeenCalledWith(
      'inv-1',
      expect.objectContaining({
        retenciones: expect.objectContaining({ isl: true, islRate: 0.05 }),
      }),
    )
  })

  // Si se registrara el pago igual, quedaría un cobro contra un neto equivocado
  // y la factura aparecería "Abonado" con una deuda fantasma.
  it('si falla el guardado de las retenciones NO registra el pago', async () => {
    mockUpdateInvoice.mockResolvedValueOnce({ data: null, error: { message: 'sin permiso' } })
    renderCobro()
    fireEvent.click(screen.getByLabelText('ISL'))
    fireEvent.click(screen.getByRole('button', { name: 'Registrar cobro' }))

    await waitFor(() => expect(screen.getByText(/sin permiso/)).toBeInTheDocument())
    expect(mockAddPayment).not.toHaveBeenCalled()
  })

  it('sin tocar las retenciones no escribe la factura', async () => {
    renderCobro()
    fireEvent.click(screen.getByRole('button', { name: 'Registrar cobro' }))
    await waitFor(() => expect(mockAddPayment).toHaveBeenCalled())
    expect(mockUpdateInvoice).not.toHaveBeenCalled()
  })

  it('con la factura ya saldada los checks se ven pero no se editan', () => {
    renderCobro(
      { ...CON_CLIENTE, retenciones: TODAS, payments: [{ amount: 844.83 }] },
      {
        canManage: false,
      },
    )
    expect(screen.getByLabelText('ISL')).toBeChecked()
    expect(screen.getByLabelText('ISL')).toBeDisabled()
  })
})
