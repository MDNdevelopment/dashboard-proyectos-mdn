import { useState } from 'react'
import {
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  eachDayOfInterval,
  format,
  isSameMonth,
  isToday,
  addMonths,
  subMonths,
} from 'date-fns'
import { es } from 'date-fns/locale'
import { EVENT_TYPES, groupEventsByDay } from '../../utils/employeeCalendar'
import EventTypeIcon from './EventTypeIcon'

const WEEKDAYS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom']
const MAX_PILLS = 2
const VACATION_TYPES = ['vacation_start', 'vacation_end']

/**
 * Calendario mensual compacto con las fechas importantes del equipo (cumpleaños,
 * aniversarios, fin de período de prueba, inicio y regreso de vacaciones). Construido
 * a mano con date-fns, calcado de pautas/AvCalendar.jsx (a su vez calcado de
 * reuniones/CalendarView.jsx) para mantener el mismo lenguaje visual. `events` ya viene
 * calculado por buildEmployeeCalendarEvents (utils/employeeCalendar.js) — este componente
 * es puramente de presentación, sin llamadas a Supabase.
 *
 * Quién está de vacaciones o en período de prueba "ahora mismo" se ve en `TeamStatusCards`
 * (arriba de este calendario, en EmployeesView.jsx) — este componente solo pinta el mes
 * navegado, no repite esa información día a día (la vieja "estela" de vacaciones que
 * pintaba una pastilla por día se quitó por sobrecargar la grilla).
 *
 * En móvil (< sm) se muestran puntos de color en vez de pills, por falta de espacio para
 * texto legible en 7 columnas (mismo criterio que CalendarView/AvCalendar); el clic en un
 * día con eventos, o en una de sus pills, abre `onDayClick` con el detalle de solo lectura
 * de ese día (`EmployeeDayEventsModal`) — nunca la ficha del empleado.
 */
export default function EmployeeDatesCalendar({ year, month, events, onMonthChange, onDayClick }) {
  const [onlyVacations, setOnlyVacations] = useState(false)
  const anchor = new Date(year, month - 1, 1)
  const gridStart = startOfWeek(startOfMonth(anchor), { weekStartsOn: 1 })
  const gridEnd = endOfWeek(endOfMonth(anchor), { weekStartsOn: 1 })
  const days = eachDayOfInterval({ start: gridStart, end: gridEnd })
  const shownEvents = onlyVacations
    ? events.filter((ev) => VACATION_TYPES.includes(ev.type))
    : events
  const byDay = groupEventsByDay(shownEvents)

  function goPrev() {
    const d = subMonths(anchor, 1)
    onMonthChange(d.getFullYear(), d.getMonth() + 1)
  }
  function goNext() {
    const d = addMonths(anchor, 1)
    onMonthChange(d.getFullYear(), d.getMonth() + 1)
  }
  function goToday() {
    const now = new Date()
    onMonthChange(now.getFullYear(), now.getMonth() + 1)
  }

  return (
    <div className="bg-white border border-[#e0ddd4] rounded-2xl overflow-hidden mb-4">
      <div className="flex items-center justify-between px-4 py-3 border-b border-[#ece9df] gap-2">
        <div>
          <h2 className="text-[15px] font-bold text-[#111]">Fechas del equipo</h2>
          <p className="text-[12px] text-[#999] first-letter:capitalize">
            {format(anchor, 'MMMM yyyy', { locale: es })} · {events.length} evento
            {events.length === 1 ? '' : 's'}
          </p>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setOnlyVacations((v) => !v)}
            aria-pressed={onlyVacations}
            className={`px-3 py-1.5 rounded-lg text-[13px] font-semibold transition-colors ${
              onlyVacations
                ? 'bg-[#FFB800] text-[#111]'
                : 'text-[#666] hover:bg-[#f5f3eb] border border-[#e0ddd4]'
            }`}
          >
            Solo vacaciones
          </button>
          <button
            onClick={goPrev}
            className="w-8 h-8 flex items-center justify-center rounded-lg text-[#666] hover:bg-[#f5f3eb] transition-colors"
            aria-label="Mes anterior"
          >
            <svg
              width="12"
              height="12"
              viewBox="0 0 12 12"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
            >
              <path d="M8 2 3 6l5 4" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
          <button
            onClick={goToday}
            className="px-3 py-1.5 rounded-lg text-[13px] font-semibold text-[#444] hover:bg-[#f5f3eb] transition-colors"
          >
            Hoy
          </button>
          <button
            onClick={goNext}
            className="w-8 h-8 flex items-center justify-center rounded-lg text-[#666] hover:bg-[#f5f3eb] transition-colors"
            aria-label="Mes siguiente"
          >
            <svg
              width="12"
              height="12"
              viewBox="0 0 12 12"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
            >
              <path d="M4 2l5 4-5 4" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        </div>
      </div>

      <div className="grid grid-cols-7 border-b border-[#ece9df]">
        {WEEKDAYS.map((w) => (
          <div
            key={w}
            className="text-[10.5px] font-mono font-bold tracking-widest uppercase text-[#999] text-center py-1.5"
          >
            {w}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7">
        {days.map((day) => {
          const key = format(day, 'yyyy-MM-dd')
          const dayEvents = byDay.get(key) ?? []
          const inMonth = isSameMonth(day, anchor)
          return (
            <div
              key={key}
              onClick={() => dayEvents.length > 0 && onDayClick(day)}
              className={`min-h-[38px] sm:min-h-[64px] border-b border-r border-[#ece9df] p-1 sm:p-1.5 transition-colors ${
                dayEvents.length > 0 ? 'cursor-pointer hover:bg-[#f5f3eb]/60' : ''
              } ${inMonth ? '' : 'bg-[#fafaf7]'}`}
            >
              <span
                className={`inline-flex items-center justify-center w-5 h-5 sm:w-6 sm:h-6 rounded-full text-[11.5px] sm:text-[13px] font-semibold ${
                  isToday(day)
                    ? 'bg-[#FFB800] text-[#111]'
                    : inMonth
                      ? 'text-[#333]'
                      : 'text-[#bbb]'
                }`}
              >
                {format(day, 'd')}
              </span>

              {/* Móvil: puntos de color, uno por evento. */}
              {dayEvents.length > 0 && (
                <div className="mt-1 flex flex-wrap gap-0.5 sm:hidden">
                  {dayEvents.map((ev) => (
                    <span
                      key={ev.id}
                      className={`w-[6px] h-[6px] rounded-full ${EVENT_TYPES[ev.type].dot}`}
                    />
                  ))}
                </div>
              )}

              {/* Desktop: pills, hasta MAX_PILLS + "+N más". */}
              {dayEvents.length > 0 && (
                <div className="mt-1 space-y-0.5 hidden sm:block">
                  {dayEvents.slice(0, MAX_PILLS).map((ev) => (
                    <EventPill key={ev.id} event={ev} />
                  ))}
                  {dayEvents.length > MAX_PILLS && (
                    <span className="block text-[10.5px] font-semibold text-[#888] px-1">
                      +{dayEvents.length - MAX_PILLS} más
                    </span>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>

      <Legend />
    </div>
  )
}

/**
 * Puramente decorativa: no tiene su propio manejador de clic. El clic se propaga a la
 * celda del día (`onDayClick` en el div padre), que abre el detalle de solo lectura de
 * ese día — nunca la ficha del empleado.
 */
function EventPill({ event }) {
  const meta = EVENT_TYPES[event.type]
  return (
    <div
      title={event.label}
      className={`flex items-center gap-1 rounded px-1.5 py-1 border text-[10.5px] font-medium truncate transition-colors ${meta.pill} ${
        event.tentative ? 'border-dashed' : ''
      }`}
    >
      <EventTypeIcon type={event.type} className={meta.iconColor} />
      <span className="truncate">
        {event.employeeName}
        {event.tentative ? ' (tentativa)' : ''}
      </span>
    </div>
  )
}

function Legend() {
  return (
    <div className="flex flex-wrap gap-x-3 gap-y-1 px-4 py-2.5 border-t border-[#ece9df] bg-[#fafaf7]">
      {Object.entries(EVENT_TYPES).map(([key, meta]) => (
        <div key={key} className="flex items-center gap-1.5">
          <EventTypeIcon type={key} className={meta.iconColor} />
          <span className="text-[11px] text-[#777]">{meta.label}</span>
        </div>
      ))}
    </div>
  )
}
