import { useState } from 'react'
import { supabase } from '../../supabase'
import { useAuth } from '../../context/AuthContext'
import TicketStatusBadge from './TicketStatusBadge'
import TicketComments from './TicketComments'
import { CATEGORY, SLA_STATUS } from './constants'
import { getSlaStatusKey } from './slaUtils'

export default function TicketDetail({ ticket, onClose, onUpdated }) {
  const { userProfile } = useAuth()
  const [acting, setActing] = useState(false)

  const isIT = userProfile?.department_id === 0
  const isAssigned = ticket.assigned_to === userProfile?.user_id

  const requesterName = ticket.requester
    ? `${ticket.requester.first_name} ${ticket.requester.last_name}`
    : 'Desconocido'

  const assigneeName = ticket.assignee
    ? `${ticket.assignee.first_name} ${ticket.assignee.last_name}`
    : null

  async function takeTicket() {
    setActing(true)
    const { data, error } = await supabase
      .from('support_tickets')
      .update({ assigned_to: userProfile.user_id, status: 'en_progreso' })
      .eq('id', ticket.id)
      .select('*, requester:users!requester_id(first_name, last_name), assignee:users!assigned_to(first_name, last_name)')
      .single()
    setActing(false)
    if (!error && data) onUpdated(data)
  }

  async function resolveTicket() {
    setActing(true)
    const { data, error } = await supabase
      .from('support_tickets')
      .update({ status: 'resuelto', resolved_at: new Date().toISOString() })
      .eq('id', ticket.id)
      .select('*, requester:users!requester_id(first_name, last_name), assignee:users!assigned_to(first_name, last_name)')
      .single()
    setActing(false)
    if (!error && data) onUpdated(data)
  }

  const createdAt = new Date(ticket.created_at).toLocaleString('es-VE', {
    day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit',
  })

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 backdrop-blur-sm bg-black/30">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="px-6 pt-6 pb-4 border-b border-[#ece9df] flex items-start justify-between gap-4">
          <div className="flex-1">
            <h2 className="text-[17px] font-bold text-[#111] leading-snug mb-2">{ticket.title}</h2>
            <div className="flex items-center gap-2 flex-wrap">
              <TicketStatusBadge type="status" value={ticket.status} />
              <TicketStatusBadge type="priority" value={ticket.priority} />
              <span className="text-[11px] font-mono text-[#888] bg-[#f5f3eb] px-2 py-0.5 rounded-md">
                {CATEGORY[ticket.category]?.label ?? ticket.category}
              </span>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-[#999] hover:text-[#111] transition-colors p-1"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M2 2l12 12M14 2L2 14" strokeLinecap="round"/>
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-5 overflow-y-auto flex-1">
          {/* Meta */}
          <div className="grid grid-cols-2 gap-3 mb-5 text-[12px]">
            <div>
              <p className="font-mono font-bold uppercase tracking-widest text-[#888] text-[10px] mb-0.5">Solicitante</p>
              <p className="text-[#333] font-medium">{requesterName}</p>
            </div>
            <div>
              <p className="font-mono font-bold uppercase tracking-widest text-[#888] text-[10px] mb-0.5">Asignado a</p>
              <p className="text-[#333] font-medium">{assigneeName ?? 'Sin asignar'}</p>
            </div>
            <div>
              <p className="font-mono font-bold uppercase tracking-widest text-[#888] text-[10px] mb-0.5">Creado</p>
              <p className="text-[#333]">{createdAt}</p>
            </div>
            {(() => {
              const slaKey = getSlaStatusKey(ticket)
              const sla = slaKey ? SLA_STATUS[slaKey] : null
              return sla ? (
                <div>
                  <p className="font-mono font-bold uppercase tracking-widest text-[#888] text-[10px] mb-0.5">SLA</p>
                  <span className={`inline-block text-[11px] font-mono font-bold px-2 py-0.5 rounded-md ${sla.color}`}>
                    {sla.label}
                  </span>
                </div>
              ) : null
            })()}
            {ticket.resolved_at && (
              <div>
                <p className="font-mono font-bold uppercase tracking-widest text-[#888] text-[10px] mb-0.5">Resuelto</p>
                <p className="text-[#333]">
                  {new Date(ticket.resolved_at).toLocaleString('es-VE', {
                    day: 'numeric', month: 'long', year: 'numeric',
                    hour: '2-digit', minute: '2-digit',
                  })}
                </p>
              </div>
            )}
          </div>

          {ticket.description && (
            <div className="mb-5">
              <p className="text-[11px] font-mono font-bold tracking-widest uppercase text-[#888] mb-1.5">Descripcion</p>
              <p className="text-[13px] text-[#444] whitespace-pre-wrap leading-relaxed">{ticket.description}</p>
            </div>
          )}

          {/* IT actions */}
          {isIT && ticket.status === 'abierto' && (
            <button
              onClick={takeTicket}
              disabled={acting}
              className="w-full mb-4 py-2.5 rounded-xl bg-[#FFB800] text-[#111] text-[13px] font-bold hover:bg-[#e6a600] transition-colors disabled:opacity-50"
            >
              {acting ? 'Procesando...' : 'Tomar ticket'}
            </button>
          )}
          {isIT && isAssigned && ticket.status === 'en_progreso' && (
            <button
              onClick={resolveTicket}
              disabled={acting}
              className="w-full mb-4 py-2.5 rounded-xl bg-[#16a34a] text-white text-[13px] font-bold hover:bg-[#15803d] transition-colors disabled:opacity-50"
            >
              {acting ? 'Procesando...' : 'Marcar como resuelto'}
            </button>
          )}

          <TicketComments ticketId={ticket.id} />
        </div>
      </div>
    </div>
  )
}
