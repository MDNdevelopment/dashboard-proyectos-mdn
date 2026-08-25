/**
 * Tests de EmployeeDatesCalendar — grid mensual de fechas del equipo. Componente
 * puramente de presentación (sin Supabase), calcado de AvCalendar.test.jsx.
 */
import { render, screen, fireEvent } from '@testing-library/react'
import { vi } from 'vitest'
import EmployeeDatesCalendar from '../components/empresa/EmployeeDatesCalendar'
import { EVENT_TYPES } from '../utils/employeeCalendar'

const TODAY = new Date()
const dateStr = (d) => {
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}
const DAY_15 = new Date(TODAY.getFullYear(), TODAY.getMonth(), 15)

function ev(overrides = {}) {
  return {
    id: 'e1',
    dateKey: dateStr(DAY_15),
    type: 'birthday',
    employeeId: 'u1',
    employeeName: 'Empleado Uno',
    avatarUrl: null,
    label: 'Cumpleaños de Empleado Uno',
    detail: null,
    ...overrides,
  }
}

function renderCalendar(props = {}) {
  return render(
    <EmployeeDatesCalendar
      year={TODAY.getFullYear()}
      month={TODAY.getMonth() + 1}
      events={[]}
      onMonthChange={vi.fn()}
      onDayClick={vi.fn()}
      {...props}
    />,
  )
}

describe('EmployeeDatesCalendar', () => {
  it('pinta una pill por evento del día, con el nombre del empleado', () => {
    renderCalendar({ events: [ev({ id: 'e1', employeeName: 'Ana Pérez' })] })
    expect(screen.getByText('Ana Pérez')).toBeInTheDocument()
  })

  it('muestra la leyenda con los cinco tipos de evento', () => {
    renderCalendar()
    Object.values(EVENT_TYPES).forEach((meta) => {
      expect(screen.getByText(meta.label)).toBeInTheDocument()
    })
  })

  it('a partir de MAX_PILLS eventos en un día, colapsa en "+N más"', () => {
    renderCalendar({
      events: [
        ev({ id: 'e1', employeeName: 'Persona 1' }),
        ev({ id: 'e2', employeeName: 'Persona 2' }),
        ev({ id: 'e3', employeeName: 'Persona 3' }),
      ],
    })
    expect(screen.getByText('+1 más')).toBeInTheDocument()
  })

  it('clic en "+N más" abre el día (onDayClick), no crea nada', () => {
    const onDayClick = vi.fn()
    renderCalendar({
      onDayClick,
      events: [
        ev({ id: 'e1', employeeName: 'Persona 1' }),
        ev({ id: 'e2', employeeName: 'Persona 2' }),
        ev({ id: 'e3', employeeName: 'Persona 3' }),
      ],
    })
    fireEvent.click(screen.getByText('+1 más'))
    expect(onDayClick).toHaveBeenCalledTimes(1)
    expect(onDayClick).toHaveBeenCalledWith(DAY_15)
  })

  it('clic en una pill abre el día (onDayClick) — nunca navega directo a la ficha del empleado', () => {
    const onDayClick = vi.fn()
    renderCalendar({
      onDayClick,
      events: [ev({ id: 'e1', employeeName: 'Ana Pérez' })],
    })
    fireEvent.click(screen.getByText('Ana Pérez'))
    expect(onDayClick).toHaveBeenCalledWith(DAY_15)
  })

  it('un día sin eventos no dispara onDayClick al hacer clic', () => {
    const onDayClick = vi.fn()
    renderCalendar({ onDayClick, events: [] })
    // Clic en el número de "hoy" (día sin eventos en este test).
    fireEvent.click(screen.getByText(String(DAY_15.getDate())))
    expect(onDayClick).not.toHaveBeenCalled()
  })

  it('navegación de mes llama a onMonthChange', () => {
    const onMonthChange = vi.fn()
    renderCalendar({ onMonthChange })
    fireEvent.click(screen.getByLabelText('Mes siguiente'))
    expect(onMonthChange).toHaveBeenCalled()
    fireEvent.click(screen.getByLabelText('Mes anterior'))
    expect(onMonthChange).toHaveBeenCalledTimes(2)
    fireEvent.click(screen.getByText('Hoy'))
    expect(onMonthChange).toHaveBeenCalledTimes(3)
  })

  it('renderiza tanto los puntos (rama móvil) como las pills (rama desktop) — el CSS decide cuál se ve', () => {
    // No hay JS de por medio (a diferencia de CalendarView, que sí usa matchMedia para
    // decidir el click): ambas ramas se montan siempre y Tailwind alterna con
    // `sm:hidden` / `hidden sm:block`.
    const { container } = renderCalendar({ events: [ev({ id: 'e1' })] })
    expect(container.querySelector('.sm\\:hidden')).toBeTruthy()
    expect(container.querySelector('.sm\\:block')).toBeTruthy()
  })
})
