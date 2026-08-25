import { useEffect, useRef, useState } from 'react'
import AiAvatar from './AiAvatar'
import AiChatMessage from './AiChatMessage'
import TypingDots from './TypingDots'
import { SUGERENCIAS } from './suggestions'

export default function AiChatPanel({ messages, sending, error, send, clear, onClose }) {
  const [input, setInput] = useState('')
  const listRef = useRef(null)

  useEffect(() => {
    const el = listRef.current
    if (!el) return
    // jsdom (tests) no implementa scrollTo; caer a asignar scrollTop directamente.
    if (typeof el.scrollTo === 'function') el.scrollTo({ top: el.scrollHeight })
    else el.scrollTop = el.scrollHeight
  }, [messages, sending])

  const handleSend = (text) => {
    const value = (text ?? input).trim()
    if (!value) return
    send(value)
    setInput('')
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  return (
    <div
      role="dialog"
      aria-label="Asistente IA"
      className="fixed inset-x-0 bottom-0 top-16 z-50 flex flex-col rounded-t-3xl bg-[#f2f0e8] shadow-2xl border border-[#e0ddd4] lg:inset-auto lg:right-6 lg:bottom-24 lg:top-auto lg:w-[380px] lg:h-[560px] lg:rounded-2xl"
    >
      <div className="flex items-center gap-2.5 px-4 py-3.5 border-b border-[#e0ddd4] bg-white lg:rounded-t-2xl rounded-t-3xl">
        <AiAvatar size={44} bordered />
        <div className="flex-1 min-w-0">
          <p className="text-[14.5px] font-semibold text-[#111] truncate">MAPPI</p>
          <p className="text-[12px] text-[#888]">Métricas y tareas</p>
        </div>
        <button
          type="button"
          onClick={clear}
          className="text-[12.5px] text-[#888] hover:text-[#111] px-2 py-1 rounded-lg transition-colors"
        >
          Limpiar
        </button>
        <button
          type="button"
          onClick={onClose}
          aria-label="Cerrar chat"
          className="text-[#888] hover:text-[#111] w-7 h-7 flex items-center justify-center rounded-lg transition-colors"
        >
          ✕
        </button>
      </div>

      <div ref={listRef} className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
        {messages.length === 0 && (
          <div className="h-full flex flex-col items-center justify-center gap-4 text-center px-4">
            <AiAvatar size={72} />
            <p className="text-[13.5px] text-[#888]">
              Pregúntame cómo van las líneas, el ranking del mes o las tareas.
            </p>
            <div className="flex flex-col gap-2 w-full">
              {SUGERENCIAS.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => handleSend(s)}
                  className="text-[13px] text-left px-3 py-2 rounded-xl bg-white border border-[#e0ddd4] hover:border-[#FFB800] transition-colors"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((m, i) => (
          <AiChatMessage key={i} role={m.role} text={m.text} />
        ))}

        {sending && (
          <div className="flex items-end gap-2">
            <AiAvatar size={40} />
            <div className="rounded-2xl rounded-bl-sm bg-white border border-[#e0ddd4] px-3.5 py-2.5">
              <TypingDots />
            </div>
          </div>
        )}
      </div>

      {error && (
        <div className="mx-4 mb-2 px-3 py-2 rounded-xl bg-red-50 border border-red-200 text-red-700 text-[13px]">
          {error}
        </div>
      )}

      <div className="p-3 border-t border-[#e0ddd4] bg-white lg:rounded-b-2xl flex items-stretch gap-2">
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Escribe tu pregunta…"
          rows={1}
          className="input-base flex-1 resize-none max-h-24"
          disabled={sending}
        />
        <button
          type="button"
          onClick={() => handleSend()}
          disabled={sending || !input.trim()}
          className="aspect-square h-auto flex-shrink-0 rounded-xl bg-[#FFB800] disabled:opacity-40 flex items-center justify-center text-[#111] font-semibold transition-opacity"
          aria-label="Enviar"
        >
          →
        </button>
      </div>
    </div>
  )
}
