/**
 * Tests de CalendarView — grid mensual construido con date-fns. Cubre el título del mes,
 * que las reuniones aparecen en el día correcto, la navegación de mes, los clicks en día
 * vacío / en una reunión, y los 4 estados visuales de una pill (programada futura,
 * realizada, cancelada, vencida sin marcar) junto al toggle rápido de "realizada".
 */
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi } from 'vitest'
import CalendarView from '../components/reuniones/CalendarView'

const MEETINGS = [
  { id: 'm-1', title: 'Kickoff', starts_at: '2026-07-15T14:00:00', status: 'programada' },
  { id: 'm-2', title: 'Cancelada', starts_at: '2026-07-20T10:00:00', status: 'cancelada' },
]

function renderCalendar(props = {}) {
  return render(
    <CalendarView
      year={2026}
      month={7}
      meetings={MEETINGS}
      onMonthChange={vi.fn()}
      onDayClick={vi.fn()}
      onMeetingClick={vi.fn()}
      onToggleHeld={vi.fn()}
      {...props}
    />
  )
}

describe('CalendarView', () => {
  it('muestra el título del mes/año', () => {
    renderCalendar()
    expect(screen.getByText(/julio 2026/i)).toBeInTheDocument()
  })

  it('muestra las reuniones del mes con su hora y título', () => {
    renderCalendar()
    expect(screen.getByText(/14:00 Kickoff/)).toBeInTheDocument()
  })

  it('marca visualmente una reunión cancelada (tachada, con ícono X)', () => {
    renderCalendar()
    const pill = screen.getByText(/10:00 Cancelada/).closest('[role="button"]')
    expect(pill.className).toContain('line-through')
    expect(pill.querySelector('svg')).toBeTruthy()
  })

  it('onMonthChange navega al mes siguiente/anterior', async () => {
    const user = userEvent.setup()
    const onMonthChange = vi.fn()
    renderCalendar({ onMonthChange })
    await user.click(screen.getByLabelText('Mes siguiente'))
    expect(onMonthChange).toHaveBeenCalledWith(2026, 8)

    await user.click(screen.getByLabelText('Mes anterior'))
    expect(onMonthChange).toHaveBeenCalledWith(2026, 6)
  })

  it('click en una reunión llama a onMeetingClick con esa reunión (sin propagar a onDayClick)', async () => {
    const user = userEvent.setup()
    const onMeetingClick = vi.fn()
    const onDayClick = vi.fn()
    renderCalendar({ onMeetingClick, onDayClick })
    await user.click(screen.getByText(/14:00 Kickoff/))
    expect(onMeetingClick).toHaveBeenCalledWith(MEETINGS[0])
    expect(onDayClick).not.toHaveBeenCalled()
  })

  it('click en un día vacío llama a onDayClick con esa fecha', async () => {
    const user = userEvent.setup()
    const onDayClick = vi.fn()
    renderCalendar({ onDayClick })
    // Día 10 de julio 2026 no tiene reuniones (único "10" en el grid: no hay overflow
    // de junio/agosto que llegue a ese número en este mes)
    await user.click(screen.getByText('10'));
    expect(onDayClick).toHaveBeenCalled()
  })
})

describe('CalendarView — estados visuales por status', () => {
  // "Vencida"/"futura" dependen de la hora actual (Date.now() real, sin fake timers —
  // combinarlos con userEvent.click cuelga el test). Usamos años absolutos muy en el
  // pasado/futuro para que la comparación con "ahora" sea determinista sin importar
  // cuándo corra la suite, pasando el year/month correspondiente a renderCalendar.

  it('una reunión "programada" futura se ve azul, sin ícono de toggle', () => {
    const meetings = [{ id: 'm-1', title: 'Futura', starts_at: '2099-01-25T14:00:00', status: 'programada' }]
    renderCalendar({ meetings, year: 2099, month: 1 })
    const pill = screen.getByText(/14:00 Futura/).closest('[role="button"]')
    expect(pill.className).toContain('bg-blue-50')
    expect(pill.className).not.toContain('line-through')
    expect(screen.queryByRole('button', { name: /Marcar "Futura" como realizada/ })).not.toBeInTheDocument()
  })

  it('una reunión "realizada" muestra ✓ y texto normal (no tachado)', () => {
    const meetings = [{ id: 'm-1', title: 'Hecha', starts_at: '2020-01-10T14:00:00', status: 'realizada' }]
    renderCalendar({ meetings, year: 2020, month: 1 })
    const pill = screen.getByText(/Hecha/).closest('[role="button"]')
    expect(pill.className).not.toContain('line-through')
    expect(screen.getByRole('button', { name: /Desmarcar "Hecha" como realizada/ })).toBeInTheDocument()
  })

  it('una reunión "programada" con fecha vencida se ve en estado de alerta', () => {
    const meetings = [{ id: 'm-1', title: 'Vencida', starts_at: '2020-01-10T14:00:00', status: 'programada' }]
    renderCalendar({ meetings, year: 2020, month: 1 })
    const pill = screen.getByText(/Vencida/).closest('[role="button"]')
    expect(pill.className).toContain('red')
    // No hay botón de marcar directo — el ícono de alerta es solo decorativo, click abre el detalle
    expect(screen.queryByRole('button', { name: /Marcar "Vencida" como realizada/ })).not.toBeInTheDocument()
  })

  it('una reunión de HOY con la hora ya pasada NO se ve en alerta (vence recién al día siguiente)', () => {
    const today = new Date()
    today.setHours(0, 0, 1, 0) // temprano en el día — casi seguro ya "pasó" respecto a la hora actual
    const meetings = [{ id: 'm-1', title: 'DeHoy', starts_at: today.toISOString(), status: 'programada' }]
    renderCalendar({ meetings, year: today.getFullYear(), month: today.getMonth() + 1 })
    const pill = screen.getByText(/DeHoy/).closest('[role="button"]')
    expect(pill.className).not.toContain('red')
    expect(screen.queryByRole('button', { name: /Marcar "DeHoy" como realizada/ })).not.toBeInTheDocument()
  })

  it('una reunión de AYER sí se ve en alerta (el día ya pasó)', () => {
    const yesterday = new Date()
    yesterday.setDate(yesterday.getDate() - 1)
    const meetings = [{ id: 'm-1', title: 'DeAyer', starts_at: yesterday.toISOString(), status: 'programada' }]
    renderCalendar({ meetings, year: yesterday.getFullYear(), month: yesterday.getMonth() + 1 })
    const pill = screen.getByText(/DeAyer/).closest('[role="button"]')
    expect(pill.className).toContain('red')
  })

  it('click en el ✓ de una realizada llama a onToggleHeld sin llamar a onMeetingClick', async () => {
    const user = userEvent.setup()
    const onMeetingClick = vi.fn()
    const onToggleHeld = vi.fn()
    const meeting = { id: 'm-1', title: 'Hecha', starts_at: '2020-01-10T14:00:00', status: 'realizada' }
    renderCalendar({ meetings: [meeting], year: 2020, month: 1, onMeetingClick, onToggleHeld })
    await user.click(screen.getByRole('button', { name: /Desmarcar "Hecha" como realizada/ }))
    expect(onToggleHeld).toHaveBeenCalledWith(meeting)
    expect(onMeetingClick).not.toHaveBeenCalled()
  })

  it('click en una vencida-sin-marcar abre el detalle (onMeetingClick), no marca directo', async () => {
    const user = userEvent.setup()
    const onMeetingClick = vi.fn()
    const onToggleHeld = vi.fn()
    const meeting = { id: 'm-1', title: 'Vencida', starts_at: '2020-01-10T14:00:00', status: 'programada' }
    renderCalendar({ meetings: [meeting], year: 2020, month: 1, onMeetingClick, onToggleHeld })
    await user.click(screen.getByText(/Vencida/))
    expect(onMeetingClick).toHaveBeenCalledWith(meeting)
    expect(onToggleHeld).not.toHaveBeenCalled()
  })

  it('una reunión cancelada no ofrece toggle de realizada', () => {
    const meetings = [{ id: 'm-1', title: 'Cancelada', starts_at: '2026-07-20T10:00:00', status: 'cancelada' }]
    renderCalendar({ meetings })
    expect(screen.queryByRole('button', { name: /realizada/i })).not.toBeInTheDocument()
  })
})

describe('CalendarView — ícono de "me incluye"', () => {
  it('muestra el ícono de persona en una reunión donde el usuario actual es asistente', () => {
    const meetings = [{ id: 'm-1', title: 'Conmigo', starts_at: '2026-07-15T14:00:00', status: 'programada', attendee_ids: ['u1', 'u2'] }]
    renderCalendar({ meetings, currentUserId: 'u1' })
    const pill = screen.getByText(/14:00 Conmigo/).closest('[role="button"]')
    expect(pill.querySelector('svg[aria-label="Te incluye como participante"]')).toBeInTheDocument()
  })

  it('NO muestra el ícono de persona cuando el usuario actual no es asistente', () => {
    const meetings = [{ id: 'm-1', title: 'SinMi', starts_at: '2026-07-15T14:00:00', status: 'programada', attendee_ids: ['u2'] }]
    renderCalendar({ meetings, currentUserId: 'u1' })
    const pill = screen.getByText(/14:00 SinMi/).closest('[role="button"]')
    expect(pill.querySelector('svg')).not.toBeInTheDocument()
  })
})

describe('CalendarView — nombre de cliente en la pill', () => {
  it('muestra el nombre del cliente en vez del título cuando la reunión tiene client_name', () => {
    const meetings = [{ id: 'm-1', title: 'Kickoff', client_name: 'Acme Corp', starts_at: '2026-07-15T14:00:00', status: 'programada' }]
    renderCalendar({ meetings })
    expect(screen.getByText(/14:00 Acme Corp/)).toBeInTheDocument()
    expect(screen.queryByText(/14:00 Kickoff/)).not.toBeInTheDocument()
  })

  it('usa el título como fallback cuando la reunión no tiene client_name', () => {
    const meetings = [{ id: 'm-1', title: 'Kickoff', client_name: null, starts_at: '2026-07-15T14:00:00', status: 'programada' }]
    renderCalendar({ meetings })
    expect(screen.getByText(/14:00 Kickoff/)).toBeInTheDocument()
  })
})

describe('CalendarView — vista compacta de móvil (puntos)', () => {
  it('renderiza un punto de color por reunión del día', () => {
    const meetings = [
      { id: 'm-1', title: 'Uno', starts_at: '2026-07-15T09:00:00', status: 'programada' },
      { id: 'm-2', title: 'Dos', starts_at: '2026-07-15T10:00:00', status: 'realizada' },
    ]
    renderCalendar({ meetings })
    const dotsContainer = screen.getByTitle('Uno').parentElement
    expect(dotsContainer.className).toContain('sm:hidden')
    expect(dotsContainer.children).toHaveLength(2)
  })

  it('el punto de una reunión "realizada" es verde y el de una "programada" futura es azul', () => {
    const meetings = [
      { id: 'm-1', title: 'Futura', starts_at: '2099-01-25T14:00:00', status: 'programada' },
      { id: 'm-2', title: 'Hecha', starts_at: '2099-01-25T15:00:00', status: 'realizada' },
    ]
    renderCalendar({ meetings, year: 2099, month: 1 })
    expect(screen.getByTitle('Futura').className).toContain('bg-blue-500')
    expect(screen.getByTitle('Hecha').className).toContain('bg-green-600')
  })

  it('un punto usa el nombre del cliente como title si está presente', () => {
    const meetings = [{ id: 'm-1', title: 'Kickoff', client_name: 'Acme Corp', starts_at: '2026-07-15T09:00:00', status: 'programada' }]
    renderCalendar({ meetings })
    expect(screen.getByTitle('Acme Corp')).toBeInTheDocument()
  })
})

describe('CalendarView — overflow del día ("+N más")', () => {
  const SAME_DAY_MEETINGS = [
    { id: 'm-1', title: 'Uno', starts_at: '2026-07-15T09:00:00', status: 'programada' },
    { id: 'm-2', title: 'Dos', starts_at: '2026-07-15T10:00:00', status: 'programada' },
    { id: 'm-3', title: 'Tres', starts_at: '2026-07-15T11:00:00', status: 'programada' },
    { id: 'm-4', title: 'Cuatro', starts_at: '2026-07-15T12:00:00', status: 'programada' },
    { id: 'm-5', title: 'Cinco', starts_at: '2026-07-15T13:00:00', status: 'programada' },
  ]

  it('con más de 3 reuniones el mismo día, muestra "+N más" clickeable', () => {
    renderCalendar({ meetings: SAME_DAY_MEETINGS })
    expect(screen.getByRole('button', { name: '+2 más' })).toBeInTheDocument()
    // Solo las primeras 3 se ven directo en la celda
    expect(screen.queryByText(/13:00 Cinco/)).not.toBeInTheDocument()
  })

  it('el botón "+N más" muestra el ícono de persona si alguna de las ocultas incluye al usuario actual', () => {
    const meetings = SAME_DAY_MEETINGS.map((m, i) => (i === 4 ? { ...m, attendee_ids: ['u1'] } : m))
    renderCalendar({ meetings, currentUserId: 'u1' })
    const button = screen.getByRole('button', { name: /\+2 más/ })
    expect(button.querySelector('svg')).toBeInTheDocument()
  })

  it('el botón "+N más" NO muestra el ícono si ninguna de las ocultas incluye al usuario actual', () => {
    renderCalendar({ meetings: SAME_DAY_MEETINGS, currentUserId: 'u1' })
    const button = screen.getByRole('button', { name: /\+2 más/ })
    expect(button.querySelector('svg')).not.toBeInTheDocument()
  })

  it('click en "+N más" abre la lista completa del día, incluidas las que no caben', async () => {
    const user = userEvent.setup()
    renderCalendar({ meetings: SAME_DAY_MEETINGS })
    await user.click(screen.getByRole('button', { name: '+2 más' }))
    expect(screen.getByText(/15 de julio/i)).toBeInTheDocument()
    // Ahora se ven las 5, incluidas "Cuatro" y "Cinco" que no cabían en la pill
    for (const m of SAME_DAY_MEETINGS) {
      expect(screen.getAllByText(new RegExp(m.title)).length).toBeGreaterThan(0)
    }
  })

  it('click en una reunión de la lista llama a onMeetingClick y cierra la lista', async () => {
    const user = userEvent.setup()
    const onMeetingClick = vi.fn()
    renderCalendar({ meetings: SAME_DAY_MEETINGS, onMeetingClick })
    await user.click(screen.getByRole('button', { name: '+2 más' }))
    await user.click(screen.getByText(/13:00 Cinco/))
    expect(onMeetingClick).toHaveBeenCalledWith(SAME_DAY_MEETINGS[4])
    // La lista se cierra tras seleccionar
    expect(screen.queryByText(/15 de julio/i)).not.toBeInTheDocument()
  })

  it('con 3 o menos reuniones no aparece "+N más"', () => {
    renderCalendar({ meetings: MEETINGS }) // 2 reuniones, días distintos
    expect(screen.queryByRole('button', { name: /más$/ })).not.toBeInTheDocument()
  })
})
