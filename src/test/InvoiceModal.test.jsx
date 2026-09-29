/**
 * Cubre la facturación en bolívares: el monto sigue siendo USD (no se pide monto
 * en Bs); al elegir "Bs" solo se pide/muestra la tasa (auto-resuelta con el mismo
 * patrón de CobroModal.jsx/PagoPartidaModal.jsx). El botón "Usar tasa
 * personalizada" permite reemplazarla solo para esa factura (nunca toca
 * fin_rates — eso lo hace resolveRateBcv() del lado de la API). El equivalente en
 * Bs que se guarda como referencia (fin_invoices.amount_bs) se deriva de
 * `amount × tasa`, nunca se escribe a mano.
 */
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { vi } from 'vitest'

vi.mock('../context/AuthContext', () => ({
  useAuth: () => ({ userProfile: { user_id: 'u-1' } }),
}))

const mockCreateInvoice = vi.fn().mockResolvedValue({ data: {}, error: null })
const mockUpdateInvoice = vi.fn().mockResolvedValue({ data: {}, error: null })
const mockResolveRateBcv = vi.fn()
vi.mock('../components/finanzas/finanzasApi', () => ({
  createInvoice: (...a) => mockCreateInvoice(...a),
  updateInvoice: (...a) => mockUpdateInvoice(...a),
  resolveRateBcv: (...a) => mockResolveRateBcv(...a),
}))

import InvoiceModal from '../components/finanzas/InvoiceModal'

const CLIENTS = [{ id: 'c-1', name: 'Turbopre', monthly_fee: 2600 }]

// El <select> arranca en "— Otro / cliente externo —" (form.clientId es '' al
// crear, y el value del select cae a OTHER) — no hace falta elegirlo a mano.

function selectBs() {
  fireEvent.click(screen.getByRole('button', { name: 'Bs' }))
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('InvoiceModal — moneda Bs pide solo la tasa (el monto sigue en USD)', () => {
  it('sin elegir Bs, no aparece la sección de tasa', () => {
    render(
      <InvoiceModal
        invoice={null}
        monthId="m-1"
        companyId="co-1"
        clients={CLIENTS}
        onClose={() => {}}
        onSaved={() => {}}
      />,
    )
    expect(screen.queryByText('Tasa BCV')).not.toBeInTheDocument()
    expect(mockResolveRateBcv).not.toHaveBeenCalled()
  })

  it('al elegir Bs, resuelve la tasa y la muestra, sin pedir monto en Bs', async () => {
    mockResolveRateBcv.mockResolvedValue({
      data: { rate: 816, rateDate: '2026-09-28', source: 'bcv' },
      error: null,
    })
    render(
      <InvoiceModal
        invoice={null}
        monthId="m-1"
        companyId="co-1"
        clients={CLIENTS}
        onClose={() => {}}
        onSaved={() => {}}
      />,
    )
    selectBs()

    expect(mockResolveRateBcv).toHaveBeenCalledWith('co-1', expect.any(String))
    expect(await screen.findByText(/BCV 28\/09\/2026/)).toBeInTheDocument()
    expect(screen.queryByText('Monto en Bs')).not.toBeInTheDocument()
  })

  it('con la tasa en "missing", no bloquea: invita a usar una tasa personalizada', async () => {
    mockResolveRateBcv.mockResolvedValue({
      data: { rate: null, rateDate: null, source: 'missing' },
      error: null,
    })
    render(
      <InvoiceModal
        invoice={null}
        monthId="m-1"
        companyId="co-1"
        clients={CLIENTS}
        onClose={() => {}}
        onSaved={() => {}}
      />,
    )
    selectBs()
    expect(await screen.findByText(/No hay tasa BCV disponible/)).toBeInTheDocument()
  })

  it('"Usar tasa personalizada" precarga la BCV vigente y queda editable', async () => {
    mockResolveRateBcv.mockResolvedValue({
      data: { rate: 816, rateDate: '2026-09-28', source: 'bcv' },
      error: null,
    })
    render(
      <InvoiceModal
        invoice={null}
        monthId="m-1"
        companyId="co-1"
        clients={CLIENTS}
        onClose={() => {}}
        onSaved={() => {}}
      />,
    )
    selectBs()
    await screen.findByText(/BCV 28\/09\/2026/)

    fireEvent.click(screen.getByRole('button', { name: 'Usar tasa personalizada' }))

    // Con la tasa personalizada activa, el único spinbutton restante (aparte del
    // monto USD) es el de la tasa.
    const spinbuttons = screen.getAllByRole('spinbutton')
    const rateInput = spinbuttons[spinbuttons.length - 1]
    expect(rateInput.value).toBe('816')
    expect(screen.getByRole('button', { name: 'Usar tasa BCV' })).toBeInTheDocument()
  })

  it('valida que haya una tasa antes de guardar', async () => {
    mockResolveRateBcv.mockResolvedValue({
      data: { rate: null, rateDate: null, source: 'missing' },
      error: null,
    })
    render(
      <InvoiceModal
        invoice={null}
        monthId="m-1"
        companyId="co-1"
        clients={CLIENTS}
        onClose={() => {}}
        onSaved={() => {}}
      />,
    )
    fireEvent.change(screen.getByPlaceholderText('Ej. Café del Lago (página web)'), {
      target: { value: 'Cliente externo' },
    })
    fireEvent.change(screen.getByPlaceholderText('Gestión de redes, Página web, Branding…'), {
      target: { value: 'Branding' },
    })
    fireEvent.change(screen.getAllByRole('spinbutton')[0], { target: { value: '500' } })
    selectBs()
    await screen.findByText(/No hay tasa BCV disponible/)

    fireEvent.click(screen.getByRole('button', { name: 'Agregar' }))

    expect(await screen.findByText('Ingresa o confirma la tasa BCV')).toBeInTheDocument()
    expect(mockCreateInvoice).not.toHaveBeenCalled()
  })

  it('con la BCV auto-resuelta, deriva amountBs de amount × tasa al crear la factura', async () => {
    mockResolveRateBcv.mockResolvedValue({
      data: { rate: 816, rateDate: '2026-09-28', source: 'bcv' },
      error: null,
    })
    render(
      <InvoiceModal
        invoice={null}
        monthId="m-1"
        companyId="co-1"
        clients={CLIENTS}
        onClose={() => {}}
        onSaved={() => {}}
      />,
    )
    fireEvent.change(screen.getByPlaceholderText('Ej. Café del Lago (página web)'), {
      target: { value: 'Cliente externo' },
    })
    fireEvent.change(screen.getByPlaceholderText('Gestión de redes, Página web, Branding…'), {
      target: { value: 'Branding' },
    })
    fireEvent.change(screen.getAllByRole('spinbutton')[0], { target: { value: '750' } })
    selectBs()
    await screen.findByText(/BCV 28\/09\/2026/)

    fireEvent.click(screen.getByRole('button', { name: 'Agregar' }))

    await waitFor(() => expect(mockCreateInvoice).toHaveBeenCalled())
    expect(mockCreateInvoice).toHaveBeenCalledWith(
      'm-1',
      expect.objectContaining({
        currency: 'Bs',
        amount: 750,
        amountBs: 612000, // 750 * 816
        rate: 816,
      }),
    )
  })

  it('con tasa personalizada, deriva amountBs con esa tasa (no con la BCV)', async () => {
    mockResolveRateBcv.mockResolvedValue({
      data: { rate: 816, rateDate: '2026-09-28', source: 'bcv' },
      error: null,
    })
    render(
      <InvoiceModal
        invoice={null}
        monthId="m-1"
        companyId="co-1"
        clients={CLIENTS}
        onClose={() => {}}
        onSaved={() => {}}
      />,
    )
    fireEvent.change(screen.getByPlaceholderText('Ej. Café del Lago (página web)'), {
      target: { value: 'Cliente externo' },
    })
    fireEvent.change(screen.getByPlaceholderText('Gestión de redes, Página web, Branding…'), {
      target: { value: 'Branding' },
    })
    fireEvent.change(screen.getAllByRole('spinbutton')[0], { target: { value: '750' } })
    selectBs()
    await screen.findByText(/BCV 28\/09\/2026/)

    fireEvent.click(screen.getByRole('button', { name: 'Usar tasa personalizada' }))
    const rateInput = screen.getAllByRole('spinbutton').at(-1)
    fireEvent.change(rateInput, { target: { value: '900' } })

    fireEvent.click(screen.getByRole('button', { name: 'Agregar' }))

    await waitFor(() => expect(mockCreateInvoice).toHaveBeenCalled())
    expect(mockCreateInvoice).toHaveBeenCalledWith(
      'm-1',
      expect.objectContaining({ currency: 'Bs', amount: 750, amountBs: 675000, rate: 900 }),
    )
  })
})

describe('InvoiceModal — marcas en intercambio', () => {
  function renderModal(clients) {
    render(
      <InvoiceModal
        invoice={null}
        monthId="m-1"
        companyId="co-1"
        clients={clients}
        onClose={() => {}}
        onSaved={() => {}}
      />,
    )
  }

  it('una marca en intercambio no precarga monto y entra como cargo puntual', () => {
    renderModal([{ id: 'c-1', name: 'Canje', monthly_fee: null, es_intercambio: true }])
    fireEvent.change(screen.getAllByRole('combobox')[0], { target: { value: 'c-1' } })
    expect(screen.getAllByRole('spinbutton')[0]).toHaveValue(null)
    expect(screen.getByLabelText(/Cargo recurrente/)).not.toBeChecked()
  })
})
