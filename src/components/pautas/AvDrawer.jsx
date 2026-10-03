import { useEffect } from 'react'

/** Panel lateral derecho (420px; en móvil ocupa todo) para colas y listas accionables. */
export default function AvDrawer({ title, subtitle, onClose, children }) {
  useEffect(() => {
    const fn = (e) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', fn)
    return () => document.removeEventListener('keydown', fn)
  }, [onClose])

  return (
    <div
      className="fixed inset-0 z-40 flex justify-end bg-black/25 backdrop-blur-[2px]"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <aside
        role="dialog"
        aria-label={title}
        className="h-full w-full sm:w-[440px] bg-[#f8f6ef] border-l border-[#e0ddd4] shadow-2xl flex flex-col"
      >
        <div className="flex-shrink-0 px-5 py-4 border-b border-[#e8e4d8] bg-white flex items-start justify-between gap-3">
          <div>
            <h2 className="text-[16px] font-bold text-[#111]">{title}</h2>
            {subtitle && <p className="text-[12.5px] text-[#888] mt-0.5">{subtitle}</p>}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar panel"
            className="w-8 h-8 flex items-center justify-center rounded-full text-[#888] hover:bg-[#f2f0e8] hover:text-[#111]"
          >
            ✕
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">{children}</div>
      </aside>
    </div>
  )
}
