import TicketStatusBadge from './TicketStatusBadge'
import { CATEGORY, SLA_STATUS } from './constants'
import { getSlaStatusKey } from './slaUtils'

export default function TicketCard({ ticket, onClick, isIT }) {
  const requesterName = ticket.requester
    ? `${ticket.requester.first_name} ${ticket.requester.last_name}`
    : 'Desconocido'

  const date = new Date(ticket.created_at).toLocaleDateString('es-VE', {
    day: 'numeric', month: 'short', year: 'numeric',
  })

  const slaKey = getSlaStatusKey(ticket)
  const sla = slaKey ? SLA_STATUS[slaKey] : null

  return (
    <button
      onClick={() => onClick(ticket)}
      className="w-full text-left bg-white border border-[#e0ddd4] rounded-2xl p-4 hover:border-[#bbb] hover:shadow-sm transition-all"
    >
      <div className="flex items-start justify-between gap-3 mb-2">
        <p className="text-[14px] font-semibold text-[#111] leading-snug flex-1">{ticket.title}</p>
        <div className="flex items-center gap-1">
          <span className="text-[10px] font-mono text-[#888] uppercase tracking-wider">Estado:</span>
          <TicketStatusBadge type="status" value={ticket.status} />
        </div>
      </div>
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-[10px] font-mono text-[#888] uppercase tracking-wider">Prioridad:</span>
        <TicketStatusBadge type="priority" value={ticket.priority} />
        <span className="text-[10px] font-mono text-[#888] uppercase tracking-wider">Categoría:</span>
        <span className="text-[11px] font-mono text-[#888] bg-[#f5f3eb] px-2 py-0.5 rounded-md">
          {CATEGORY[ticket.category]?.label ?? ticket.category}
        </span>
        {sla && (
          <span className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded-md ${sla.color}`}>
            {sla.label}
          </span>
        )}
        {isIT && (
          <span className="text-[11px] text-[#888]">{requesterName}</span>
        )}
        <span className="text-[11px] text-[#aaa] ml-auto">{date}</span>
      </div>
    </button>
  )
}
