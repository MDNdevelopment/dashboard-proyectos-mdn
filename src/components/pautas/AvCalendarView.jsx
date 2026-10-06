import AvCalendar from './AvCalendar'

const CHIPS = [
  { key: 'todas', label: 'Todas', color: 'text-[#9a7400]' },
  { key: 'agendadas', label: 'Agendadas', color: 'text-[#3b6fd4]' },
  { key: 'realizadas', label: 'Realizadas', color: 'text-[#1f8a43]' },
  { key: 'solicitadas', label: 'Solicitadas', color: 'text-[#d99a00]' },
]

/**
 * Vista Calendario: recuadros de resumen (que además filtran el calendario) + grilla
 * mensual. "Solicitadas" muestra, punteadas, las solicitudes con fecha deseada.
 */
export default function AvCalendarView({
  year,
  month,
  pautas,
  monthPautas,
  filter,
  onFilterChange,
  onMonthChange,
  onDayClick,
  onPautaClick,
}) {
  const counts = {
    agendadas: monthPautas.filter((p) => p.status === 'programada').length,
    realizadas: monthPautas.filter((p) => p.status === 'realizada').length,
    solicitadas: monthPautas.filter((p) => p.status === 'solicitada' && p.pauta_date).length,
  }
  counts.todas = counts.agendadas + counts.realizadas
  const statusFilter =
    filter === 'agendadas'
      ? 'programada'
      : filter === 'realizadas'
        ? 'realizada'
        : filter === 'solicitadas'
          ? 'solicitada'
          : null

  return (
    <div>
      <div className="flex flex-wrap items-center gap-3 mb-4">
        {CHIPS.map((c) => (
          <button
            key={c.key}
            type="button"
            onClick={() => onFilterChange(c.key)}
            aria-label={`Filtrar por ${c.label}`}
            className={`text-left bg-white border rounded-xl px-4 py-3 min-w-[130px] transition-colors ${
              filter === c.key
                ? 'border-[#FFB800] ring-1 ring-[#FFB800]/40'
                : 'border-[#e0ddd4] hover:border-[#d8d4c6]'
            }`}
          >
            <div className={`text-[22px] font-semibold ${c.color}`}>{counts[c.key]}</div>
            <div className="text-[11.5px] text-[#999] font-mono uppercase tracking-wide mt-0.5">
              {c.label}
            </div>
          </button>
        ))}
      </div>
      <AvCalendar
        year={year}
        month={month}
        pautas={pautas}
        statusFilter={statusFilter}
        showSolicitadas={filter === 'solicitadas'}
        onMonthChange={onMonthChange}
        onDayClick={onDayClick}
        onPautaClick={onPautaClick}
      />
    </div>
  )
}
