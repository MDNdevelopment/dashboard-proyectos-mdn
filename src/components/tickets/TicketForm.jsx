import { useState, useRef } from 'react'
import { supabase } from '../../supabase'
import { useAuth } from '../../context/AuthContext'
import { PRIORITIES, CATEGORIES, PRIORITY, CATEGORY } from './constants'
import { useUnsavedChanges } from '../../hooks/useUnsavedChanges'

export default function TicketForm({ onClose, onCreated }) {
  const { userProfile } = useAuth()
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [priority, setPriority] = useState('media')
  const [category, setCategory] = useState('otro')
  const initialTicket = useRef({ title, description, priority, category })
  const { requestClose } = useUnsavedChanges({
    value: { title, description, priority, category },
    baseline: initialTicket.current,
    onClose,
  })
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(null)

  async function handleSubmit(e) {
    e.preventDefault()
    if (!title.trim()) return
    setSubmitting(true)
    setError(null)

    const { data, error: err } = await supabase.from('support_tickets').insert({
      title: title.trim(),
      description: description.trim(),
      priority,
      category,
      requester_id: userProfile.user_id,
      company_id: userProfile.company_id,
    }).select('*, requester:users!requester_id(first_name, last_name)').single()

    setSubmitting(false)
    if (err) { setError('Error al crear el ticket. Intenta de nuevo.'); return }
    onCreated(data)
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 backdrop-blur-sm bg-black/30">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg">
        <div className="px-6 pt-6 pb-5 border-b border-[#ece9df]">
          <h2 className="text-[19px] font-bold text-[#111]">Nuevo ticket de soporte</h2>
        </div>

        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
          <div>
            <label className="block text-[13px] font-mono font-bold tracking-widest uppercase text-[#888] mb-1.5">
              Titulo
            </label>
            <input
              className="input-base w-full"
              placeholder="Describe brevemente el problema"
              value={title}
              onChange={e => setTitle(e.target.value)}
              required
            />
          </div>

          <div>
            <label className="block text-[13px] font-mono font-bold tracking-widest uppercase text-[#888] mb-1.5">
              Descripcion
            </label>
            <textarea
              className="input-base w-full resize-none"
              rows={3}
              placeholder="Detalla el problema con toda la informacion relevante"
              value={description}
              onChange={e => setDescription(e.target.value)}
            />
          </div>

          <div>
            <label className="block text-[13px] font-mono font-bold tracking-widest uppercase text-[#888] mb-1.5">
              Prioridad
            </label>
            <div className="flex gap-2 flex-wrap">
              {PRIORITIES.map(p => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setPriority(p)}
                  className={`px-3 py-1.5 rounded-lg text-[14px] font-semibold border transition-all ${
                    priority === p
                      ? 'border-[#111] bg-[#111] text-white'
                      : 'border-[#e0ddd4] text-[#555] hover:border-[#999]'
                  }`}
                >
                  {PRIORITY[p].label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-[13px] font-mono font-bold tracking-widest uppercase text-[#888] mb-1.5">
              Categoria
            </label>
            <div className="flex gap-2 flex-wrap">
              {CATEGORIES.map(c => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setCategory(c)}
                  className={`px-3 py-1.5 rounded-lg text-[14px] font-semibold border transition-all ${
                    category === c
                      ? 'border-[#111] bg-[#111] text-white'
                      : 'border-[#e0ddd4] text-[#555] hover:border-[#999]'
                  }`}
                >
                  {CATEGORY[c].label}
                </button>
              ))}
            </div>
          </div>

          {error && <p className="text-[14px] text-red-600">{error}</p>}

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={requestClose}
              className="flex-1 py-2.5 rounded-xl border border-[#e0ddd4] text-[15px] font-semibold text-[#555] hover:bg-[#f5f3eb] transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={submitting || !title.trim()}
              className="flex-1 py-2.5 rounded-xl bg-[#111] text-white text-[15px] font-bold hover:bg-[#222] transition-colors disabled:opacity-50"
            >
              {submitting ? 'Creando...' : 'Crear ticket'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
