import { useState, useEffect } from 'react'
import { supabase } from '../../supabase'
import { useAuth } from '../../context/AuthContext'

export default function TicketComments({ ticketId }) {
  const { userProfile } = useAuth()
  const [comments, setComments] = useState([])
  const [loading, setLoading] = useState(true)
  const [body, setBody] = useState('')
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    fetchComments()
  }, [ticketId])

  async function fetchComments() {
    setLoading(true)
    const { data } = await supabase
      .from('ticket_comments')
      .select('*, author:users!author_id(first_name, last_name)')
      .eq('ticket_id', ticketId)
      .order('created_at')
    setComments(data ?? [])
    setLoading(false)
  }

  async function handleSend(e) {
    e.preventDefault()
    if (!body.trim()) return
    setSubmitting(true)
    const { data, error } = await supabase
      .from('ticket_comments')
      .insert({ ticket_id: ticketId, author_id: userProfile.user_id, body: body.trim() })
      .select('*, author:users!author_id(first_name, last_name)')
      .single()
    setSubmitting(false)
    if (!error && data) {
      setComments(prev => [...prev, data])
      setBody('')
    }
  }

  return (
    <div className="mt-5">
      <p className="text-[11px] font-mono font-bold tracking-widest uppercase text-[#888] mb-3">
        Comentarios
      </p>

      {loading ? (
        <div className="flex justify-center py-4">
          <div className="w-5 h-5 border-2 border-[#FFB800] border-t-transparent rounded-full animate-spin" />
        </div>
      ) : (
        <div className="space-y-3 max-h-64 overflow-y-auto pr-1 mb-4">
          {comments.length === 0 && (
            <p className="text-[13px] text-[#aaa]">Sin comentarios aun.</p>
          )}
          {comments.map(c => {
            const author = c.author ? `${c.author.first_name} ${c.author.last_name}` : 'Desconocido'
            const date = new Date(c.created_at).toLocaleString('es-VE', {
              day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
            })
            return (
              <div key={c.id} className="bg-[#f9f8f4] rounded-xl p-3">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[12px] font-semibold text-[#333]">{author}</span>
                  <span className="text-[11px] text-[#aaa]">{date}</span>
                </div>
                <p className="text-[13px] text-[#444] whitespace-pre-wrap">{c.body}</p>
              </div>
            )
          })}
        </div>
      )}

      <form onSubmit={handleSend} className="flex gap-2">
        <input
          className="input-base flex-1 text-[13px]"
          placeholder="Escribe un comentario..."
          value={body}
          onChange={e => setBody(e.target.value)}
        />
        <button
          type="submit"
          disabled={submitting || !body.trim()}
          className="px-4 py-2 bg-[#111] text-white text-[12px] font-bold rounded-xl hover:bg-[#222] transition-colors disabled:opacity-50"
        >
          Enviar
        </button>
      </form>
    </div>
  )
}
