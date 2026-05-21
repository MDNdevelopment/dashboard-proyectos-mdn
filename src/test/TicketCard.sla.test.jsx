import { render, screen } from '@testing-library/react'
import { vi } from 'vitest'
import TicketCard from '../components/tickets/TicketCard'

const NOW = new Date('2026-05-21T12:00:00Z').getTime()

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(NOW)
})

afterEach(() => {
  vi.useRealTimers()
})

const base = {
  id: 1,
  title: 'Test ticket',
  category: 'hardware',
  requester: { first_name: 'Ana', last_name: 'Lopez' },
}

describe('TicketCard — SLA badge', () => {
  it('muestra badge Vencido cuando SLA superado', () => {
    // urgente=4h, ticket de hace 5h
    const ticket = {
      ...base,
      status: 'abierto',
      priority: 'urgente',
      created_at: '2026-05-21T07:00:00Z',
    }
    render(<TicketCard ticket={ticket} onClick={() => {}} isIT={false} />)
    expect(screen.getByText('Vencido')).toBeInTheDocument()
  })

  it('muestra badge Por vencer en zona warning', () => {
    // urgente=4h, 75%=3h. Ticket de hace 3.5h
    const ticket = {
      ...base,
      status: 'abierto',
      priority: 'urgente',
      created_at: '2026-05-21T08:30:00Z',
    }
    render(<TicketCard ticket={ticket} onClick={() => {}} isIT={false} />)
    expect(screen.getByText('Por vencer')).toBeInTheDocument()
  })

  it('muestra badge A tiempo dentro del umbral', () => {
    // urgente=4h, ticket de hace 1h
    const ticket = {
      ...base,
      status: 'abierto',
      priority: 'urgente',
      created_at: '2026-05-21T11:00:00Z',
    }
    render(<TicketCard ticket={ticket} onClick={() => {}} isIT={false} />)
    expect(screen.getByText('A tiempo')).toBeInTheDocument()
  })

  it('no muestra badge SLA para tickets resueltos', () => {
    const ticket = {
      ...base,
      status: 'resuelto',
      priority: 'urgente',
      created_at: '2026-05-21T07:00:00Z',
      resolved_at: '2026-05-21T09:00:00Z',
    }
    render(<TicketCard ticket={ticket} onClick={() => {}} isIT={false} />)
    expect(screen.queryByText('Vencido')).not.toBeInTheDocument()
    expect(screen.queryByText('Por vencer')).not.toBeInTheDocument()
    expect(screen.queryByText('A tiempo')).not.toBeInTheDocument()
  })
})
