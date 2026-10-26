import { useState, useRef, useId, useLayoutEffect } from 'react'
import { createPortal } from 'react-dom'

const TIP_WIDTH = 260
const GAP = 8

/**
 * Botón circular pequeño con una "i" que explica algo al pasar el cursor (o al enfocarlo
 * con teclado / tocarlo en móvil). El texto va en un portal con posición `fixed`, alineado
 * al borde derecho del botón y hacia arriba (o hacia abajo si no hay espacio), para que no
 * lo recorte un contenedor con `overflow` — mismo patrón que `StatusPill`.
 *
 * @param {string} text   explicación a mostrar
 * @param {string} [label] nombre accesible del botón
 */
export default function InfoTip({ text, label = 'Qué evalúa este indicador' }) {
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState(null)
  const btnRef = useRef(null)
  const tipRef = useRef(null)
  const id = useId()

  useLayoutEffect(() => {
    if (!open || !btnRef.current) return undefined
    function place() {
      const r = btnRef.current.getBoundingClientRect()
      const h = tipRef.current?.offsetHeight ?? 0
      const left = Math.max(8, Math.min(r.right - TIP_WIDTH, window.innerWidth - TIP_WIDTH - 8))
      const above = r.top - GAP - h
      const top = above >= 8 ? above : r.bottom + GAP
      setPos({ left, top })
    }
    place()
    window.addEventListener('scroll', place, true)
    window.addEventListener('resize', place)
    return () => {
      window.removeEventListener('scroll', place, true)
      window.removeEventListener('resize', place)
    }
  }, [open])

  if (!text) return null

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        aria-label={label}
        aria-describedby={open ? id : undefined}
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onClick={(e) => {
          e.stopPropagation()
          setOpen((v) => !v)
        }}
        className="w-4 h-4 rounded-full border border-[#d8d4c8] text-[#999] hover:text-[#111] hover:border-[#999] flex items-center justify-center text-[10px] font-mono font-bold leading-none flex-shrink-0 transition-colors"
      >
        i
      </button>
      {open &&
        createPortal(
          <div
            ref={tipRef}
            id={id}
            role="tooltip"
            style={{
              position: 'fixed',
              width: TIP_WIDTH,
              left: pos?.left ?? 0,
              top: pos?.top ?? 0,
              visibility: pos ? 'visible' : 'hidden',
            }}
            className="z-[60] bg-[#111] text-white text-[12.5px] leading-snug rounded-lg px-3 py-2 shadow-lg pointer-events-none"
          >
            {text}
          </div>,
          document.body,
        )}
    </>
  )
}
