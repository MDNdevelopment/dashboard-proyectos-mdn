import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { supabase } from '../../supabase'
import { useAuth } from '../../context/AuthContext'
import { MODULES } from '../../config/modules'
import { FEEDBACK_TYPES, validateFeedback, buildFeedbackRow } from '../../lib/feedback'

/**
 * Modal del buzón anónimo de sugerencias y errores (botón amarillo del Sidebar).
 * El mensaje se inserta en `anonymous_feedback` sin ningún campo de usuario — ver
 * buildFeedbackRow en src/lib/feedback.js, que es la garantía de anonimato.
 *
 * Se renderiza en un portal a document.body: el contenedor del Sidebar en
 * AppLayout.jsx tiene `transform` (translate-x-*) para la animación móvil, y un
 * ancestro con transform crea un nuevo containing block para `position: fixed` —
 * sin el portal, el overlay quedaba encerrado en el ancho angosto del sidebar en
 * vez de cubrir toda la pantalla.
 */
export default function FeedbackModal({ show, onClose }) {
  const { userProfile } = useAuth()
  // Foco inicial en el título (no en un botón/campo interactivo): a diferencia de
  // WhatsNewModal/ReportCloseReminderModal (sin campos editables), acá el usuario puede
  // empezar a escribir de inmediato. Se enfoca de forma síncrona en el efecto (sin
  // setTimeout): un delay puede disparar mientras el usuario ya está tipeando y robarle
  // el foco al textarea a mitad de camino — ver commit que agregó este comentario.
  const titleRef = useRef(null)

  const [type, setType] = useState('recomendacion')
  const [area, setArea] = useState('')
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState(false)

  useEffect(() => {
    if (!show) return
    // Reinicia el formulario cada vez que se abre.
    setType('recomendacion')
    setArea('')
    setMessage('')
    setError('')
    setSending(false)
    setSent(false)
    const h = (e) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', h)
    titleRef.current?.focus()
    return () => {
      document.removeEventListener('keydown', h)
    }
  }, [show, onClose])

  if (!show) return null

  async function handleSubmit(e) {
    e.preventDefault()
    const result = validateFeedback({ type, message })
    if (!result.ok) {
      setError(result.error)
      return
    }
    setError('')
    setSending(true)
    const row = buildFeedbackRow({ type, area, message, companyId: userProfile?.company_id })
    const { error: insertError } = await supabase.from('anonymous_feedback').insert(row)
    setSending(false)
    if (insertError) {
      setError('No se pudo enviar el mensaje. Probá de nuevo en un momento.')
      return
    }
    setSent(true)
  }

  return createPortal(
    <div
      className="fixed inset-0 bg-black/25 backdrop-blur-[3px] flex items-center justify-center z-50 p-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Sugerencias y errores"
        className="bg-white rounded-2xl border border-[#e8e5db] w-full max-w-lg shadow-2xl"
      >
        {sent ? (
          <div className="px-6 py-8 text-center">
            <div className="w-12 h-12 mx-auto mb-3 rounded-full bg-[#FFF4CC] flex items-center justify-center">
              <svg
                width="22"
                height="22"
                viewBox="0 0 16 16"
                fill="none"
                stroke="#111"
                strokeWidth="1.8"
              >
                <path d="M2 8.5 6 12l8-9" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
            <h2 className="text-[17px] font-semibold text-[#111]">¡Gracias!</h2>
            <p className="text-[14px] text-[#666] mt-1">Tu mensaje llegó al desarrollador.</p>
            <button
              onClick={onClose}
              className="mt-5 w-full px-4 py-2.5 bg-[#0d0d0d] text-white rounded-xl text-[14px] font-semibold hover:bg-[#222] transition-colors"
            >
              Cerrar
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit}>
            <div className="px-6 py-5 border-b border-[#eeebe0]">
              <h2
                ref={titleRef}
                tabIndex={-1}
                className="text-[18px] font-semibold text-[#111] tracking-[-0.01em] outline-none"
              >
                Sugerencias y errores
              </h2>
              <p className="text-[14px] text-[#999] mt-0.5">
                Contale al desarrollador qué mejorarías o qué está fallando
              </p>
            </div>

            <div className="px-6 py-5 space-y-4">
              <div>
                <label className="block text-[13px] font-semibold text-[#444] mb-1.5">Tipo</label>
                <div className="grid grid-cols-2 gap-2">
                  {FEEDBACK_TYPES.map((t) => (
                    <button
                      key={t.key}
                      type="button"
                      onClick={() => setType(t.key)}
                      className={`px-3 py-2 rounded-lg text-[14px] font-medium border transition-colors ${
                        type === t.key
                          ? 'bg-[#FFB800] border-[#FFB800] text-[#111]'
                          : 'bg-white border-[#e0ddd4] text-[#666] hover:bg-[#f5f3eb]'
                      }`}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-[13px] font-semibold text-[#444] mb-1.5">
                  Área (opcional)
                </label>
                <select
                  value={area}
                  onChange={(e) => setArea(e.target.value)}
                  className="input-base"
                >
                  <option value="">General / Otro</option>
                  {MODULES.map((m) => (
                    <option key={m.key} value={m.label}>
                      {m.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[13px] font-semibold text-[#444] mb-1.5">
                  Mensaje
                </label>
                <textarea
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  rows={4}
                  maxLength={2000}
                  placeholder="Contanos qué recomendás o qué error encontraste..."
                  className="input-base resize-none"
                />
                <p className="text-[12px] text-[#bbb] mt-1 text-right font-mono">
                  {message.length}/2000
                </p>
              </div>

              {error && <p className="text-[13px] text-[#c0392b]">{error}</p>}
            </div>

            <div className="px-6 py-4 border-t border-[#eeebe0] flex gap-2">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 px-4 py-2.5 bg-[#f5f3eb] text-[#666] rounded-xl text-[14px] font-semibold hover:bg-[#eeebe0] transition-colors"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={sending}
                className="flex-1 px-4 py-2.5 bg-[#FFB800] text-[#111] rounded-xl text-[14px] font-semibold hover:brightness-95 transition-all disabled:opacity-60"
              >
                {sending ? 'Enviando...' : 'Enviar'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>,
    document.body,
  )
}
