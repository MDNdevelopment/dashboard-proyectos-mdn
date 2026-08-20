import { useState } from 'react'
import { generateAgendaText } from '../../utils/audiovisual'

/** Genera el texto de agenda semanal de pautas programadas, listo para copiar a WhatsApp. */
export default function WhatsAppAgendaModal({ pautas, lines, usersById, onClose }) {
  const [copied, setCopied] = useState(false)
  const text = generateAgendaText(pautas, lines, usersById)

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(text)
    } catch {
      // Fallback silencioso: el usuario puede seleccionar y copiar manualmente.
    }
    setCopied(true)
    setTimeout(() => setCopied(false), 1400)
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center p-4 pt-16 backdrop-blur-sm bg-black/30"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div className="bg-white rounded-2xl border border-[#e0ddd4] shadow-xl w-full max-w-[460px] overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-[#ece9df]">
          <h3 className="text-[15px] font-bold text-[#111]">Agenda para WhatsApp</h3>
          <button
            onClick={onClose}
            className="text-[#999] hover:text-[#111] text-[20px] leading-none"
          >
            &times;
          </button>
        </div>
        <div className="px-4 py-3">
          <p className="text-[12px] text-[#999] mb-2">
            Generado del alcance actual. Revisa y copia al grupo.
          </p>
          <textarea
            readOnly
            value={text}
            className="w-full h-[320px] border border-[#e6e2d8] rounded-lg p-3 text-[12.5px] font-mono text-[#333] bg-[#fbfaf6] leading-relaxed resize-none focus:outline-none focus:border-[#FFB800]"
          />
        </div>
        <div className="flex items-center justify-end gap-2 px-4 py-3 border-t border-[#ece9df]">
          <button
            onClick={onClose}
            className="text-[13px] font-semibold text-[#555] px-3 py-1.5 hover:text-[#111]"
          >
            Cerrar
          </button>
          <button
            onClick={handleCopy}
            className="text-[13px] font-semibold text-[#111] bg-[#FFB800] px-3.5 py-1.5 rounded-lg hover:brightness-95"
          >
            {copied ? '¡Copiado!' : 'Copiar texto'}
          </button>
        </div>
      </div>
    </div>
  )
}
