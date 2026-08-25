import { useEffect, useState } from 'react'
import { useAuth } from '../../context/AuthContext'
import { useAiChat } from '../../hooks/useAiChat'
import AiChatPanel from './AiChatPanel'
import AiAvatar from './AiAvatar'
import { SUGERENCIAS } from './suggestions'

/**
 * Botón flotante + panel del chat IA. Autocontenido: solo se monta para admins
 * (userProfile.admin === true). Montado en AppLayout junto a InstallBanner/WhatsNewModal.
 */
export default function AiChatWidget() {
  const { userProfile } = useAuth()
  const [open, setOpen] = useState(false)
  const [ctasDismissed, setCtasDismissed] = useState(false)
  const chat = useAiChat()

  useEffect(() => {
    if (!open) return
    const onKeyDown = (e) => {
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [open])

  if (!userProfile?.admin) return null

  const handleCta = (text) => {
    setCtasDismissed(true)
    setOpen(true)
    chat.send(text)
  }

  return (
    <>
      {open && (
        <div
          className="fixed inset-0 z-40 bg-black/20 lg:hidden"
          onClick={() => setOpen(false)}
          aria-hidden="true"
        />
      )}

      {open && <AiChatPanel {...chat} onClose={() => setOpen(false)} />}

      {!open && !ctasDismissed && (
        <div className="fixed right-4 bottom-[168px] lg:right-6 lg:bottom-28 z-40 w-64 rounded-2xl bg-white shadow-xl border border-[#e0ddd4] p-3.5">
          <button
            type="button"
            onClick={() => setCtasDismissed(true)}
            aria-label="Cerrar sugerencias"
            className="absolute top-2 right-2 text-[#888] hover:text-[#111] w-6 h-6 flex items-center justify-center rounded-lg transition-colors"
          >
            ✕
          </button>
          <p className="text-[13.5px] font-semibold text-[#111] pr-6 mb-2.5">
            ¿En qué te puedo ayudar?
          </p>
          <div className="flex flex-col gap-1.5">
            {SUGERENCIAS.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => handleCta(s)}
                className="text-[12.5px] text-left px-3 py-2 rounded-xl bg-[#f2f0e8] hover:bg-[#FFB800]/20 transition-colors"
              >
                {s}
              </button>
            ))}
          </div>
        </div>
      )}

      <button
        type="button"
        onClick={() => {
          setCtasDismissed(true)
          setOpen((v) => !v)
        }}
        aria-label={open ? 'Cerrar asistente IA' : 'Abrir asistente IA'}
        className="fixed right-4 bottom-24 lg:right-6 lg:bottom-6 z-40 w-16 h-16 rounded-full bg-[#111] shadow-lg flex items-center justify-center hover:scale-105 transition-transform"
      >
        {open ? <span className="text-white text-xl">✕</span> : <AiAvatar size={58} />}
      </button>
    </>
  )
}
