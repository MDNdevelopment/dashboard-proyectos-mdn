import { useState, useEffect } from 'react'
import { supabase } from '../supabase'
import { useAuth } from '../context/AuthContext'

export default function NotificationPreferencesPage() {
  const { userProfile } = useAuth()
  const [staff, setStaff] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const isITAdmin = userProfile?.department_id === 0 && (userProfile?.access_level >= 3 || userProfile?.admin === true)

  useEffect(() => {
    if (!isITAdmin) return
    fetchStaff()
  }, [isITAdmin])

  async function fetchStaff() {
    setLoading(true)
    const { data, error } = await supabase
      .from('users')
      .select('user_id, first_name, last_name, email, receive_ticket_notifications')
      .eq('department_id', 0)
      .order('first_name')
    if (error) setError('Error al cargar el personal IT.')
    else setStaff(data ?? [])
    setLoading(false)
  }

  async function toggle(userId, current) {
    const newVal = !current
    setStaff(prev => prev.map(u => u.user_id === userId ? { ...u, receive_ticket_notifications: newVal } : u))
    const { error } = await supabase
      .from('users')
      .update({ receive_ticket_notifications: newVal })
      .eq('user_id', userId)
    if (error) {
      // revert on failure
      setStaff(prev => prev.map(u => u.user_id === userId ? { ...u, receive_ticket_notifications: current } : u))
    }
  }

  if (!isITAdmin) {
    return (
      <main className="flex-1 overflow-y-auto main-bg h-screen">
        <div className="max-w-5xl mx-auto px-6 py-8">
          <div className="bg-white border border-[#e0ddd4] rounded-2xl p-8 text-center">
            <p className="text-[15px] font-semibold text-[#111]">Acceso restringido</p>
            <p className="text-[13px] text-[#888] mt-1">Solo administradores IT pueden ver esta página.</p>
          </div>
        </div>
      </main>
    )
  }

  const allOff = staff.length > 0 && staff.every(u => !u.receive_ticket_notifications)

  return (
    <main className="flex-1 overflow-y-auto main-bg h-screen">
      <div className="max-w-5xl mx-auto px-6 py-8">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-[24px] font-bold text-[#111] leading-tight">Notificaciones de tickets</h1>
          <p className="text-[13px] text-[#888] mt-0.5">Elige quién recibe emails cuando se crea un nuevo ticket de soporte</p>
        </div>

        {allOff && (
          <div className="mb-4 flex items-center gap-2.5 bg-[#fff7e0] border border-[#FFB800] rounded-xl px-4 py-3">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="#b45309" strokeWidth="1.7">
              <path d="M8 2L1.5 13.5h13L8 2Z" strokeLinejoin="round"/>
              <path d="M8 7v3" strokeLinecap="round"/>
              <circle cx="8" cy="11.5" r="0.5" fill="#b45309" stroke="none"/>
            </svg>
            <p className="text-[13px] font-medium text-[#b45309]">
              Nadie recibirá notificaciones de tickets
            </p>
          </div>
        )}

        {loading ? (
          <div className="flex justify-center py-16">
            <div className="w-6 h-6 border-2 border-[#FFB800] border-t-transparent rounded-full animate-spin" />
          </div>
        ) : error ? (
          <div className="bg-white border border-[#e0ddd4] rounded-2xl p-6 text-center">
            <p className="text-[13px] text-[#888]">{error}</p>
          </div>
        ) : (
          <div className="space-y-3">
            {staff.map(user => (
              <div
                key={user.user_id}
                className="bg-white border border-[#e0ddd4] rounded-2xl px-5 py-4 flex items-center gap-4"
              >
                <div className="flex-1 min-w-0">
                  <p className="text-[14px] font-semibold text-[#111] leading-tight">
                    {user.first_name} {user.last_name}
                  </p>
                  <p className="text-[12px] font-mono text-[#888] mt-0.5 truncate">{user.email}</p>
                </div>
                <button
                  role="switch"
                  aria-checked={user.receive_ticket_notifications}
                  aria-label={`Notificaciones para ${user.first_name} ${user.last_name}`}
                  onClick={() => toggle(user.user_id, user.receive_ticket_notifications)}
                  className={`relative flex-shrink-0 w-11 h-6 rounded-full transition-colors focus:outline-none ${
                    user.receive_ticket_notifications ? 'bg-[#FFB800]' : 'bg-[#ddd]'
                  }`}
                >
                  <span
                    className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${
                      user.receive_ticket_notifications ? 'translate-x-5' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </main>
  )
}
