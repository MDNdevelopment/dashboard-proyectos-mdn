import { useState, useRef, useEffect } from 'react'

/**
 * Control de estado unificado — píldora de color, opcionalmente editable.
 *
 * Diseño único para mostrar/editar el estado de una entidad (no un filtro,
 * ni un <select> de formulario de captura inicial): cuando `editable` es
 * true, un click abre un menú con todas las opciones (cada una con su punto
 * de color); cuando es false, se renderiza como un badge de solo lectura.
 *
 * El componente NO hace llamadas a datos — solo dispara `onChange(nextValue)`.
 * Cada pantalla conserva su propia función de persistencia (distintas tablas,
 * distintas reglas de `updated_at`, etc.), igual que ya hacía antes de este
 * componente.
 *
 * Props:
 *   value    — string, key actual dentro de `meta`
 *   meta     — { [key]: { label, bg, text, dot } } — clases Tailwind LITERALES
 *              (no construidas dinámicamente: Tailwind JIT no genera CSS para
 *              clases armadas en runtime, ej. `bg-${color}`)
 *   options  — array ordenado de keys seleccionables (default: Object.keys(meta))
 *   editable — bool (default false)
 *   onChange — (nextValue) => void | Promise<void>
 *   size     — 'sm' | 'md' (default 'md')
 *
 * Módulos candidatos a adoptar este componente más adelante (documentado en
 * ARQUITECTURA.md): Tickets (`TicketStatusBadge.jsx`), Proyectos
 * (`ProjectCard.jsx` / `ProjectDetailModal.jsx`), Tareas (`BaseView.jsx` —
 * requiere una variante con `createPortal` por el `overflow` de su tabla).
 */
export default function StatusPill({
  value,
  meta,
  options,
  editable = false,
  onChange,
  size = 'md',
}) {
  const [open, setOpen] = useState(false)
  const [pending, setPending] = useState(false)
  const wrapperRef = useRef(null)

  const opts = options ?? Object.keys(meta)
  const current = meta[value] ?? { label: value, bg: 'bg-[#f5f3eb]', text: 'text-[#555]', dot: 'bg-[#999]' }

  useEffect(() => {
    if (!open) return
    const fn = (e) => {
      if (!wrapperRef.current?.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', fn)
    return () => document.removeEventListener('mousedown', fn)
  }, [open])

  const padding = size === 'sm' ? 'px-2 py-0.5 text-[12.5px]' : 'px-2.5 py-1 text-[13px]'

  if (!editable) {
    return (
      <span className={`inline-flex items-center rounded-full font-mono font-semibold ${padding} ${current.bg} ${current.text}`}>
        {current.label}
      </span>
    )
  }

  async function handlePick(next) {
    setOpen(false)
    if (next === value) return
    setPending(true)
    await onChange?.(next)
    setPending(false)
  }

  return (
    <div ref={wrapperRef} className="relative inline-block">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        disabled={pending}
        className={`inline-flex items-center gap-1.5 rounded-full font-mono font-semibold transition-opacity hover:opacity-80 disabled:opacity-60 ${padding} ${current.bg} ${current.text}`}
      >
        <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${current.dot ?? current.text.replace('text-', 'bg-')}`} />
        {current.label}
        <svg width="8" height="8" viewBox="0 0 8 8" fill="none" className={`flex-shrink-0 transition-transform ${open ? 'rotate-180' : ''}`}>
          <path d="M1.5 3l2.5 2.5L6.5 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {open && (
        <div className="absolute z-30 mt-1 min-w-[150px] bg-white border border-[#e0ddd4] rounded-xl shadow-lg overflow-hidden py-1">
          {opts.map((key) => {
            const m = meta[key] ?? {}
            return (
              <button
                key={key}
                type="button"
                onClick={() => handlePick(key)}
                className="flex items-center gap-2 w-full px-3 py-1.5 text-[13.5px] text-[#333] hover:bg-[#f5f3eb] transition-colors text-left"
              >
                <span className={`w-2 h-2 rounded-full flex-shrink-0 ${m.dot ?? 'bg-[#999]'}`} />
                {m.label ?? key}
                {key === value && (
                  <svg width="11" height="11" viewBox="0 0 12 12" fill="none" className="ml-auto flex-shrink-0 text-[#111]">
                    <path d="M2.5 6.2L5 8.7L9.5 3.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                )}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
