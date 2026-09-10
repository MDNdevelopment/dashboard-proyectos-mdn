import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../../supabase'
import { useAuth } from '../../context/AuthContext'
import StatusPill from '../common/StatusPill'
import KpiCard from '../common/KpiCard'
import {
  FEEDBACK_TYPES,
  FEEDBACK_STATUSES,
  FEEDBACK_STATUS_META,
  feedbackTypeLabel,
} from '../../lib/feedback'

const STATUS_FILTERS = [
  { key: 'todos', label: 'Todos' },
  ...FEEDBACK_STATUSES.map((s) => ({ key: s, label: FEEDBACK_STATUS_META[s].label })),
]
const TYPE_FILTERS = [{ key: 'todos', label: 'Todos' }, ...FEEDBACK_TYPES]

export default function FeedbackListView() {
  const { userProfile } = useAuth()
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState('todos')
  const [typeFilter, setTypeFilter] = useState('todos')

  useEffect(() => {
    if (userProfile?.company_id) fetchFeedback()
  }, [userProfile?.company_id])

  async function fetchFeedback() {
    setLoading(true)
    const { data } = await supabase
      .from('anonymous_feedback')
      .select('*')
      .eq('company_id', userProfile.company_id)
      .order('created_at', { ascending: false })
    setItems(data ?? [])
    setLoading(false)
  }

  async function updateStatus(id, status) {
    setItems((prev) => prev.map((it) => (it.id === id ? { ...it, status } : it)))
    await supabase
      .from('anonymous_feedback')
      .update({ status, updated_at: new Date().toISOString() })
      .eq('id', id)
  }

  async function updateNote(id, admin_note) {
    setItems((prev) => prev.map((it) => (it.id === id ? { ...it, admin_note } : it)))
    await supabase
      .from('anonymous_feedback')
      .update({ admin_note, updated_at: new Date().toISOString() })
      .eq('id', id)
  }

  const counts = useMemo(() => {
    const base = Object.fromEntries(FEEDBACK_STATUSES.map((s) => [s, 0]))
    items.forEach((it) => {
      if (base[it.status] != null) base[it.status]++
    })
    return base
  }, [items])

  const filtered = items.filter(
    (it) =>
      (statusFilter === 'todos' || it.status === statusFilter) &&
      (typeFilter === 'todos' || it.type === typeFilter),
  )

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <div className="w-6 h-6 border-2 border-[#FFB800] border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        {FEEDBACK_STATUSES.map((s) => (
          <KpiCard
            key={s}
            label={FEEDBACK_STATUS_META[s].label}
            value={counts[s]}
            accent={s === 'nuevo' && counts[s] > 0 ? '#B8860B' : '#111'}
          />
        ))}
      </div>

      <div className="flex flex-wrap gap-2 mb-5">
        <div className="flex flex-wrap gap-1 bg-white border border-[#e0ddd4] rounded-xl p-1">
          {STATUS_FILTERS.map((f) => (
            <button
              key={f.key}
              onClick={() => setStatusFilter(f.key)}
              className={`px-3 py-1.5 rounded-lg text-[13.5px] font-semibold transition-all ${
                statusFilter === f.key
                  ? 'bg-[#111] text-white'
                  : 'text-[#666] hover:text-[#111] hover:bg-[#f5f3eb]'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap gap-1 bg-white border border-[#e0ddd4] rounded-xl p-1">
          {TYPE_FILTERS.map((f) => (
            <button
              key={f.key}
              onClick={() => setTypeFilter(f.key)}
              className={`px-3 py-1.5 rounded-lg text-[13.5px] font-semibold transition-all ${
                typeFilter === f.key
                  ? 'bg-[#111] text-white'
                  : 'text-[#666] hover:text-[#111] hover:bg-[#f5f3eb]'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {filtered.length === 0 ? (
        <p className="text-[14px] text-[#999] py-10 text-center">
          No hay mensajes con este filtro.
        </p>
      ) : (
        <div className="space-y-3">
          {filtered.map((item) => (
            <FeedbackCard
              key={item.id}
              item={item}
              onStatusChange={(status) => updateStatus(item.id, status)}
              onNoteChange={(note) => updateNote(item.id, note)}
            />
          ))}
        </div>
      )}
    </>
  )
}

function FeedbackCard({ item, onStatusChange, onNoteChange }) {
  const [note, setNote] = useState(item.admin_note ?? '')

  return (
    <div className="bg-white border border-[#e0ddd4] rounded-2xl p-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[12.5px] font-mono font-bold uppercase tracking-wide text-[#888]">
            {feedbackTypeLabel(item.type)}
          </span>
          {item.area && <span className="text-[12.5px] text-[#999]">· {item.area}</span>}
          <span className="text-[12.5px] text-[#bbb] font-mono">
            {new Date(item.created_at).toLocaleDateString('es-VE', {
              day: '2-digit',
              month: 'short',
              year: 'numeric',
            })}
          </span>
        </div>
        <StatusPill
          value={item.status}
          meta={FEEDBACK_STATUS_META}
          editable
          onChange={onStatusChange}
          size="sm"
        />
      </div>

      <p className="text-[14.5px] text-[#222] mt-3 whitespace-pre-wrap leading-relaxed">
        {item.message}
      </p>

      <div className="mt-3">
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          onBlur={() => {
            if (note !== (item.admin_note ?? '')) onNoteChange(note)
          }}
          placeholder="Nota interna (solo vos la ves)..."
          rows={2}
          className="input-base text-[13.5px] resize-none"
        />
      </div>
    </div>
  )
}
