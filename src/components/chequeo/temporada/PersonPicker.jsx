import { useState, useRef, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { Avatar } from '../../tareas/UserPickerSingle'

const fullName = (u) => [u?.first_name, u?.last_name].filter(Boolean).join(' ')

/**
 * Selector de persona COMPACTO para las casillas de la grilla de temporada: la casilla solo
 * muestra la foto y el nombre de pila (el nombre completo va en el menú y en el tooltip), para
 * ocupar poco ancho. El menú se abre en un portal (no lo recorta el scroll de la tabla) y
 * trae buscador y «Ninguno».
 *
 * Props: `users` (opciones), `selectedId`, `onChange(userId | null)`, `placeholder`.
 * La persona seleccionada se resuelve contra `users`, así que debe venir incluida aunque
 * esté archivada.
 */
export default function PersonPicker({ users, selectedId, onChange, placeholder = 'Sin asignar' }) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [pos, setPos] = useState({ top: 0, left: 0, width: 0 })
  const triggerRef = useRef(null)
  const popoverRef = useRef(null)

  const selected = users.find((u) => u.user_id === selectedId) ?? null

  function close() {
    setOpen(false)
    setSearch('')
  }

  function toggle() {
    if (open) return close()
    if (!triggerRef.current) return
    const r = triggerRef.current.getBoundingClientRect()
    const popH = 280
    const top = window.innerHeight - r.bottom < popH + 8 ? r.top - popH - 4 : r.bottom + 4
    setPos({ top, left: r.left, width: Math.max(r.width, 230) })
    setOpen(true)
  }

  useEffect(() => {
    if (!open) return
    const onDown = (e) => {
      if (!popoverRef.current?.contains(e.target) && !triggerRef.current?.contains(e.target)) {
        close()
      }
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])

  function pick(id) {
    onChange(id)
    close()
  }

  const q = search.trim().toLowerCase()
  const options = users
    .filter((u) => !u.deleted_at && (!q || fullName(u).toLowerCase().includes(q)))
    .sort((a, b) => fullName(a).localeCompare(fullName(b), 'es', { sensitivity: 'base' }))

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={toggle}
        title={selected ? fullName(selected) : placeholder}
        className="input-base flex w-full min-w-0 items-center gap-1.5 text-left"
        style={{ minHeight: 30, padding: '3px 6px' }}
      >
        {selected ? (
          <>
            <Avatar user={selected} size={20} />
            <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-[#111]">
              {selected.first_name}
            </span>
          </>
        ) : (
          <span className="min-w-0 flex-1 truncate text-[13px] text-[#bbb]">{placeholder}</span>
        )}
        <svg
          width="9"
          height="9"
          viewBox="0 0 10 10"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          className="flex-shrink-0 text-[#999]"
        >
          <path d="M2 3.5l3 3 3-3" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {open &&
        createPortal(
          <div
            ref={popoverRef}
            style={{
              position: 'fixed',
              top: pos.top,
              left: pos.left,
              width: pos.width,
              zIndex: 9999,
            }}
            className="overflow-hidden rounded-xl border border-[#e8e5db] bg-white shadow-lg"
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                e.stopPropagation()
                close()
              }
            }}
          >
            <div className="border-b border-[#f0ede4] p-2">
              <input
                autoFocus
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar..."
                className="w-full rounded-lg border border-[#e0ddd4] bg-[#faf9f5] px-3 py-1.5 text-[14px] text-[#111] outline-none placeholder-[#bbb] focus:border-[#bbb]"
              />
            </div>
            <div className="max-h-56 overflow-y-auto py-1">
              <button
                type="button"
                onClick={() => pick(null)}
                className="flex w-full items-center gap-2.5 px-3 py-2 text-left hover:bg-[#f5f3eb]"
              >
                <span className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-[#f0ede3] text-[12px] text-[#999]">
                  —
                </span>
                <span className="flex-1 text-[14.5px] text-[#888]">Ninguno</span>
                {!selectedId && <span className="text-[#22c55e]">✓</span>}
              </button>
              {options.length === 0 ? (
                <p className="py-4 text-center text-[14px] text-[#bbb]">Sin resultados</p>
              ) : (
                options.map((u) => (
                  <button
                    key={u.user_id}
                    type="button"
                    onClick={() => pick(u.user_id)}
                    className="flex w-full items-center gap-2.5 px-3 py-2 text-left hover:bg-[#f5f3eb]"
                  >
                    <Avatar user={u} size={26} />
                    <span className="min-w-0 flex-1 truncate text-[14.5px] font-medium text-[#222]">
                      {fullName(u)}
                    </span>
                    {selectedId === u.user_id && <span className="text-[#22c55e]">✓</span>}
                  </button>
                ))
              )}
            </div>
          </div>,
          document.body,
        )}
    </>
  )
}
