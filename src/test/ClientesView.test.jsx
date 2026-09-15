import { render, screen } from '@testing-library/react'
import ClientesView from '../components/finanzas/ClientesView'

const now = new Date()
const CURRENT_ISO = now.toISOString().slice(0, 10)

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

describe('ClientesView', () => {
  it('deriva activos/retirados de clientInMonth (metric_clients), no de un maestro propio', () => {
    render(<ClientesView clients={CLIENTS} lines={LINES} loading={false} />)
    expect(screen.getByText(/1 activos · 1 retirados/)).toBeInTheDocument()
    expect(screen.getByText('Turbopre')).toBeInTheDocument()
    expect(screen.getByText('Ecopack')).toBeInTheDocument()
    expect(screen.getByText('Activo')).toBeInTheDocument()
    expect(screen.getByText('Retirado')).toBeInTheDocument()
  })

  it('muestra la línea del cliente vía metric_lines', () => {
    render(<ClientesView clients={CLIENTS} lines={LINES} loading={false} />)
    expect(screen.getByText('Sabrina Bilbao')).toBeInTheDocument()
    expect(screen.getByText('Sin asignar')).toBeInTheDocument()
  })

  it('muestra "Cargando…" mientras carga', () => {
    render(<ClientesView clients={[]} lines={[]} loading={true} />)
    expect(screen.getByText('Cargando…')).toBeInTheDocument()
  })
})
