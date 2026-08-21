/**
 * Tests de AvCalendar — grid mensual de pautas. Cubre el prop `statusFilter` (usado por
 * AudiovisualView para que los SummaryCard "Agendadas"/"Realizadas" filtren el calendario
 * al hacer click), además del filtro base (solo pautas 'programada'/'realizada' con fecha).
 */
import { render, screen, fireEvent } from '@testing-library/react'
import { vi } from 'vitest'
import AvCalendar from '../components/pautas/AvCalendar'

const TODAY = new Date()
const dateStr = (d) => {
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}
const DAY_15 = new Date(TODAY.getFullYear(), TODAY.getMonth(), 15)

function pauta(overrides = {}) {
  return {
    id: 'p1',
    client_name: 'Cliente A',
    status: 'programada',
    pauta_date: dateStr(DAY_15),
    salida: null,
    formats: [],
    ...overrides,
  }
}

function renderCalendar(props = {}) {
  return render(
    <AvCalendar
      year={TODAY.getFullYear()}
      month={TODAY.getMonth() + 1}
      pautas={[]}
      onMonthChange={vi.fn()}
      onDayClick={vi.fn()}
      onPautaClick={vi.fn()}
      {...props}
    />,
  )
}

describe('AvCalendar', () => {
  it('sin statusFilter, pinta tanto programadas como realizadas', () => {
    renderCalendar({
      pautas: [
        pauta({ id: 'p1', client_name: 'Cliente Programada', status: 'programada' }),
        pauta({ id: 'p2', client_name: 'Cliente Realizada', status: 'realizada' }),
      ],
    })
    expect(screen.getByText('Cliente Programada')).toBeInTheDocument()
    expect(screen.getByText('Cliente Realizada')).toBeInTheDocument()
  })

  it('statusFilter="programada" solo pinta las programadas', () => {
    renderCalendar({
      statusFilter: 'programada',
      pautas: [
        pauta({ id: 'p1', client_name: 'Cliente Programada', status: 'programada' }),
        pauta({ id: 'p2', client_name: 'Cliente Realizada', status: 'realizada' }),
      ],
    })
    expect(screen.getByText('Cliente Programada')).toBeInTheDocument()
    expect(screen.queryByText('Cliente Realizada')).not.toBeInTheDocument()
  })

  it('statusFilter="realizada" solo pinta las realizadas', () => {
    renderCalendar({
      statusFilter: 'realizada',
      pautas: [
        pauta({ id: 'p1', client_name: 'Cliente Programada', status: 'programada' }),
        pauta({ id: 'p2', client_name: 'Cliente Realizada', status: 'realizada' }),
      ],
    })
    expect(screen.queryByText('Cliente Programada')).not.toBeInTheDocument()
    expect(screen.getByText('Cliente Realizada')).toBeInTheDocument()
  })

  it('las solicitudes (sin fecha confirmada) nunca se pintan, con o sin statusFilter', () => {
    renderCalendar({
      pautas: [pauta({ id: 'p1', client_name: 'Cliente Solicitud', status: 'solicitada' })],
    })
    expect(screen.queryByText('Cliente Solicitud')).not.toBeInTheDocument()
  })

  it('clic en "+N más" propaga a onDayClick del día (abre el modal de detalle del día, no crea nada)', () => {
    const onDayClick = vi.fn()
    renderCalendar({
      onDayClick,
      pautas: [
        pauta({ id: 'p1', client_name: 'Cliente 1' }),
        pauta({ id: 'p2', client_name: 'Cliente 2' }),
        pauta({ id: 'p3', client_name: 'Cliente 3' }),
        pauta({ id: 'p4', client_name: 'Cliente 4' }),
      ],
    })
    fireEvent.click(screen.getByText('+1 más'))
    expect(onDayClick).toHaveBeenCalledTimes(1)
    expect(onDayClick).toHaveBeenCalledWith(DAY_15)
  })

  it('clic en una pill de pauta abre su detalle y NO dispara onDayClick', () => {
    const onDayClick = vi.fn()
    const onPautaClick = vi.fn()
    renderCalendar({
      onDayClick,
      onPautaClick,
      pautas: [pauta({ id: 'p1', client_name: 'Cliente 1' })],
    })
    fireEvent.click(screen.getByText('Cliente 1'))
    expect(onPautaClick).toHaveBeenCalledWith(expect.objectContaining({ id: 'p1' }))
    expect(onDayClick).not.toHaveBeenCalled()
  })
})
