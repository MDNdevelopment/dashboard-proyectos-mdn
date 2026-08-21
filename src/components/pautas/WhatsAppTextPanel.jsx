import { useState } from 'react'

/** Textarea de solo lectura + botón "Copiar" para un texto de agenda ya generado. */
export default function WhatsAppTextPanel({ text, height = 320 }) {
  const [copied, setCopied] = useState(false)

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
    <div>
      <textarea
        readOnly
        value={text}
        style={{ height }}
        className="w-full border border-[#e6e2d8] rounded-lg p-3 text-[12.5px] font-mono text-[#333] bg-[#fbfaf6] leading-relaxed resize-none focus:outline-none focus:border-[#FFB800]"
      />
      <button
        onClick={handleCopy}
        className="mt-2 text-[13px] font-semibold text-[#111] bg-[#FFB800] px-3.5 py-1.5 rounded-lg hover:brightness-95"
      >
        {copied ? '¡Copiado!' : 'Copiar texto'}
      </button>
    </div>
  )
}
