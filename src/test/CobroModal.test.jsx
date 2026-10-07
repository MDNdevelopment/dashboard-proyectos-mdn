/**
 * CobroModal sigue el mismo patrón que InvoiceModal.jsx: el monto se escribe
 * SIEMPRE en USD (nunca en Bs). Hay una fila por forma de pago (USD, Bs,
 * Intercambio) y se guardan todas juntas; si la fila Bs tiene monto solo se
 * pide/confirma la tasa (BCV auto-resuelta con los 3 escalones de
 * resolveRateBcv, o una tasa personalizada). El equivalente en Bs se deriva de
 * `amount × tasa`. Una tasa personalizada
 * nunca se sube a fin_rates (upsertRate no se llama nunca desde este modal).
 */
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { vi } from 'vitest'

vi.mock('../context/AuthContext', () => ({
  useAuth: () => ({ userProfile: { user_id: 'u-1' } }),
}))

const mockAddPaymentsBatch = vi.fn().mockResolvedValue({ data: {}, error: null })
const mockResolveRateBcv = vi.fn()
const mockUpdateInvoice = vi.fn().mockResolvedValue({ data: {}, error: null })
const mockLoadUltimasRetenciones = vi.fn().mockResolvedValue({ data: null, error: null })
vi.mock('../components/finanzas/finanzasApi', () => ({
  addPaymentsBatch: (...a) => mockAddPaymentsBatch(...a),
  deletePayment: vi.fn(),
  deleteDistributionsForInvoice: vi.fn(),
  resolveRateBcv: (...a) => mockResolveRateBcv(...a),
  updateInvoice: (...a) => mockUpdateInvoice(...a),
  loadUltimasRetenciones: (...a) => mockLoadUltimasRetenciones(...a),
}))

import CobroModal from '../components/finanzas/CobroModal'
import { MAX_PAGOS } from '../utils/cobroPagos'

const invoice = {
  id: 'inv-1',
  clientName: 'Turbopre',
  concept: 'Gestión de redes',
  amount: 750,
  payments: [],
}

const escribir = (etiqueta, valor) =>
  fireEvent.change(screen.getByLabelText(etiqueta), { target: { value: valor } })

const agregarPago = () => fireEvent.click(screen.getByRole('button', { name: '+ Agregar pago' }))

/** Pone el primer pago en Bs con ese monto (USD); eso activa la sección de tasa. */
function llenarBs(valor = '750') {
  escribir('Forma de pago 1', 'Bs')
  escribir('Monto pago 1', valor)
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

  it('con un pago en Bs y otro en USD, el USD sugerido es lo que falta y sigue editable', async () => {
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
    llenarBs('400')
    await screen.findByText(/BCV 23\/09\/2026/)
    agregarPago()
    escribir('Forma de pago 2', 'USD')

    // 750 facturados − 400 en Bs → quedan 350 sugeridos en el segundo pago.
    const usd = screen.getByLabelText('Monto pago 2')
    expect(usd).toHaveValue(350)
    fireEvent.change(usd, { target: { value: '300' } })
    expect(usd).toHaveValue(300)
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
    llenarBs()

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
    llenarBs()

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
    llenarBs()

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
    llenarBs()
    await screen.findByText(/BCV 23\/09\/2026/)

    fireEvent.click(screen.getByRole('button', { name: 'Usar tasa personalizada' }))

    const rateInput = screen.getByLabelText('Tasa personalizada')
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

    await waitFor(() => expect(mockAddPaymentsBatch).toHaveBeenCalled())
    expect(mockAddPaymentsBatch).toHaveBeenCalledWith('inv-1', [
      expect.objectContaining({
        currency: 'USD',
        amount: 750,
        amountBs: null,
        rate: null,
        rateSource: null,
      }),
    ])
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
    llenarBs()
    await screen.findByText(/BCV 23\/09\/2026/)

    fireEvent.click(screen.getByRole('button', { name: 'Registrar cobro' }))

    await waitFor(() => expect(mockAddPaymentsBatch).toHaveBeenCalled())
    expect(mockAddPaymentsBatch).toHaveBeenCalledWith('inv-1', [
      expect.objectContaining({
        currency: 'Bs',
        amount: 750,
        amountBs: 612000, // 750 * 816
        rate: 816,
        rateSource: 'bcv',
      }),
    ])
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
    llenarBs()
    await screen.findByText(/BCV 23\/09\/2026/)

    fireEvent.click(screen.getByRole('button', { name: 'Usar tasa personalizada' }))
    const rateInput = screen.getByLabelText('Tasa personalizada')
    fireEvent.change(rateInput, { target: { value: '800' } })

    fireEvent.click(screen.getByRole('button', { name: 'Registrar cobro' }))

    await waitFor(() => expect(mockAddPaymentsBatch).toHaveBeenCalled())
    expect(mockAddPaymentsBatch).toHaveBeenCalledWith('inv-1', [
      expect.objectContaining({
        currency: 'Bs',
        amount: 750,
        amountBs: 600000, // 750 * 800
        rate: 800,
        rateSource: 'manual',
      }),
    ])
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
    llenarBs()
    await screen.findByText(/No hay tasa BCV disponible/)

    fireEvent.click(screen.getByRole('button', { name: 'Registrar cobro' }))

    expect(await screen.findByText('Ingresa o confirma la tasa BCV')).toBeInTheDocument()
    expect(mockAddPaymentsBatch).not.toHaveBeenCalled()
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
    mockAddPaymentsBatch.mockImplementationOnce(async () => {
      orden.push('addPaymentsBatch')
      return { data: {}, error: null }
    })
    renderCobro()
    fireEvent.click(screen.getByLabelText('ISL'))
    fireEvent.click(screen.getByRole('button', { name: 'Registrar cobro' }))

    await waitFor(() => expect(mockAddPaymentsBatch).toHaveBeenCalled())
    expect(orden).toEqual(['updateInvoice', 'addPaymentsBatch'])
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
    expect(mockAddPaymentsBatch).not.toHaveBeenCalled()
  })

  it('sin tocar las retenciones no escribe la factura', async () => {
    renderCobro()
    fireEvent.click(screen.getByRole('button', { name: 'Registrar cobro' }))
    await waitFor(() => expect(mockAddPaymentsBatch).toHaveBeenCalled())
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

describe('CobroModal — cobro dividido en varios pagos', () => {
  function renderModal(props = {}) {
    const onClose = vi.fn()
    const onSaved = vi.fn()
    render(
      <CobroModal
        invoice={invoice}
        companyId="co-1"
        canManage={true}
        onClose={onClose}
        onSaved={onSaved}
        {...props}
      />,
    )
    return { onClose, onSaved }
  }

  const registrar = () => fireEvent.click(screen.getByRole('button', { name: 'Registrar cobro' }))

  it('arranca con un solo pago en USD con todo el pendiente y sin botón de quitar', () => {
    renderModal()
    expect(screen.getByLabelText('Forma de pago 1')).toHaveValue('USD')
    expect(screen.getByLabelText('Monto pago 1')).toHaveValue(750)
    expect(screen.queryByLabelText('Monto pago 2')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Quitar pago/ })).not.toBeInTheDocument()
  })

  it('dinero e intercambio van en UN solo guardado, un abono por pago', async () => {
    renderModal()
    escribir('Monto pago 1', '375')
    agregarPago()
    // El segundo pago arranca en Intercambio y ya trae lo que falta.
    expect(screen.getByLabelText('Forma de pago 2')).toHaveValue('Intercambio')
    expect(screen.getByLabelText('Monto pago 2')).toHaveValue(375)
    escribir('Nota pago 2', '3 sesiones de fotos')

    registrar()
    await waitFor(() => expect(mockAddPaymentsBatch).toHaveBeenCalledTimes(1))
    expect(mockAddPaymentsBatch).toHaveBeenCalledWith('inv-1', [
      expect.objectContaining({
        currency: 'USD',
        amount: 375,
        amountBs: null,
        rate: null,
        rateSource: null,
        method: 'Zelle',
      }),
      expect.objectContaining({
        currency: 'Intercambio',
        amount: 375,
        amountBs: null,
        rate: null,
        rateSource: null,
        method: 'Productos',
        note: '3 sesiones de fotos',
      }),
    ])
  })

  it('bajar el primer pago reparte el resto en el segundo, sin hacer cuentas', () => {
    renderModal()
    agregarPago()
    // Con el primero en 750 no queda saldo para el segundo…
    expect(screen.getByLabelText('Monto pago 2')).toHaveValue(null)
    // …pero al bajar el primero, el segundo toma la diferencia solo.
    escribir('Monto pago 1', '500')
    expect(screen.getByLabelText('Monto pago 2')).toHaveValue(250)
    expect(screen.getByText(/Falta \$0/)).toBeInTheDocument()
  })

  it('USD + Intercambio + Bs: la tasa se pide una sola vez, por el pago en Bs', async () => {
    mockResolveRateBcv.mockResolvedValue({
      data: { rate: 800, rateDate: '2026-09-23', source: 'bcv' },
      error: null,
    })
    renderModal()
    escribir('Monto pago 1', '300')
    agregarPago()
    escribir('Monto pago 2', '250')
    expect(screen.queryByText('Tasa BCV')).not.toBeInTheDocument()

    agregarPago() // el tercero es Bs y trae los 200 que faltan
    expect(screen.getByLabelText('Forma de pago 3')).toHaveValue('Bs')
    await screen.findByText(/BCV 23\/09\/2026/)
    expect(screen.getAllByText('Tasa BCV')).toHaveLength(1)

    registrar()
    await waitFor(() => expect(mockAddPaymentsBatch).toHaveBeenCalledTimes(1))
    const [, filas] = mockAddPaymentsBatch.mock.calls[0]
    expect(filas.map((f) => [f.currency, f.amount])).toEqual([
      ['USD', 300],
      ['Intercambio', 250],
      ['Bs', 200],
    ])
    expect(filas[2]).toEqual(
      expect.objectContaining({ amountBs: 160000, rate: 800, rateSource: 'bcv' }),
    )
  })

  it('dos pagos en Bs comparten una sola tasa', async () => {
    mockResolveRateBcv.mockResolvedValue({
      data: { rate: 816, rateDate: '2026-09-23', source: 'bcv' },
      error: null,
    })
    renderModal()
    llenarBs('400')
    agregarPago()
    escribir('Forma de pago 2', 'Bs')
    escribir('Monto pago 2', '350')
    await screen.findByText(/BCV 23\/09\/2026/)
    expect(screen.getAllByText('Tasa BCV')).toHaveLength(1)

    registrar()
    await waitFor(() => expect(mockAddPaymentsBatch).toHaveBeenCalledTimes(1))
    const [, filas] = mockAddPaymentsBatch.mock.calls[0]
    expect(filas.map((f) => [f.amount, f.amountBs, f.rate])).toEqual([
      [400, 326400, 816],
      [350, 285600, 816],
    ])
  })

  it('se puede repetir una forma con otro método (Zelle + Efectivo $)', async () => {
    renderModal()
    escribir('Monto pago 1', '500')
    agregarPago()
    escribir('Forma de pago 2', 'USD')
    escribir('Método pago 2', 'Efectivo $')

    registrar()
    await waitFor(() => expect(mockAddPaymentsBatch).toHaveBeenCalledTimes(1))
    const [, filas] = mockAddPaymentsBatch.mock.calls[0]
    expect(filas.map((f) => [f.currency, f.method, f.amount])).toEqual([
      ['USD', 'Zelle', 500],
      ['USD', 'Efectivo $', 250],
    ])
  })

  it('✕ quita un pago y el que queda vuelve a autocompletarse', () => {
    renderModal()
    escribir('Monto pago 1', '500')
    agregarPago()
    fireEvent.click(screen.getByRole('button', { name: 'Quitar pago 1' }))

    expect(screen.queryByLabelText('Monto pago 2')).not.toBeInTheDocument()
    expect(screen.getByLabelText('Monto pago 1')).toHaveValue(750)
    expect(screen.queryByRole('button', { name: /Quitar pago/ })).not.toBeInTheDocument()
  })

  it('"+ Agregar pago" se deshabilita al llegar al tope de pagos', () => {
    renderModal()
    const boton = screen.getByRole('button', { name: '+ Agregar pago' })
    for (let i = 1; i < MAX_PAGOS; i++) fireEvent.click(boton)
    expect(screen.getByLabelText(`Monto pago ${MAX_PAGOS}`)).toBeInTheDocument()
    expect(boton).toBeDisabled()
  })

  it('si lo asignado supera lo pendiente, avisa y no guarda nada', async () => {
    renderModal()
    escribir('Monto pago 1', '500')
    agregarPago()
    escribir('Monto pago 2', '500')
    expect(screen.getByText(/Excede por \$250/)).toBeInTheDocument()

    registrar()
    expect(await screen.findByText('No puedes cobrar más de lo pendiente')).toBeInTheDocument()
    expect(mockAddPaymentsBatch).not.toHaveBeenCalled()
  })

  it('un cobro parcial deja el modal abierto con un pago nuevo que trae lo que falta', async () => {
    const { onClose, onSaved } = renderModal()
    escribir('Monto pago 1', '375')
    registrar()

    await waitFor(() => expect(onSaved).toHaveBeenCalled())
    expect(onClose).not.toHaveBeenCalled()
    // La lista se reinicia a un solo pago autocompletado.
    await waitFor(() => expect(screen.getByLabelText('Monto pago 1')).toHaveValue(750))
    expect(screen.queryByLabelText('Monto pago 2')).not.toBeInTheDocument()
  })

  it('un cobro que salda la factura cierra el modal', async () => {
    const { onClose } = renderModal()
    registrar()
    await waitFor(() => expect(onClose).toHaveBeenCalled())
  })

  it('el intercambio ya recibido salda parte de la factura y no cuenta como cobrado', () => {
    renderModal({
      invoice: {
        ...invoice,
        payments: [{ id: 'p-1', amount: 250, currency: 'Intercambio', method: 'Productos' }],
      },
    })
    expect(screen.getByText('Cobro y abonos')).toBeInTheDocument()
    // Cobrado (dinero) en $0; el canje aparece en su propia card y en el abono.
    expect(screen.getAllByText('Intercambio').length).toBeGreaterThan(1)
    // El pendiente sugerido descuenta el canje: 750 − 250.
    expect(screen.getByLabelText('Monto pago 1')).toHaveValue(500)
  })

  it('la fecha por defecto es la de HOY en hora local, no la UTC', () => {
    // 22:30 locales: en una zona detrás de UTC (Caracas), toISOString() ya diría el día siguiente.
    vi.useFakeTimers({ toFake: ['Date'] })
    try {
      vi.setSystemTime(new Date(2026, 9, 7, 22, 30))
      renderModal()
      expect(screen.getByLabelText('Fecha')).toHaveValue('2026-10-07')
    } finally {
      vi.useRealTimers()
    }
  })
})
