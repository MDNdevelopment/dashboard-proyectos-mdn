import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import TicketList from '../components/tickets/TicketList'

const tickets = [
  {
    id: 1,
    title: 'Impresora no funciona',
    description: 'La impresora del segundo piso falla',
    status: 'abierto',
    priority: 'media',
    category: 'hardware',
    created_at: '2026-05-10T10:00:00Z',
    requester: { first_name: 'Ana', last_name: 'Lopez' },
  },
  {
    id: 2,
    title: 'Acceso VPN denegado',
    description: 'No puedo conectar al servidor',
    status: 'resuelto',
    priority: 'alta',
    category: 'accesos',
    created_at: '2026-05-20T10:00:00Z',
    resolved_at: '2026-05-20T12:00:00Z',
    requester: { first_name: 'Luis', last_name: 'Gomez' },
  },
]

describe('TicketList — busqueda y filtros de fecha', () => {
  it('filtra por titulo con busqueda', async () => {
    render(<TicketList tickets={tickets} loading={false} onSelect={() => {}} isIT={false} />)
    await userEvent.type(screen.getByPlaceholderText(/Buscar por titulo/i), 'impresora')
    expect(screen.getByText('Impresora no funciona')).toBeInTheDocument()
    expect(screen.queryByText('Acceso VPN denegado')).not.toBeInTheDocument()
  })

  it('filtra por descripcion con busqueda', async () => {
    render(<TicketList tickets={tickets} loading={false} onSelect={() => {}} isIT={false} />)
    await userEvent.type(screen.getByPlaceholderText(/Buscar por titulo/i), 'servidor')
    expect(screen.getByText('Acceso VPN denegado')).toBeInTheDocument()
    expect(screen.queryByText('Impresora no funciona')).not.toBeInTheDocument()
  })

  it('busqueda es case-insensitive', async () => {
    render(<TicketList tickets={tickets} loading={false} onSelect={() => {}} isIT={false} />)
    await userEvent.type(screen.getByPlaceholderText(/Buscar por titulo/i), 'VPN')
    expect(screen.getByText('Acceso VPN denegado')).toBeInTheDocument()
  })

  it('muestra sin resultados si no hay coincidencias', async () => {
    render(<TicketList tickets={tickets} loading={false} onSelect={() => {}} isIT={false} />)
    await userEvent.type(screen.getByPlaceholderText(/Buscar por titulo/i), 'xyz123')
    expect(screen.getByText('Sin resultados para los filtros aplicados')).toBeInTheDocument()
  })

  it('filtra por fecha desde', async () => {
    render(<TicketList tickets={tickets} loading={false} onSelect={() => {}} isIT={false} />)
    const dateInputs = screen.getAllByDisplayValue('')
    // dateFrom is after the first ticket
    await userEvent.type(dateInputs.find(i => i.type === 'date'), '2026-05-15')
    expect(screen.getByText('Acceso VPN denegado')).toBeInTheDocument()
    expect(screen.queryByText('Impresora no funciona')).not.toBeInTheDocument()
  })

  it('filtra por fecha hasta', async () => {
    render(<TicketList tickets={tickets} loading={false} onSelect={() => {}} isIT={false} />)
    const dateInputs = screen.getAllByDisplayValue('')
    const dateToInputs = dateInputs.filter(i => i.type === 'date')
    // dateTo before second ticket
    await userEvent.type(dateToInputs[1], '2026-05-12')
    expect(screen.getByText('Impresora no funciona')).toBeInTheDocument()
    expect(screen.queryByText('Acceso VPN denegado')).not.toBeInTheDocument()
  })
})
