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
import { grillaStatus } from '../../utils/audiovisual'

const WEEKDAYS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom']

const DOT_COLOR = {
  solicitada: 'bg-[#d99a00]',
  programada: 'bg-blue-500',
  realizada: 'bg-green-600',
  declinada: 'bg-[#bbb]',
}

/**
 * Grid mensual de pautas agendadas (`programada`/`realizada` con `pauta_date`), calcado
 * de reuniones/CalendarView.jsx. Clic en un día crea una pauta con esa fecha; clic en una
 * pill abre la tarjeta de detalle. `statusFilter` (opcional) acota a un solo status —
 * usado por AudiovisualView para que los SummaryCard "Agendadas"/"Realizadas" filtren
 * el calendario al hacer click.
 */
export default function AvCalendar({
  year,
  month,
  pautas,
  statusFilter = null,
  onMonthChange,
  onDayClick,
  onPautaClick,
}) {
  const anchor = new Date(year, month - 1, 1)
  const gridStart = startOfWeek(startOfMonth(anchor), { weekStartsOn: 1 })
  const gridEnd = endOfWeek(endOfMonth(anchor), { weekStartsOn: 1 })
  const days = eachDayOfInterval({ start: gridStart, end: gridEnd })

  const byDay = new Map()
  pautas
    .filter((p) => p.pauta_date && (p.status === 'programada' || p.status === 'realizada'))
    .filter((p) => !statusFilter || p.status === statusFilter)
    .forEach((p) => {
      if (!byDay.has(p.pauta_date)) byDay.set(p.pauta_date, [])
      byDay.get(p.pauta_date).push(p)
    })

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
    <div className="bg-white border border-[#e0ddd4] rounded-2xl overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-[#ece9df]">
        <h2 className="text-[17px] font-bold text-[#111] capitalize">
          {format(anchor, 'MMMM yyyy', { locale: es })}
        </h2>
        <div className="flex items-center gap-1">
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
            className="text-[11px] font-mono font-bold tracking-widest uppercase text-[#999] text-center py-2"
          >
            {w}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7">
        {days.map((day) => {
          const key = format(day, 'yyyy-MM-dd')
          const dayPautas = byDay.get(key) ?? []
          const inMonth = isSameMonth(day, anchor)
          return (
            <div
              key={key}
              onClick={() => onDayClick(day)}
              className={`min-h-[64px] sm:min-h-[92px] border-b border-r border-[#ece9df] p-1.5 cursor-pointer transition-colors hover:bg-[#f5f3eb]/60 ${
                inMonth ? '' : 'bg-[#fafaf7]'
              }`}
            >
              <span
                className={`inline-flex items-center justify-center w-6 h-6 rounded-full text-[13px] font-semibold ${
                  isToday(day)
                    ? 'bg-[#FFB800] text-[#111]'
                    : inMonth
                      ? 'text-[#333]'
                      : 'text-[#bbb]'
                }`}
              >
                {format(day, 'd')}
              </span>

              <div className="mt-1 space-y-0.5">
                {dayPautas.slice(0, 3).map((p) => (
                  <PautaPill key={p.id} pauta={p} onClick={onPautaClick} />
                ))}
                {dayPautas.length > 3 && (
                  <span className="block text-[10.5px] font-semibold text-[#888] px-1">
                    +{dayPautas.length - 3} más
                  </span>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function PautaPill({ pauta, onClick }) {
  const status = grillaStatus(pauta)
  const border = status === 'incumple' ? 'border-red-300' : 'border-transparent'
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={(e) => {
        e.stopPropagation()
        onClick(pauta)
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') onClick(pauta)
      }}
      title={`${pauta.salida ?? ''} · ${pauta.client_name ?? 'sin cliente'}`}
      className={`flex items-center gap-1 rounded px-1.5 py-1 border bg-[#faf9f5] text-[11px] font-medium text-[#333] truncate cursor-pointer hover:bg-[#f0ede3] transition-colors ${border}`}
    >
      <span className={`w-[6px] h-[6px] rounded-full flex-shrink-0 ${DOT_COLOR[pauta.status]}`} />
      {pauta.salida && <span className="font-mono text-[10.5px]">{pauta.salida.slice(0, 5)}</span>}
      <span className="truncate">{pauta.client_name ?? 'sin cliente'}</span>
    </div>
  )
}
