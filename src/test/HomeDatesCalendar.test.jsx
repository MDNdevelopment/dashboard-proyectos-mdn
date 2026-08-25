/**
 * Tests de HomeDatesCalendar — grid mensual de fechas del equipo y clientes en el Home.
 * Componente puramente de presentación (sin Supabase), calcado de
 * empresa/EmployeeDatesCalendar.test.jsx.
 */
import { render, screen, fireEvent } from '@testing-library/react'
import { vi } from 'vitest'
import HomeDatesCalendar from '../components/home/HomeDatesCalendar'
import { EVENT_TYPES } from '../utils/homeCalendar'

const TODAY = new Date()
const dateStr = (d) => {
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}
const DAY_15 = new Date(TODAY.getFullYear(), TODAY.getMonth(), 15)

function teamEv(overrides = {}) {
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

function clientEv(overrides = {}) {
  return {
    id: 'ce1',
    dateKey: dateStr(DAY_15),
    type: 'client_anniversary',
    clientId: 'c1',
    clientName: 'Cliente Uno',
    label: 'Cliente Uno cumple 5 años',
    detail: null,
    ...overrides,
  }
}

function renderCalendar(props = {}) {
  return render(
    <HomeDatesCalendar
      year={TODAY.getFullYear()}
      month={TODAY.getMonth() + 1}
      events={[]}
      onMonthChange={vi.fn()}
      onDayClick={vi.fn()}
      {...props}
    />,
  )
}

describe('HomeDatesCalendar', () => {
  it('pinta una pill por evento de equipo, con el nombre del empleado', () => {
    renderCalendar({ events: [teamEv({ id: 'e1', employeeName: 'Ana Pérez' })] })
    expect(screen.getByText('Ana Pérez')).toBeInTheDocument()
  })

  it('pinta una pill por evento de cliente, con el nombre del cliente', () => {
    renderCalendar({ events: [clientEv({ id: 'ce1', clientName: 'Comsalud' })] })
    expect(screen.getByText('Comsalud')).toBeInTheDocument()
  })

  it('muestra la leyenda con los 5 tipos de evento (equipo + clientes)', () => {
    renderCalendar()
    Object.values(EVENT_TYPES).forEach((meta) => {
      expect(screen.getByText(meta.label)).toBeInTheDocument()
    })
  })

  it('a partir de MAX_PILLS eventos en un día (mezclando equipo y clientes), colapsa en "+N más"', () => {
    renderCalendar({
      events: [
        teamEv({ id: 'e1', employeeName: 'Persona 1' }),
        teamEv({ id: 'e2', employeeName: 'Persona 2' }),
        clientEv({ id: 'ce1', clientName: 'Cliente 1' }),
      ],
    })
    expect(screen.getByText('+1 más')).toBeInTheDocument()
  })

  it('clic en una pill de cliente abre el día (onDayClick) — nunca navega directo', () => {
    const onDayClick = vi.fn()
    renderCalendar({
      onDayClick,
      events: [clientEv({ id: 'ce1', clientName: 'Comsalud' })],
    })
    fireEvent.click(screen.getByText('Comsalud'))
    expect(onDayClick).toHaveBeenCalledWith(DAY_15)
  })

  it('un día sin eventos no dispara onDayClick al hacer clic', () => {
    const onDayClick = vi.fn()
    renderCalendar({ onDayClick, events: [] })
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

  it('renderiza tanto los puntos (rama móvil) como las pills (rama desktop)', () => {
    const { container } = renderCalendar({ events: [teamEv({ id: 'e1' })] })
    expect(container.querySelector('.sm\\:hidden')).toBeTruthy()
    expect(container.querySelector('.sm\\:block')).toBeTruthy()
  })
})
