import TicketStatusBadge from './TicketStatusBadge'
import { CATEGORY } from './constants'

export default function TicketCard({ ticket, onClick, isIT }) {
  const requesterName = ticket.requester
    ? `${ticket.requester.first_name} ${ticket.requester.last_name}`
    : 'Desconocido'

  const date = new Date(ticket.created_at).toLocaleDateString('es-VE', {
    day: 'numeric', month: 'short', year: 'numeric',
  })

  return (
    <button
      onClick={() => onClick(ticket)}
      className="w-full text-left bg-white border border-[#e0ddd4] rounded-2xl p-4 hover:border-[#bbb] hover:shadow-sm transition-all"
    >
      <div className="flex items-start justify-between gap-3 mb-2">
        <p className="text-[14px] font-semibold text-[#111] leading-snug flex-1">{ticket.title}</p>
        <TicketStatusBadge type="status" value={ticket.status} />
      </div>
      <div className="flex items-center gap-2 flex-wrap">
        <TicketStatusBadge type="priority" value={ticket.priority} />
        <span className="text-[11px] font-mono text-[#888] bg-[#f5f3eb] px-2 py-0.5 rounded-md">
          {CATEGORY[ticket.category]?.label ?? ticket.category}
        </span>
        {isIT && (
          <span className="text-[11px] text-[#888]">{requesterName}</span>
        )}
        <span className="text-[11px] text-[#aaa] ml-auto">{date}</span>
      </div>
    </button>
  )
}
