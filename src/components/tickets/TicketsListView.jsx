import { useState, useEffect } from 'react'
import { supabase } from '../../supabase'
import { useAuth } from '../../context/AuthContext'
import TicketList from './TicketList'
import TicketForm from './TicketForm'
import TicketDetail from './TicketDetail'

export default function TicketsListView() {
  const { userProfile, can = () => true } = useAuth()
  const [tickets, setTickets] = useState([])
  const [loading, setLoading] = useState(true)
  const [selectedTicket, setSelectedTicket] = useState(null)
  const [showCreateForm, setShowCreateForm] = useState(false)

  const isIT = userProfile?.department_id === 0
  const canManage = can('tickets.manage')

  useEffect(() => {
    fetchTickets()
  }, [])

  async function fetchTickets() {
    setLoading(true)
    const { data } = await supabase
      .from('support_tickets')
      .select(
        '*, requester:users!requester_id(first_name, last_name), assignee:users!assigned_to(first_name, last_name)',
      )
      .order('created_at', { ascending: false })
    setTickets(data ?? [])
    setLoading(false)
  }

  function handleCreated(ticket) {
    setTickets((prev) => [ticket, ...prev])
  }

  function handleUpdated(updated) {
    setTickets((prev) => prev.map((t) => (t.id === updated.id ? updated : t)))
    setSelectedTicket(updated)
  }

  return (
    <>
      {canManage && (
        <div className="flex justify-end mb-4">
          <button
            onClick={() => setShowCreateForm(true)}
            className="flex items-center gap-2 bg-[#111] text-white text-[15px] font-bold px-4 py-2.5 rounded-xl hover:bg-[#222] transition-colors"
          >
            <svg
              width="11"
              height="11"
              viewBox="0 0 12 12"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.8"
            >
              <path d="M6 1v10M1 6h10" strokeLinecap="round" />
            </svg>
            Nuevo ticket
          </button>
        </div>
      )}

      <TicketList
        tickets={tickets}
        loading={loading}
        onSelect={setSelectedTicket}
        isIT={isIT}
      />

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
