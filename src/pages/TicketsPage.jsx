import { useState, useEffect } from 'react'
import { supabase } from '../supabase'
import { useAuth } from '../context/AuthContext'
import TicketList from '../components/tickets/TicketList'
import TicketForm from '../components/tickets/TicketForm'
import TicketDetail from '../components/tickets/TicketDetail'

export default function TicketsPage() {
  const { userProfile } = useAuth()
  const [tickets, setTickets] = useState([])
  const [loading, setLoading] = useState(true)
  const [selectedTicket, setSelectedTicket] = useState(null)
  const [showCreateForm, setShowCreateForm] = useState(false)

  const isIT = userProfile?.department_id === 0

  useEffect(() => {
    fetchTickets()
  }, [])

  async function fetchTickets() {
    setLoading(true)
    const { data } = await supabase
      .from('support_tickets')
      .select('*, requester:users!requester_id(first_name, last_name), assignee:users!assigned_to(first_name, last_name)')
      .order('created_at', { ascending: false })
    setTickets(data ?? [])
    setLoading(false)
  }

  function handleCreated(ticket) {
    setTickets(prev => [ticket, ...prev])
  }

  function handleUpdated(updated) {
    setTickets(prev => prev.map(t => t.id === updated.id ? updated : t))
    setSelectedTicket(updated)
  }

  return (
    <>
      <main className="flex-1 overflow-y-auto main-bg h-screen">
        <div className="max-w-3xl mx-auto px-6 py-8">
          {/* Header */}
          <div className="flex items-center justify-between mb-6">
            <div>
              <h1 className="text-[24px] font-bold text-[#111] leading-tight">Tickets de soporte</h1>
              <p className="text-[13px] text-[#888] mt-0.5">
                {isIT ? 'Gestion de solicitudes IT' : 'Tus solicitudes de soporte tecnico'}
              </p>
            </div>
            <button
              onClick={() => setShowCreateForm(true)}
              className="flex items-center gap-2 bg-[#111] text-white text-[13px] font-bold px-4 py-2.5 rounded-xl hover:bg-[#222] transition-colors"
            >
              <svg width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2.8">
                <path d="M6 1v10M1 6h10" strokeLinecap="round"/>
              </svg>
              Nuevo ticket
            </button>
          </div>

          <TicketList
            tickets={tickets}
            loading={loading}
            onSelect={setSelectedTicket}
            isIT={isIT}
          />
        </div>
      </main>

      {showCreateForm && (
        <TicketForm
          onClose={() => setShowCreateForm(false)}
          onCreated={handleCreated}
        />
      )}

      {selectedTicket && (
        <TicketDetail
          ticket={selectedTicket}
          onClose={() => setSelectedTicket(null)}
          onUpdated={handleUpdated}
        />
      )}
    </>
  )
}
