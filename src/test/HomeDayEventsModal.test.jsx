/**
 * Tests de HomeDayEventsModal — detalle de solo lectura de un día del calendario "Fechas
 * del equipo y clientes" del Home. Calcado de empresa/EmployeeDayEventsModal.test.jsx,
 * agregando la rama de evento de cliente (sin avatar/foto).
 */
import { render, screen, fireEvent } from '@testing-library/react'
import { vi } from 'vitest'
import HomeDayEventsModal from '../components/home/HomeDayEventsModal'

const DAY = new Date(2026, 7, 31) // 31/08/2026

function teamEv(overrides = {}) {
  return {
    id: 'e1',
    dateKey: '2026-08-31',
    type: 'anniversary',
    employeeId: 'u1',
    employeeName: 'Ovidio Pirela',
    avatarUrl: null,
    label: 'Ovidio Pirela cumple 3 años en MDN',
    detail: null,
    ...overrides,
  }
}

function clientEv(overrides = {}) {
  return {
    id: 'ce1',
    dateKey: '2026-08-31',
    type: 'client_mdn_anniversary',
    clientId: 'c1',
    clientName: 'Comsalud',
    label: 'Comsalud cumple 4 años como cliente MDN',
    detail: null,
    ...overrides,
  }
}

describe('HomeDayEventsModal', () => {
  it('muestra el label, el badge del tipo y el detalle de un evento de equipo', () => {
    render(
      <HomeDayEventsModal date={DAY} events={[teamEv({ detail: 'Nota' })]} onClose={vi.fn()} />,
    )
    expect(screen.getByText('Ovidio Pirela cumple 3 años en MDN')).toBeInTheDocument()
    expect(screen.getByText('Aniversario MDN')).toBeInTheDocument()
    expect(screen.getByText('Nota')).toBeInTheDocument()
  })

  it('muestra el label y el badge del tipo de un evento de cliente, con iniciales en vez de foto', () => {
    render(<HomeDayEventsModal date={DAY} events={[clientEv()]} onClose={vi.fn()} />)
    expect(screen.getByText('Comsalud cumple 4 años como cliente MDN')).toBeInTheDocument()
    expect(screen.getByText('Cliente MDN desde')).toBeInTheDocument()
  })

  it('mezcla eventos de equipo y de cliente el mismo día sin romper', () => {
    render(<HomeDayEventsModal date={DAY} events={[teamEv(), clientEv()]} onClose={vi.fn()} />)
    expect(screen.getByText('Ovidio Pirela cumple 3 años en MDN')).toBeInTheDocument()
    expect(screen.getByText('Comsalud cumple 4 años como cliente MDN')).toBeInTheDocument()
  })

  it('las filas no son clicables — no hay forma de navegar a la ficha del empleado ni del cliente', () => {
    render(<HomeDayEventsModal date={DAY} events={[teamEv(), clientEv()]} onClose={vi.fn()} />)
    expect(screen.queryByRole('button', { name: /Ovidio Pirela/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Comsalud/ })).not.toBeInTheDocument()
  })

  it('sin eventos, muestra el mensaje vacío', () => {
    render(<HomeDayEventsModal date={DAY} events={[]} onClose={vi.fn()} />)
    expect(screen.getByText('Sin fechas importantes este día.')).toBeInTheDocument()
  })

  it('el botón Cerrar del footer llama a onClose', () => {
    const onClose = vi.fn()
    render(<HomeDayEventsModal date={DAY} events={[teamEv()]} onClose={onClose} />)
    fireEvent.click(screen.getByText('Cerrar'))
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})
