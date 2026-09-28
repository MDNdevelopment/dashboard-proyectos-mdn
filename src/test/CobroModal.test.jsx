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
vi.mock('../components/finanzas/finanzasApi', () => ({
  addPayment: (...a) => mockAddPayment(...a),
  deletePayment: vi.fn(),
  deleteDistributionsForInvoice: vi.fn(),
  resolveRateBcv: (...a) => mockResolveRateBcv(...a),
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
