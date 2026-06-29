import { useState, useRef, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { Avatar } from './UserPickerSingle'

/**
 * Picker de múltiples usuarios (para responsables de tarea).
 * Props:
 *   users        - array de { user_id, first_name, last_name, avatar_url, position }
 *   selectedIds  - string[] de user_ids seleccionados
 *   onChange     - (string[]) => void  — recibe el nuevo array de ids
 *   lockedIds    - string[] que no se pueden quitar (ej. el usuario nivel 1 propio)
 *   placeholder  - string (default "Agregar responsable...")
 */
export default function UserPickerMulti({
  users = [],
  selectedIds = [],
  onChange,
  lockedIds = [],
  placeholder = 'Agregar responsable...',
}) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [pos, setPos] = useState({ top: 0, left: 0, width: 0 })
  const triggerRef = useRef(null)
  const popoverRef = useRef(null)

  const selectedUsers = selectedIds.map(id => users.find(u => u.user_id === id)).filter(Boolean)

  function openPicker() {
    if (open) { setOpen(false); setSearch(''); return }
    if (!triggerRef.current) return
    const r = triggerRef.current.getBoundingClientRect()
    const popH = 320
    const top = window.innerHeight - r.bottom < popH + 8 ? r.top - popH - 4 : r.bottom + 4
    setPos({ top, left: r.left, width: Math.max(r.width, 260) })
    setOpen(true)
  }

  useEffect(() => {
    if (!open) return
    const fn = e => {
      if (!popoverRef.current?.contains(e.target) && !triggerRef.current?.contains(e.target)) {
        setOpen(false); setSearch('')
      }
    }
    document.addEventListener('mousedown', fn)
    return () => document.removeEventListener('mousedown', fn)
  }, [open])

  function toggle(userId) {
    if (lockedIds.includes(userId) && selectedIds.includes(userId)) return // bloqueado
    if (selectedIds.includes(userId)) {
      onChange(selectedIds.filter(id => id !== userId))
    } else {
      onChange([...selectedIds, userId])
    }
  }

  function removeChip(userId, e) {
    e.stopPropagation()
    if (lockedIds.includes(userId)) return
    onChange(selectedIds.filter(id => id !== userId))
  }

  const filtered = users.filter(u => {
    const q = search.toLowerCase()
    return !q || `${u.first_name} ${u.last_name}`.toLowerCase().includes(q)
  })

  return (
    <div>
      {/* Trigger */}
      <div
        ref={triggerRef}
        role="button"
        aria-label="Seleccionar responsables"
        tabIndex={0}
        onClick={openPicker}
        onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') openPicker() }}
        className="w-full min-h-[40px] flex flex-wrap items-center gap-1.5 input-base cursor-pointer"
      >
        {selectedUsers.length === 0 ? (
          <span className="flex-1 text-[15px] text-[#bbb]">{placeholder}</span>
        ) : (
          selectedUsers.map(u => (
            <span
              key={u.user_id}
              className="inline-flex items-center gap-1 bg-[#f0ede3] rounded-full pl-0.5 pr-1.5 py-0.5 text-[13.5px] text-[#333]"
            >
              <Avatar user={u} size={18} />
              <span className="max-w-[90px] truncate">{u.first_name}</span>
              {!lockedIds.includes(u.user_id) && (
                <button
                  type="button"
                  onClick={e => removeChip(u.user_id, e)}
                  className="text-[#aaa] hover:text-[#555] transition-colors leading-none ml-0.5 flex-shrink-0"
                  aria-label={`Quitar ${u.first_name}`}
                >
                  <svg width="8" height="8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12"/>
                  </svg>
                </button>
              )}
            </span>
          ))
        )}
        <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.8" className="flex-shrink-0 text-[#999] ml-auto">
          <path d="M2 3.5l3 3 3-3" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </div>

      {/* Popover */}
      {open && createPortal(
        <div
          ref={popoverRef}
          style={{ position: 'fixed', top: pos.top, left: pos.left, width: pos.width, zIndex: 9999 }}
          className="bg-white border border-[#e8e5db] rounded-xl shadow-lg overflow-hidden"
          onKeyDown={e => { if (e.key === 'Escape') { e.stopPropagation(); setOpen(false); setSearch('') } }}
        >
          {/* Search */}
          <div className="p-2 border-b border-[#f0ede4]">
            <div className="relative">
              <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[#999] pointer-events-none" width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="6.5" cy="6.5" r="5"/>
                <path d="M10.5 10.5L14 14" strokeLinecap="round"/>
              </svg>
              <input
                autoFocus
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Buscar..."
                className="w-full bg-[#faf9f5] border border-[#e0ddd4] rounded-lg pl-8 pr-3 py-1.5 text-[18px] sm:text-[14px] text-[#111] placeholder-[#bbb] outline-none focus:border-[#bbb] transition-colors"
              />
            </div>
          </div>

          {/* User list */}
          <div className="max-h-56 overflow-y-auto py-1">
            {filtered.length === 0 ? (
              <p className="text-[14px] text-[#bbb] text-center py-4">Sin resultados</p>
            ) : (
              filtered.map(u => {
                const isSelected = selectedIds.includes(u.user_id)
                const isLocked = lockedIds.includes(u.user_id) && isSelected
                return (
                  <button
                    key={u.user_id}
                    type="button"
                    onClick={() => toggle(u.user_id)}
                    className={`w-full flex items-center gap-2.5 px-3 py-2 hover:bg-[#f5f3eb] transition-colors text-left ${isLocked ? 'opacity-60 cursor-not-allowed' : ''}`}
                  >
                    <Avatar user={u} size={26} />
                    <div className="flex-1 min-w-0">
                      <p className="text-[15px] font-medium text-[#222] truncate">{u.first_name} {u.last_name}</p>
                      {u.position?.position_name && (
                        <p className="text-[13px] font-mono text-[#888] truncate">{u.position.position_name}</p>
                      )}
                    </div>
                    {isLocked ? (
                      /* Locked: always assigned, can't remove */
                      <svg width="13" height="13" fill="none" viewBox="0 0 24 24" stroke="#bbb" strokeWidth={2} title="Asignado fijo">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"/>
                      </svg>
                    ) : isSelected ? (
                      <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="#22c55e" strokeWidth={2.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7"/>
                      </svg>
                    ) : null}
                  </button>
                )
              })
            )}
          </div>

          {/* Footer */}
          <div className="px-3 py-2 border-t border-[#f0ede4] flex items-center justify-between">
            <span className="text-[13px] text-[#888]">
              {selectedIds.length} responsable{selectedIds.length !== 1 ? 's' : ''}
            </span>
            <button
              type="button"
              onClick={() => { setOpen(false); setSearch('') }}
              className="text-[13px] font-semibold text-[#555] hover:text-[#111] transition-colors"
            >
              Listo
            </button>
          </div>
        </div>,
        document.body
      )}
    </div>
  )
}
