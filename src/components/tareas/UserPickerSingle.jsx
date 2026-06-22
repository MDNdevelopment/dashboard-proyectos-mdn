import { useState, useRef, useEffect } from 'react'
import { createPortal } from 'react-dom'

// ─── Avatar ──────────────────────────────────────────────────────────────────
const AVATAR_COLORS = [
  '#E14848','#F0871F','#3B6FE0','#16A34A','#9333EA','#0891B2','#B45309','#4F46E5',
]
function avatarColor(id) {
  if (!id) return '#aaa'
  let h = 0
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0
  return AVATAR_COLORS[h % AVATAR_COLORS.length]
}

export function Avatar({ user, size = 28 }) {
  const initials = `${user.first_name?.[0] ?? ''}${user.last_name?.[0] ?? ''}`.toUpperCase()
  const style = { width: size, height: size, fontSize: size * 0.38, flexShrink: 0 }
  if (user.avatar_url) {
    return <img src={user.avatar_url} alt={initials} style={{ ...style, borderRadius: '50%', objectFit: 'cover' }} />
  }
  return (
    <span style={{ ...style, background: avatarColor(user.user_id), borderRadius: '50%', color: '#fff', fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'DM Mono, monospace', letterSpacing: '-0.02em' }}>
      {initials}
    </span>
  )
}

// ─── UserPickerSingle ─────────────────────────────────────────────────────────
/**
 * A single-user picker (for responsable_id / apoyo_id).
 * Props:
 *   users        - array of { user_id, first_name, last_name, avatar_url, access_level, position }
 *   selectedId   - currently selected user_id (string | null)
 *   onChange     - (user_id | null) => void
 *   placeholder  - string  (default "Seleccionar persona")
 *   clearable    - bool    (default true) — show "Ninguno" option
 *   minLevel     - number  (default 0) — only show users with access_level >= minLevel
 */
export default function UserPickerSingle({ users = [], selectedId, onChange, placeholder = 'Seleccionar persona', clearable = true, minLevel = 0 }) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [pos, setPos] = useState({ top: 0, left: 0, width: 0 })
  const triggerRef = useRef(null)
  const popoverRef = useRef(null)

  const selectedUser = users.find(u => u.user_id === selectedId) ?? null

  const openPicker = () => {
    if (open) { setOpen(false); setSearch(''); return }
    if (!triggerRef.current) return
    const r = triggerRef.current.getBoundingClientRect()
    const popH = 280
    const top = window.innerHeight - r.bottom < popH + 8 ? r.top - popH - 4 : r.bottom + 4
    setPos({ top, left: r.left, width: Math.max(r.width, 240) })
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

  function userMeta(u) {
    return [u.position?.position_name, u.access_level != null && `Nivel ${u.access_level}`].filter(Boolean).join(' · ')
  }

  const filtered = users.filter(u => {
    if ((u.access_level ?? 0) < minLevel) return false
    const q = search.toLowerCase()
    return !q || `${u.first_name} ${u.last_name}`.toLowerCase().includes(q)
  })

  const select = (id) => { onChange(id); setOpen(false); setSearch('') }

  return (
    <div>
      <button
        ref={triggerRef}
        type="button"
        onClick={openPicker}
        className="w-full flex items-center gap-2 input-base text-left"
        style={{ minHeight: 40 }}
      >
        {selectedUser ? (
          <>
            <Avatar user={selectedUser} size={22} />
            <div className="flex-1 min-w-0">
              <p className="text-[13px] font-medium text-[#111] truncate">
                {selectedUser.first_name} {selectedUser.last_name}
              </p>
              {userMeta(selectedUser) && (
                <p className="text-[11px] font-mono text-[#888] truncate">{userMeta(selectedUser)}</p>
              )}
            </div>
            {clearable && (
              <span
                role="button"
                tabIndex={0}
                onClick={e => { e.stopPropagation(); onChange(null) }}
                onKeyDown={e => { if (e.key === 'Enter') { e.stopPropagation(); onChange(null) } }}
                className="text-[#bbb] hover:text-[#555] transition-colors leading-none"
                aria-label="Quitar selección"
              >
                <svg width="10" height="10" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12"/>
                </svg>
              </span>
            )}
          </>
        ) : (
          <span className="flex-1 text-[13px] text-[#bbb]">{placeholder}</span>
        )}
        <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.8" className="flex-shrink-0 text-[#999]">
          <path d="M2 3.5l3 3 3-3" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </button>

      {open && createPortal(
        <div
          ref={popoverRef}
          style={{ position: 'fixed', top: pos.top, left: pos.left, width: pos.width, zIndex: 9999 }}
          className="bg-white border border-[#e8e5db] rounded-xl shadow-lg overflow-hidden"
          onKeyDown={e => { if (e.key === 'Escape') { e.stopPropagation(); setOpen(false); setSearch('') } }}
        >
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
                className="w-full bg-[#faf9f5] border border-[#e0ddd4] rounded-lg pl-8 pr-3 py-1.5 text-[12px] text-[#111] placeholder-[#bbb] outline-none focus:border-[#bbb] transition-colors"
              />
            </div>
          </div>
          <div className="max-h-56 overflow-y-auto py-1">
            {clearable && (
              <button
                type="button"
                onClick={() => select(null)}
                className="w-full flex items-center gap-2.5 px-3 py-2 hover:bg-[#f5f3eb] transition-colors text-left"
              >
                <span className="w-6 h-6 rounded-full bg-[#f0ede3] flex items-center justify-center text-[#999] text-[10px] flex-shrink-0">—</span>
                <span className="flex-1 text-[13px] text-[#888]">Ninguno</span>
                {!selectedId && (
                  <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="#22c55e" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7"/>
                  </svg>
                )}
              </button>
            )}
            {filtered.length === 0 ? (
              <p className="text-[12px] text-[#bbb] text-center py-4">Sin resultados</p>
            ) : (
              filtered.map(u => (
                <button
                  key={u.user_id}
                  type="button"
                  onClick={() => select(u.user_id)}
                  className="w-full flex items-center gap-2.5 px-3 py-2 hover:bg-[#f5f3eb] transition-colors text-left"
                >
                  <Avatar user={u} size={26} />
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] font-medium text-[#222] truncate">{u.first_name} {u.last_name}</p>
                    {userMeta(u) && (
                      <p className="text-[11px] font-mono text-[#888] truncate">{userMeta(u)}</p>
                    )}
                  </div>
                  {selectedId === u.user_id && (
                    <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="#22c55e" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7"/>
                    </svg>
                  )}
                </button>
              ))
            )}
          </div>
        </div>,
        document.body
      )}
    </div>
  )
}
