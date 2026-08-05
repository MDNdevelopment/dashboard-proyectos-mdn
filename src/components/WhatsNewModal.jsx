import { useEffect, useRef } from 'react'

export default function WhatsNewModal({ entries, onClose }) {
  const doneRef = useRef(null)

  useEffect(() => {
    if (!entries || entries.length === 0) return
    const h = (e) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', h)
    const t = setTimeout(() => doneRef.current?.focus(), 50)
    return () => {
      clearTimeout(t)
      document.removeEventListener('keydown', h)
    }
  }, [entries, onClose])

  if (!entries || entries.length === 0) return null

  return (
    <div
      className="fixed inset-0 bg-black/25 backdrop-blur-[3px] flex items-center justify-center z-50 p-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Novedades"
        className="bg-white rounded-2xl border border-[#e8e5db] w-full max-w-2xl max-h-[92vh] flex flex-col shadow-2xl"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-[#eeebe0] flex-shrink-0">
          <div>
            <h2 className="text-[18px] font-semibold text-[#111] tracking-[-0.01em]">Novedades</h2>
            <p className="text-[14px] text-[#999] mt-0.5">
              Esto es lo nuevo desde tu última visita
            </p>
          </div>
          <button
            onClick={onClose}
            aria-label="Cerrar novedades"
            className="w-8 h-8 flex items-center justify-center rounded-lg text-[#bbb] hover:text-[#555] hover:bg-[#f5f3eb] transition-colors"
          >
            <svg
              width="14"
              height="14"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2.5}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="overflow-y-auto flex-1 px-6 py-5 space-y-6">
          {entries.map((entry) => (
            <div key={entry.version}>
              <div className="flex items-center gap-2.5 mb-1">
                <span className="px-2 py-0.5 rounded-md bg-[#FFB800] text-[12px] font-bold text-[#111] font-mono">
                  v{entry.version}
                </span>
                {entry.date && (
                  <span className="text-[12px] font-mono text-[#bbb]">{entry.date}</span>
                )}
              </div>
              <h3 className="text-[16px] font-semibold text-[#222] mb-1.5">{entry.title}</h3>
              <ul className="space-y-1">
                {entry.changes.map((change, i) => (
                  <li key={i} className="flex gap-2 text-[14px] text-[#555]">
                    <span className="text-[#FFB800] font-bold select-none">•</span>
                    <span>{change}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-[#eeebe0] flex-shrink-0">
          <button
            ref={doneRef}
            onClick={onClose}
            className="w-full px-4 py-2.5 bg-[#0d0d0d] text-white rounded-xl text-[15px] font-bold hover:bg-[#222] transition-colors"
          >
            Entendido
          </button>
        </div>
      </div>
    </div>
  )
}
