import { useState, useEffect, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { createPortal } from 'react-dom'
import { supabase } from '../../supabase'
import { useAuth } from '../../context/AuthContext'
import { notifIcon, notifLabel, notifRoute, notifTimeAgo } from '../../utils/notificationFormat'

const PAGE_SIZE = 40

// Each mounted instance gets a unique sequence number so two simultaneous bells
// (desktop Sidebar + mobile AppLayout top bar) never share a Supabase channel topic.
let bellInstanceSeq = 0

/**
 * NotificationBell — global in-app notification center.
 * Renders a bell icon with an unread badge. Clicking opens a panel listing
 * recent notifications with real-time updates via postgres_changes.
 *
 * Mount this component once in the global layout:
 *  - Desktop: inside Sidebar's user area
 *  - Mobile: inside AppLayout's top bar
 */
export default function NotificationBell() {
  const { userProfile } = useAuth()
  const navigate = useNavigate()
  const [notifs, setNotifs] = useState([])
  const [open, setOpen] = useState(false)
  const [markingAll, setMarkingAll] = useState(false)
  const [hasMore, setHasMore] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const buttonRef = useRef(null)
  const panelRef = useRef(null)

  const userId = userProfile?.user_id ?? null

  // Nº de páginas ya traídas del servidor. El offset de "Cargar más" se calcula
  // desde aquí (pagesLoaded * PAGE_SIZE) y NO desde notifs.length: así una inserción
  // en tiempo real que se antepone a la lista no desplaza el cursor de paginado
  // (a lo sumo re-trae una fila ya vista, que se deduplica por id — nunca la salta).
  const pagesLoadedRef = useRef(1)

  // Stable per-instance id; assigned once on first render, never changes.
  const instanceIdRef = useRef(null)
  if (instanceIdRef.current === null) instanceIdRef.current = ++bellInstanceSeq

  // ── Load notifications (primera página) ─────────────────────────────────────
  const loadNotifs = useCallback(async () => {
    if (!userId) return
    const { data } = await supabase
      .from('notifications')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .range(0, PAGE_SIZE - 1)
    setNotifs(data ?? [])
    pagesLoadedRef.current = 1
    setHasMore((data?.length ?? 0) === PAGE_SIZE)
  }, [userId])

  useEffect(() => {
    loadNotifs()
  }, [loadNotifs])

  // ── Cargar más (páginas anteriores) ─────────────────────────────────────────
  const loadMore = useCallback(async () => {
    if (!userId || loadingMore) return
    setLoadingMore(true)
    const from = pagesLoadedRef.current * PAGE_SIZE
    const { data } = await supabase
      .from('notifications')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .range(from, from + PAGE_SIZE - 1)
    const page = data ?? []
    setNotifs((prev) => {
      const seen = new Set(prev.map((n) => n.id))
      return [...prev, ...page.filter((n) => !seen.has(n.id))]
    })
    pagesLoadedRef.current += 1
    setHasMore(page.length === PAGE_SIZE)
    setLoadingMore(false)
  }, [userId, loadingMore])

  // ── Realtime subscription ───────────────────────────────────────────────────
  useEffect(() => {
    if (!userId) return
    const channel = supabase
      .channel(`notifications-${userId}-${instanceIdRef.current}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${userId}`,
        },
        (payload) => {
          // No se recorta la lista: si el usuario ya cargó páginas anteriores con
          // "Cargar más", truncar a PAGE_SIZE le borraría el historial que abrió.
          setNotifs((prev) =>
            prev.some((n) => n.id === payload.new.id) ? prev : [payload.new, ...prev],
          )
        },
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${userId}`,
        },
        (payload) => {
          setNotifs((prev) => prev.map((n) => (n.id === payload.new.id ? payload.new : n)))
        },
      )
      .subscribe()
    return () => {
      supabase.removeChannel(channel)
    }
  }, [userId])

  // ── Close panel on outside click ────────────────────────────────────────────
  useEffect(() => {
    if (!open) return
    function handleClick(e) {
      if (
        panelRef.current &&
        !panelRef.current.contains(e.target) &&
        buttonRef.current &&
        !buttonRef.current.contains(e.target)
      ) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [open])

  // ── Actions ─────────────────────────────────────────────────────────────────
  async function markRead(notif) {
    if (notif.read) return
    setNotifs((prev) => prev.map((n) => (n.id === notif.id ? { ...n, read: true } : n)))
    await supabase.from('notifications').update({ read: true }).eq('id', notif.id)
  }

  async function markAllRead() {
    const unread = notifs.filter((n) => !n.read)
    if (unread.length === 0) return
    setMarkingAll(true)
    setNotifs((prev) => prev.map((n) => ({ ...n, read: true })))
    await supabase
      .from('notifications')
      .update({ read: true })
      .eq('user_id', userId)
      .eq('read', false)
    setMarkingAll(false)
  }

  function handleClick(notif) {
    markRead(notif)
    setOpen(false)
    navigate(notifRoute(notif))
  }

  // ── Derived state ────────────────────────────────────────────────────────────
  const unreadCount = notifs.filter((n) => !n.read).length

  if (!userId) return null

  // ── Panel position ────────────────────────────────────────────────────────────
  // Opens upward when button is in the lower half of the screen (Sidebar),
  // downward when in the upper half (mobile top bar).
  // Anchors horizontally to the button's left edge, clamped to stay in viewport.
  function getPanelStyle() {
    const PANEL_W = 340
    const GAP = 8
    if (!buttonRef.current) return { top: 60, left: 16 }
    const rect = buttonRef.current.getBoundingClientRect()
    const openUpward = rect.bottom > window.innerHeight / 2

    const rawLeft = rect.left
    const left = Math.min(rawLeft, window.innerWidth - PANEL_W - GAP)

    if (openUpward) {
      return { bottom: window.innerHeight - rect.top + GAP, left: Math.max(GAP, left) }
    }
    return { top: rect.bottom + GAP, left: Math.max(GAP, left) }
  }

  return (
    <>
      {/* Bell button */}
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label={unreadCount > 0 ? `${unreadCount} notificaciones sin leer` : 'Notificaciones'}
        className="relative flex items-center justify-center w-7 h-7 rounded-lg text-[#999] hover:text-[#111] hover:bg-[#f0ede3] transition-colors flex-shrink-0"
      >
        {/* Bell SVG */}
        <svg
          width="15"
          height="15"
          viewBox="0 0 16 16"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.7"
        >
          <path
            d="M8 1.5a4.5 4.5 0 0 1 4.5 4.5c0 2.5.8 3.5 1.5 4.5H2c.7-1 1.5-2 1.5-4.5A4.5 4.5 0 0 1 8 1.5Z"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path d="M6.5 13a1.5 1.5 0 0 0 3 0" strokeLinecap="round" />
        </svg>

        {/* Unread badge */}
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 min-w-[16px] h-[16px] px-[3px] bg-[#FFB800] text-[#111] text-[10px] font-mono font-bold rounded-full flex items-center justify-center leading-none">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {/* Panel — rendered via portal so it escapes any overflow:hidden containers */}
      {open &&
        createPortal(
          <div
            ref={panelRef}
            style={{ ...getPanelStyle(), position: 'fixed', zIndex: 9999, width: 340 }}
            className="bg-white border border-[#e0ddd4] rounded-2xl shadow-2xl overflow-hidden"
          >
            {/* Panel header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-[#ece9df]">
              <span className="text-[15px] font-bold text-[#111]">
                Notificaciones
                {unreadCount > 0 && (
                  <span className="ml-2 text-[12px] font-mono font-bold bg-[#FFB800] text-[#111] px-1.5 py-0.5 rounded-md">
                    {unreadCount}
                  </span>
                )}
              </span>
              {unreadCount > 0 && (
                <button
                  type="button"
                  onClick={markAllRead}
                  disabled={markingAll}
                  className="text-[13px] text-[#888] hover:text-[#111] font-medium transition-colors disabled:opacity-40"
                >
                  Marcar todas
                </button>
              )}
            </div>

            {/* Notification list */}
            <div className="overflow-y-auto max-h-[400px]">
              {notifs.length === 0 ? (
                <div className="py-10 text-center">
                  <p className="text-[15px] font-semibold text-[#bbb]">Sin notificaciones</p>
                  <p className="text-[13px] text-[#ccc] mt-1">Aquí aparecerán tus alertas.</p>
                </div>
              ) : (
                <>
                  {notifs.map((notif) => (
                    <button
                      key={notif.id}
                      type="button"
                      onClick={() => handleClick(notif)}
                      className={`w-full flex items-start gap-3 px-4 py-3 text-left border-b border-[#f5f3eb] last:border-b-0 transition-colors ${
                        notif.read ? 'hover:bg-[#fafaf7]' : 'bg-[#fffbee] hover:bg-[#fff6d6]'
                      }`}
                    >
                      {/* Icon */}
                      <span
                        className="text-[20px] flex-shrink-0 mt-0.5 leading-none"
                        role="img"
                        aria-label=""
                      >
                        {notifIcon(notif.type)}
                      </span>

                      {/* Content */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2">
                          <p
                            className={`text-[14px] leading-snug ${notif.read ? 'text-[#555]' : 'text-[#111] font-semibold'}`}
                          >
                            {notif.title}
                          </p>
                          {!notif.read && (
                            <span className="w-2 h-2 rounded-full bg-[#FFB800] flex-shrink-0 mt-1" />
                          )}
                        </div>
                        <p className="text-[13px] text-[#888] mt-0.5 leading-snug line-clamp-2">
                          {notif.body}
                        </p>
                        <p className="text-[11px] font-mono text-[#bbb] mt-1">
                          {notifLabel(notif.type)} · {notifTimeAgo(notif.created_at)}
                        </p>
                      </div>
                    </button>
                  ))}
                  {hasMore && (
                    <button
                      type="button"
                      onClick={loadMore}
                      disabled={loadingMore}
                      className="w-full py-3 text-[13px] font-semibold text-[#888] hover:text-[#111] hover:bg-[#fafaf7] transition-colors disabled:opacity-40"
                    >
                      {loadingMore ? 'Cargando…' : 'Cargar más'}
                    </button>
                  )}
                </>
              )}
            </div>
          </div>,
          document.body,
        )}
    </>
  )
}
