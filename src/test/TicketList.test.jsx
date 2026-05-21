import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import TicketList from '../components/tickets/TicketList'

const tickets = [
  {
    id: 1,
    title: 'Ticket abierto hardware',
    status: 'abierto',
    priority: 'alta',
    category: 'hardware',
    created_at: '2026-05-21T10:00:00Z',
    requester: { first_name: 'Ana', last_name: 'Lopez' },
  },
  {
    id: 2,
    title: 'Ticket resuelto software',
    status: 'resuelto',
    priority: 'baja',
    category: 'software',
    created_at: '2026-05-20T10:00:00Z',
    requester: { first_name: 'Luis', last_name: 'Gomez' },
  },
]

describe('TicketList', () => {
  it('muestra spinner mientras carga', () => {
    const { container } = render(
      <TicketList tickets={[]} loading={true} onSelect={() => {}} isIT={false} />
    )
    expect(container.querySelector('.animate-spin')).toBeInTheDocument()
  })

  it('muestra mensaje de estado vacio si no hay tickets', () => {
    render(<TicketList tickets={[]} loading={false} onSelect={() => {}} isIT={false} />)
    expect(screen.getByText('No hay tickets aun')).toBeInTheDocument()
  })

  it('renderiza todos los tickets', () => {
    render(<TicketList tickets={tickets} loading={false} onSelect={() => {}} isIT={false} />)
    expect(screen.getByText('Ticket abierto hardware')).toBeInTheDocument()
    expect(screen.getByText('Ticket resuelto software')).toBeInTheDocument()
  })

  it('filtra por estado', async () => {
    render(<TicketList tickets={tickets} loading={false} onSelect={() => {}} isIT={false} />)
    await userEvent.selectOptions(screen.getAllByRole('combobox')[0], 'abierto')
    expect(screen.getByText('Ticket abierto hardware')).toBeInTheDocument()
    expect(screen.queryByText('Ticket resuelto software')).not.toBeInTheDocument()
  })

  it('filtra por prioridad', async () => {
    render(<TicketList tickets={tickets} loading={false} onSelect={() => {}} isIT={false} />)
    await userEvent.selectOptions(screen.getAllByRole('combobox')[1], 'baja')
    expect(screen.getByText('Ticket resuelto software')).toBeInTheDocument()
    expect(screen.queryByText('Ticket abierto hardware')).not.toBeInTheDocument()
  })

  it('llama onSelect cuando se hace click en un ticket', async () => {
    const onSelect = vi.fn()
    render(<TicketList tickets={tickets} loading={false} onSelect={onSelect} isIT={false} />)
    await userEvent.click(screen.getByText('Ticket abierto hardware'))
    expect(onSelect).toHaveBeenCalledWith(tickets[0])
  })
})
