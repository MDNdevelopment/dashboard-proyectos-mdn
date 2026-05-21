import { render, screen } from '@testing-library/react'
import TicketStatusBadge from '../components/tickets/TicketStatusBadge'

describe('TicketStatusBadge', () => {
  it('renderiza la etiqueta de estado "abierto"', () => {
    render(<TicketStatusBadge type="status" value="abierto" />)
    expect(screen.getByText('Abierto')).toBeInTheDocument()
  })

  it('renderiza la etiqueta de estado "en_progreso"', () => {
    render(<TicketStatusBadge type="status" value="en_progreso" />)
    expect(screen.getByText('En progreso')).toBeInTheDocument()
  })

  it('renderiza la etiqueta de estado "resuelto"', () => {
    render(<TicketStatusBadge type="status" value="resuelto" />)
    expect(screen.getByText('Resuelto')).toBeInTheDocument()
  })

  it('renderiza prioridad "urgente"', () => {
    render(<TicketStatusBadge type="priority" value="urgente" />)
    expect(screen.getByText('Urgente')).toBeInTheDocument()
  })

  it('no renderiza nada para valor desconocido', () => {
    const { container } = render(<TicketStatusBadge type="status" value="invalido" />)
    expect(container.firstChild).toBeNull()
  })
})
