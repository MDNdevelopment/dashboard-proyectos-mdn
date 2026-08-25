/**
 * Tests de EmployeeDayEventsModal — detalle de solo lectura de un día del calendario de
 * fechas del equipo. Las filas NO deben navegar a la ficha del empleado (ver
 * EmployeeDatesCalendar.jsx / EmployeesView.jsx): el clic en una card del calendario solo
 * debe mostrar la información del evento.
 */
import { render, screen, fireEvent } from '@testing-library/react'
import { vi } from 'vitest'
import EmployeeDayEventsModal from '../components/empresa/EmployeeDayEventsModal'

const DAY = new Date(2026, 7, 31) // 31/08/2026

function ev(overrides = {}) {
  return {
    id: 'e1',
    dateKey: '2026-08-31',
    type: 'vacation_end',
    employeeId: 'u1',
    employeeName: 'Ovidio Pirela',
    avatarUrl: null,
    label: 'Ovidio Pirela regresa a la oficina',
    detail: null,
    ...overrides,
  }
}

describe('EmployeeDayEventsModal', () => {
  it('muestra el label, el badge del tipo y el detalle de cada evento', () => {
    render(
      <EmployeeDayEventsModal
        date={DAY}
        events={[ev({ detail: 'Prueba vencida' })]}
        onClose={vi.fn()}
      />,
    )
    expect(screen.getByText('Ovidio Pirela regresa a la oficina')).toBeInTheDocument()
    expect(screen.getByText('Regresa a la oficina')).toBeInTheDocument()
    expect(screen.getByText('Prueba vencida')).toBeInTheDocument()
  })

  it('las filas no son clicables — no hay forma de navegar a la ficha del empleado desde acá', () => {
    render(<EmployeeDayEventsModal date={DAY} events={[ev()]} onClose={vi.fn()} />)
    expect(screen.queryByRole('button', { name: /Ovidio Pirela/ })).not.toBeInTheDocument()
  })

  it('sin eventos, muestra el mensaje vacío', () => {
    render(<EmployeeDayEventsModal date={DAY} events={[]} onClose={vi.fn()} />)
    expect(screen.getByText('Sin fechas importantes este día.')).toBeInTheDocument()
  })

  it('el botón Cerrar del footer llama a onClose', () => {
    const onClose = vi.fn()
    render(<EmployeeDayEventsModal date={DAY} events={[ev()]} onClose={onClose} />)
    // Hay dos botones con nombre accesible "Cerrar": la X del header y el del footer.
    fireEvent.click(screen.getByText('Cerrar'))
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})
