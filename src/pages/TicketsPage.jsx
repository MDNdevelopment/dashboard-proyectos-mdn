import { useEffect } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import TicketsListView from '../components/tickets/TicketsListView'
import TicketAnalyticsView from '../components/tickets/TicketAnalyticsView'
import NotificationPreferencesView from '../components/tickets/NotificationPreferencesView'

function pathToKey(pathname) {
  if (pathname.startsWith('/tickets/analytics')) return 'analytics'
  if (pathname.startsWith('/tickets/notificaciones')) return 'notificaciones'
  return 'lista'
}

export default function TicketsPage() {
  const { userProfile } = useAuth()
  const location = useLocation()
  const navigate = useNavigate()

  const isIT = userProfile?.department_id === 0
  const isITAdmin = isIT && (userProfile?.access_level >= 3 || userProfile?.admin === true)
  const canAnalytics = userProfile?.access_level >= 3 || userProfile?.admin === true

  const ALL_TABS = [
    { key: 'lista',          label: 'Lista de tickets', path: '/tickets',                show: true },
    { key: 'analytics',      label: 'Analíticas',       path: '/tickets/analytics',      show: canAnalytics },
    { key: 'notificaciones', label: 'Notificaciones',   path: '/tickets/notificaciones', show: isITAdmin },
  ]

  const tabs = ALL_TABS.filter(t => t.show)
  const activeKey = pathToKey(location.pathname)

  // Redirigir si el usuario no tiene acceso a la ruta activa
  useEffect(() => {
    if (userProfile == null) return
    if (activeKey === 'analytics' && !canAnalytics) navigate('/tickets', { replace: true })
    if (activeKey === 'notificaciones' && !isITAdmin) navigate('/tickets', { replace: true })
  }, [activeKey, canAnalytics, isITAdmin, navigate, userProfile])

  return (
    <main className="flex-1 overflow-y-auto main-bg h-screen">
      <div className="max-w-5xl mx-auto px-4 py-6 sm:px-6 sm:py-8">

        {/* Header */}
        <div className="mb-6">
          <h1 className="text-[26px] font-bold text-[#111] leading-tight">Soporte Técnico</h1>
          <p className="text-[15px] text-[#888] mt-0.5">
            {isIT ? 'Gestión de solicitudes IT' : 'Tus solicitudes de soporte técnico'}
          </p>
        </div>

        {/* Tab switcher */}
        <div className="flex flex-wrap gap-1 bg-white border border-[#e0ddd4] rounded-xl p-1 w-fit mb-6">
          {tabs.map(tab => (
            <button
              key={tab.key}
              onClick={() => navigate(tab.path)}
              className={`px-4 py-1.5 rounded-lg text-[14.5px] font-semibold transition-all ${
                activeKey === tab.key
                  ? 'bg-[#111] text-white'
                  : 'text-[#666] hover:text-[#111] hover:bg-[#f5f3eb]'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Contenido por tab */}
        {activeKey === 'lista' && <TicketsListView />}
        {activeKey === 'analytics' && canAnalytics && <TicketAnalyticsView />}
        {activeKey === 'notificaciones' && isITAdmin && <NotificationPreferencesView />}

      </div>
    </main>
  )
}
