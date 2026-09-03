import { useEffect, useState } from 'react'
import { useAuth } from '../../context/AuthContext'
import { useAiChatContext } from '../../context/AiChatContext'
import AiChatPanel from './AiChatPanel'
import AiAvatar from './AiAvatar'

/**
 * Botón flotante + panel del chat IA. Solo se monta para admins (userProfile.admin ===
 * true). Montado en AppLayout junto a InstallBanner/WhatsNewModal, dentro de
 * AiChatProvider (ver src/context/AiChatContext.jsx) — el estado (open, mensajes) vive en
 * el contexto para que otros componentes (ej. RecomendacionesCard) puedan abrir el panel
 * con contexto precargado.
 */
export default function AiChatWidget() {
  const { userProfile } = useAuth()
  const { open, setOpen, ...chat } = useAiChatContext()
  const [ctasDismissed, setCtasDismissed] = useState(false)

  useEffect(() => {
    if (!open) return
    const onKeyDown = (e) => {
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [open])

  if (!userProfile?.admin) return null

  const openFromCta = () => {
    setCtasDismissed(true)
    setOpen(true)
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
        <div className="fixed right-4 bottom-[168px] lg:right-6 lg:bottom-28 z-40 rounded-2xl bg-white shadow-xl border border-[#e0ddd4] pl-4 pr-2 py-2.5 flex items-center gap-2">
          <button
            type="button"
            onClick={openFromCta}
            className="text-[13.5px] font-semibold text-[#111] text-left"
          >
            ¿En qué te puedo ayudar?
          </button>
          <button
            type="button"
            onClick={() => setCtasDismissed(true)}
            aria-label="Cerrar sugerencias"
            className="text-[#888] hover:text-[#111] w-6 h-6 flex items-center justify-center rounded-lg transition-colors flex-shrink-0"
          >
            ✕
          </button>
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
