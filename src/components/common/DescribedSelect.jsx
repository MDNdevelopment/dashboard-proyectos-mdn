import { useState, useRef, useEffect, useLayoutEffect, useCallback } from 'react'
import { createPortal } from 'react-dom'

/**
 * Selector de una opción entre varias, donde cada opción trae una DESCRIPCIÓN.
 *
 * No es un `<select>` nativo porque un `<option>` no puede llevar dos líneas con
 * estilos distintos: acá cada opción muestra su nombre resaltado y, debajo y más
 * chico, qué entra en ese rubro — que es justamente lo que evita que la gente
 * elija a ciegas. La contrapartida es que hay que implementar a mano el menú, el
 * cierre y el posicionamiento.
 *
 * El menú va vía `createPortal` a `document.body` con posición `fixed` calculada
 * desde el botón, y abre hacia arriba si no hay espacio abajo — mismo patrón y
 * mismas razones que `StatusPill.jsx` (no lo recorta el `overflow` de un
 * contenedor, y dentro de un modal angosto no se sale del viewport). Con muchas
 * opciones el menú scrollea en vez de crecer sin límite.
 *
 * Props:
 *   value       — key de la opción elegida, o '' / null si no hay ninguna
 *   options     — [{ key, label, description }] (el orden es el de exhibición)
 *   onChange    — (nextKey) => void
 *   placeholder — texto del botón sin selección (default 'Elige una opción…')
 *   ariaLabel   — nombre accesible del botón; pásalo cuando el `<label>` visible
 *                 no envuelva al control
 *   disabled    — bool
 */
export default function DescribedSelect({
  value,
  options = [],
  onChange,
  placeholder = 'Elige una opción…',
  ariaLabel,
  disabled = false,
}) {
  const [open, setOpen] = useState(false)
  const [menuPos, setMenuPos] = useState(null)
  const wrapperRef = useRef(null)
  const menuRef = useRef(null)

  const selected = options.find((o) => o.key === value) ?? null

  // Antes de montar el menú no hay altura real que medir: se estima con el alto de
  // una opción de 2 líneas para decidir si abre hacia arriba ya en el primer
  // render. Montado, se re-mide con la altura real (aún antes del paint).
  const updateMenuPos = useCallback(() => {
    const rect = wrapperRef.current?.getBoundingClientRect()
    if (!rect) return
    const margin = 8
    const maxHeight = Math.min(options.length * 62 + 8, 320)
    const menuHeight = menuRef.current?.offsetHeight || maxHeight
    const gap = 4
    const opensAbove =
      window.innerHeight - rect.bottom < menuHeight + margin && rect.top > menuHeight + margin
    setMenuPos({
      top: opensAbove ? rect.top - menuHeight - gap : rect.bottom + gap,
      left: rect.left,
      width: rect.width,
    })
  }, [options.length])

  useLayoutEffect(() => {
    if (!open) return
    updateMenuPos()
  }, [open, updateMenuPos])

  useEffect(() => {
    if (!open) return
    const onDown = (e) => {
      if (wrapperRef.current?.contains(e.target)) return
      if (menuRef.current?.contains(e.target)) return
      setOpen(false)
    }
    const onKey = (e) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    window.addEventListener('scroll', updateMenuPos, true)
    window.addEventListener('resize', updateMenuPos)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
      window.removeEventListener('scroll', updateMenuPos, true)
      window.removeEventListener('resize', updateMenuPos)
    }
  }, [open, updateMenuPos])

  return (
    <div ref={wrapperRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        disabled={disabled}
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        className="input-base w-full flex items-start justify-between gap-2 text-left disabled:opacity-60"
      >
        <span className="min-w-0 flex-1">
          {selected ? (
            <>
              <span className="block font-semibold text-[#111] truncate">{selected.label}</span>
              <span className="block text-[11.5px] text-[#999] leading-snug line-clamp-2">
                {selected.description}
              </span>
            </>
          ) : (
            <span className="text-[#aaa]">{placeholder}</span>
          )}
        </span>
        <svg
          width="10"
          height="10"
          viewBox="0 0 10 10"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          className={`mt-1.5 flex-shrink-0 text-[#999] transition-transform ${open ? 'rotate-180' : ''}`}
          aria-hidden="true"
        >
          <path d="M2 3.5L5 6.5L8 3.5" strokeLinecap="round" />
        </svg>
      </button>

      {open &&
        menuPos &&
        createPortal(
          <div
            ref={menuRef}
            role="listbox"
            style={{
              position: 'fixed',
              top: menuPos.top,
              left: menuPos.left,
              width: menuPos.width,
              maxHeight: 320,
            }}
            className="z-[60] overflow-y-auto bg-white border border-[#e0ddd4] rounded-xl shadow-2xl py-1"
          >
            {options.map((o) => {
              const active = o.key === value
              return (
                <button
                  key={o.key}
                  type="button"
                  role="option"
                  aria-selected={active}
                  onClick={() => {
                    setOpen(false)
                    if (o.key !== value) onChange?.(o.key)
                  }}
                  className={`w-full text-left px-3 py-2 transition-colors ${
                    active ? 'bg-[#f5f3eb]' : 'hover:bg-[#faf9f5]'
                  }`}
                >
                  <span className="block text-[13.5px] font-semibold text-[#111]">{o.label}</span>
                  <span className="block text-[11.5px] text-[#888] leading-snug mt-0.5">
                    {o.description}
                  </span>
                </button>
              )
            })}
          </div>,
          document.body,
        )}
    </div>
  )
}
