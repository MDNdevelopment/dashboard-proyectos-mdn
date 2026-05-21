import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import TicketCard from '../components/tickets/TicketCard'

const baseTicket = {
  id: 1,
  title: 'Mi computadora no enciende',
  status: 'abierto',
  priority: 'alta',
  category: 'hardware',
  created_at: '2026-05-21T10:00:00Z',
  requester: { first_name: 'Juan', last_name: 'Perez' },
}

describe('TicketCard', () => {
  it('muestra el titulo del ticket', () => {
    render(<TicketCard ticket={baseTicket} onClick={() => {}} isIT={false} />)
    expect(screen.getByText('Mi computadora no enciende')).toBeInTheDocument()
  })

  it('muestra el estado y prioridad', () => {
    render(<TicketCard ticket={baseTicket} onClick={() => {}} isIT={false} />)
    expect(screen.getByText('Abierto')).toBeInTheDocument()
    expect(screen.getByText('Alta')).toBeInTheDocument()
  })

  it('muestra categoria', () => {
    render(<TicketCard ticket={baseTicket} onClick={() => {}} isIT={false} />)
    expect(screen.getByText('Hardware')).toBeInTheDocument()
  })

  it('muestra el solicitante si es IT', () => {
    render(<TicketCard ticket={baseTicket} onClick={() => {}} isIT={true} />)
    expect(screen.getByText('Juan Perez')).toBeInTheDocument()
  })

  it('no muestra el solicitante si no es IT', () => {
    render(<TicketCard ticket={baseTicket} onClick={() => {}} isIT={false} />)
    expect(screen.queryByText('Juan Perez')).not.toBeInTheDocument()
  })

  it('llama onClick con el ticket al hacer click', async () => {
    const onClick = vi.fn()
    render(<TicketCard ticket={baseTicket} onClick={onClick} isIT={false} />)
    await userEvent.click(screen.getByRole('button'))
    expect(onClick).toHaveBeenCalledWith(baseTicket)
  })
})
