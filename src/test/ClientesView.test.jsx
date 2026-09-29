import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi } from 'vitest'

const mockUpdateClient = vi.fn().mockResolvedValue({ data: {}, error: null })
vi.mock('../components/metricas/metricsApi', () => ({
  updateClient: (...a) => mockUpdateClient(...a),
}))

import ClientesView from '../components/finanzas/ClientesView'

const CLIENTS = [
  {
    id: 'c-1',
    name: 'Turbopre',
    monthly_fee: 2600,
    line_id: 'l-1',
    mdn_since: '2024-01-01',
    deleted_at: null,
    contract_end: null,
  },
  {
    id: 'c-2',
    name: 'Ecopack',
    monthly_fee: 1000,
    line_id: null,
    mdn_since: '2024-01-01',
    deleted_at: '2025-01-01',
    baja_incluye_mes: false,
    contract_end: null,
  },
]
const LINES = [{ id: 'l-1', name: 'Sabrina Bilbao' }]

function renderView(props = {}) {
  return render(
    <ClientesView clients={CLIENTS} lines={LINES} loading={false} canManage {...props} />,
  )
}

describe('ClientesView', () => {
  beforeEach(() => vi.clearAllMocks())

  it('deriva activos/retirados de clientInMonth (metric_clients), no de un maestro propio', () => {
    renderView()
    expect(screen.getByText(/1 activos · 1 retirados/)).toBeInTheDocument()
    expect(screen.getByText('Turbopre')).toBeInTheDocument()
    expect(screen.getByText('Ecopack')).toBeInTheDocument()
    expect(screen.getByText('Activo')).toBeInTheDocument()
    expect(screen.getByText('Retirado')).toBeInTheDocument()
  })

  it('muestra la línea del cliente vía metric_lines', () => {
    renderView()
    expect(screen.getByText('Sabrina Bilbao')).toBeInTheDocument()
    expect(screen.getByText('Sin asignar')).toBeInTheDocument()
  })

  it('muestra "Cargando…" mientras carga', () => {
    render(<ClientesView clients={[]} lines={[]} loading={true} />)
    expect(screen.getByText('Cargando…')).toBeInTheDocument()
  })
})

describe('ClientesView — intercambio', () => {
  const CON_CANJE = [
    CLIENTS[0],
    {
      id: 'c-3',
      name: 'Canje SA',
      monthly_fee: null,
      es_intercambio: true,
      line_id: 'l-1',
      mdn_since: '2024-01-01',
      deleted_at: null,
      contract_end: null,
    },
  ]

  it('muestra el chip "Intercambio" en vez del monto', () => {
    render(<ClientesView clients={CON_CANJE} lines={LINES} loading={false} canManage />)
    expect(screen.getByText('Intercambio')).toBeInTheDocument()
  })

  it('cuenta las marcas en intercambio aparte en el resumen', () => {
    render(<ClientesView clients={CON_CANJE} lines={LINES} loading={false} canManage />)
    expect(screen.getByText(/2 activos · 1 en intercambio · 0 retirados/)).toBeInTheDocument()
  })

  it('no dilata el % de cartera: la marca en canje no entra al total', () => {
    render(<ClientesView clients={CON_CANJE} lines={LINES} loading={false} canManage />)
    // Turbopre es el único que factura → 100% de la cartera, no 100/2.
    expect(screen.getByText('100.0%')).toBeInTheDocument()
    // Y la de intercambio no muestra porcentaje.
    expect(screen.getAllByText('—').length).toBeGreaterThan(0)
  })
})

describe('ClientesView — panel financiero', () => {
  it('al hacer click en una fila abre el panel financiero del cliente', async () => {
    const user = userEvent.setup()
    renderView()
    await user.click(screen.getByText('Turbopre'))
    expect(screen.getByText('Mensualidad (USD)')).toBeInTheDocument()
    expect(screen.getByText('Día de pago')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Guardar cambios' })).toBeInTheDocument()
  })

  // Los impuestos se marcan al registrar el cobro, no en el perfil del cliente:
  // el ISLR varía de un mes a otro y la retención se conoce cuando paga.
  it('el panel NO configura impuestos', async () => {
    const user = userEvent.setup()
    renderView()
    await user.click(screen.getByText('Turbopre'))
    expect(screen.queryByText(/Impuestos/i)).not.toBeInTheDocument()
    expect(screen.queryByLabelText('ISL')).not.toBeInTheDocument()
    expect(screen.queryByText('Neto a cobrar')).not.toBeInTheDocument()
  })

  it('el panel es SOLO financiero: no trae contactos, redes ni equipo', async () => {
    const user = userEvent.setup()
    renderView()
    await user.click(screen.getByText('Turbopre'))
    expect(screen.queryByText(/Contactos/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/Redes sociales/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/Equipo/i)).not.toBeInTheDocument()
  })

  it('sin canManage el panel abre en solo lectura', async () => {
    const user = userEvent.setup()
    renderView({ canManage: false })
    await user.click(screen.getByText('Turbopre'))
    expect(screen.queryByRole('button', { name: 'Guardar cambios' })).not.toBeInTheDocument()
    expect(screen.getByLabelText('Mensualidad (USD)')).toBeDisabled()
  })
})
