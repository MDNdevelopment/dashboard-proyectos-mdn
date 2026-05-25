import { useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

const DEPARTMENTS = ['Redes', 'Diseño', 'Audiovisual', 'Tecnología']

const VIEWS = [
  { key: 'all',        label: 'Todos los proyectos' },
  { key: 'En proceso', label: 'En proceso'           },
  { key: 'Pendiente',  label: 'Pendientes'           },
  { key: 'Completado', label: 'Completados'          },
]

const VIEW_ICONS = {
  all:         <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.7"><rect x="1" y="1" width="6" height="6" rx="1.5"/><rect x="9" y="1" width="6" height="6" rx="1.5"/><rect x="1" y="9" width="6" height="6" rx="1.5"/><rect x="9" y="9" width="6" height="6" rx="1.5"/></svg>,
  'En proceso':<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.7"><circle cx="8" cy="8" r="6.5"/><path d="M8 4.5V8l2.5 2" strokeLinecap="round"/></svg>,
  Pendiente:   <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.7"><circle cx="8" cy="8" r="6.5"/><circle cx="8" cy="8" r="2" fill="currentColor" stroke="none"/></svg>,
  Completado:  <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.7"><circle cx="8" cy="8" r="6.5"/><path d="M5 8.5l2 2 4-4" strokeLinecap="round" strokeLinejoin="round"/></svg>,
}

const TICKET_ICON = <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.7"><rect x="1" y="3" width="14" height="10" rx="1.5"/><path d="M1 6h14" strokeLinecap="round"/><path d="M5 10h6" strokeLinecap="round"/></svg>
const BELL_ICON = <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.7"><path d="M8 1.5a4.5 4.5 0 0 1 4.5 4.5c0 2.5.8 3.5 1.5 4.5H2c.7-1 1.5-2 1.5-4.5A4.5 4.5 0 0 1 8 1.5Z" strokeLinecap="round" strokeLinejoin="round"/><path d="M6.5 13a1.5 1.5 0 0 0 3 0" strokeLinecap="round"/></svg>
const CHART_ICON = <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.7"><rect x="1" y="8" width="3" height="6" rx="1"/><rect x="6" y="5" width="3" height="9" rx="1"/><rect x="11" y="2" width="3" height="12" rx="1"/></svg>
const ADS_ICON = <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.7"><path d="M2 11V5l6-3 6 3v6l-6 3-6-3Z" strokeLinejoin="round"/><path d="M8 2v12M2 5l6 3 6-3" strokeLinecap="round"/></svg>

function Sidebar({ projects, activeFilter, onFilterChange, onNewProject, connected }) {
  const { signOut, userProfile } = useAuth()
  const isITAdmin = userProfile?.department_id === 0 && (userProfile?.access_level >= 3 || userProfile?.admin === true)
  const canAnalytics = userProfile?.access_level >= 3 || userProfile?.admin === true
  const location = useLocation()
  const navigate = useNavigate()
  const hasProjects = projects != null

  const counts = hasProjects ? {
    all:           projects.length,
    'En proceso':  projects.filter(p => p.status === 'En proceso').length,
    'Pendiente':   projects.filter(p => p.status === 'Pendiente').length,
    'Completado':  projects.filter(p => p.status === 'Completado').length,
  } : {}

  const deptCounts = {}
  if (hasProjects) {
    DEPARTMENTS.forEach(d => {
      deptCounts[d] = projects.filter(p =>
        (p.departments ?? (p.department ? [p.department] : [])).includes(d)
      ).length
    })
  }

  const hasDepts = hasProjects && DEPARTMENTS.some(d => deptCounts[d] > 0)
  const isProjectsRoute = location.pathname === '/'
  const isTicketsRoute = location.pathname.startsWith('/tickets')
  const ticketsActive = location.pathname === '/tickets'
  const analyticsActive = location.pathname === '/tickets/analytics'
  const notifActive = location.pathname === '/tickets/notificaciones'
  const [ticketsOpen, setTicketsOpen] = useState(isTicketsRoute)

  const isAdsRoute = location.pathname.startsWith('/ads')
  const adsActive = location.pathname === '/ads'
  const [adsOpen, setAdsOpen] = useState(isAdsRoute)

  return (
    <aside className="w-[230px] flex-shrink-0 bg-white border-r border-[#e0ddd4] flex flex-col h-full">

      {/* Brand */}
      <div className="px-5 pt-6 pb-5 border-b border-[#ece9df]">
        <div className="mb-3">
          <p className="text-[14px] font-bold text-[#111] leading-none tracking-tight">MDN</p>
          <p className="text-[11px] font-medium text-[#666] mt-0.5">Publicidad</p>
        </div>
        {hasProjects && (
          <div className={`flex items-center gap-1.5 text-[11px] font-semibold ${connected ? 'text-[#16a34a]' : 'text-[#888]'}`}>
            <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${connected ? 'bg-[#22c55e] animate-pulse' : 'bg-[#bbb]'}`} />
            {connected ? 'En vivo' : 'Conectando...'}
          </div>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-4 overflow-y-auto">

        {hasProjects && (
          <>
            <p className="text-[10px] font-mono font-bold tracking-[0.16em] uppercase text-[#888] px-2 mb-2">
              Vistas
            </p>

            <div className="space-y-0.5">
              {VIEWS.map(view => {
                const active = isProjectsRoute && activeFilter === view.key
                return (
                  <button
                    key={view.key}
                    onClick={() => { onFilterChange(view.key); if (isTicketsRoute || isAdsRoute) navigate('/') }}
                    className={`flex items-center gap-2.5 w-full px-3 py-2 rounded-lg text-[13px] font-medium transition-all text-left ${
                      active
                        ? 'bg-[#FFB800] text-[#111]'
                        : 'text-[#444] hover:bg-[#f5f3eb] hover:text-[#111]'
                    }`}
                  >
                    <span className={`flex-shrink-0 ${active ? 'text-[#111]' : 'text-[#666]'}`}>
                      {VIEW_ICONS[view.key]}
                    </span>
                    <span className="flex-1">{view.label}</span>
                    <span className={`text-[11px] font-mono font-bold min-w-[22px] text-center px-1.5 py-0.5 rounded-md ${
                      active ? 'bg-black/12 text-[#111]' : 'bg-[#f0ede3] text-[#555]'
                    }`}>
                      {counts[view.key] ?? 0}
                    </span>
                  </button>
                )
              })}
            </div>

            {hasDepts && (
              <>
                <div className="h-px bg-[#ece9df] mx-2 my-4" />
                <p className="text-[10px] font-mono font-bold tracking-[0.16em] uppercase text-[#888] px-2 mb-2">
                  Departamentos
                </p>
                <div className="space-y-0.5">
                  {DEPARTMENTS.filter(d => deptCounts[d] > 0).map(dept => {
                    const key = `dept:${dept}`
                    const active = isProjectsRoute && activeFilter === key
                    return (
                      <button
                        key={dept}
                        onClick={() => { onFilterChange(key); if (isTicketsRoute || isAdsRoute) navigate('/') }}
                        className={`flex items-center gap-2.5 w-full px-3 py-2 rounded-lg text-[13px] font-medium transition-all text-left ${
                          active
                            ? 'bg-[#FFB800] text-[#111]'
                            : 'text-[#444] hover:bg-[#f5f3eb] hover:text-[#111]'
                        }`}
                      >
                        <span className={`w-2 h-2 rounded-full flex-shrink-0 ${active ? 'bg-[#111]' : 'bg-[#bbb]'}`} />
                        <span className="flex-1">{dept}</span>
                        <span className={`text-[11px] font-mono font-bold min-w-[22px] text-center px-1.5 py-0.5 rounded-md ${
                          active ? 'bg-black/12 text-[#111]' : 'bg-[#f0ede3] text-[#555]'
                        }`}>
                          {deptCounts[dept]}
                        </span>
                      </button>
                    )
                  })}
                </div>
              </>
            )}

            <div className="h-px bg-[#ece9df] mx-2 my-4" />
          </>
        )}

        <p className="text-[10px] font-mono font-bold tracking-[0.16em] uppercase text-[#888] px-2 mb-2">
          Herramientas
        </p>
        <div className="space-y-0.5">
          {/* Tickets de soporte — menú desplegable */}
          <button
            onClick={() => setTicketsOpen(o => !o)}
            className={`flex items-center gap-2.5 w-full px-3 py-2 rounded-lg text-[13px] font-medium transition-all text-left ${
              isTicketsRoute && !ticketsOpen
                ? 'bg-[#FFB800] text-[#111]'
                : isTicketsRoute
                  ? 'text-[#111] bg-[#f5f3eb]'
                  : 'text-[#444] hover:bg-[#f5f3eb] hover:text-[#111]'
            }`}
          >
            <span className={`flex-shrink-0 ${isTicketsRoute ? 'text-[#111]' : 'text-[#666]'}`}>
              {TICKET_ICON}
            </span>
            <span className="flex-1">Tickets de soporte</span>
            <svg
              width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.8"
              className={`flex-shrink-0 transition-transform duration-200 ${ticketsOpen ? 'rotate-180' : ''}`}
            >
              <path d="M2 3.5l3 3 3-3" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>

          {ticketsOpen && (
            <div className="ml-3 pl-3 border-l-2 border-[#ece9df] space-y-0.5 mt-0.5">
              <Link
                to="/tickets"
                className={`flex items-center gap-2.5 w-full px-3 py-1.5 rounded-lg text-[12.5px] font-medium transition-all text-left ${
                  ticketsActive
                    ? 'bg-[#FFB800] text-[#111]'
                    : 'text-[#444] hover:bg-[#f5f3eb] hover:text-[#111]'
                }`}
              >
                <span className={`flex-shrink-0 ${ticketsActive ? 'text-[#111]' : 'text-[#666]'}`}>
                  {TICKET_ICON}
                </span>
                <span className="flex-1">Lista de tickets</span>
              </Link>
              {canAnalytics && (
                <Link
                  to="/tickets/analytics"
                  className={`flex items-center gap-2.5 w-full px-3 py-1.5 rounded-lg text-[12.5px] font-medium transition-all text-left ${
                    analyticsActive
                      ? 'bg-[#FFB800] text-[#111]'
                      : 'text-[#444] hover:bg-[#f5f3eb] hover:text-[#111]'
                  }`}
                >
                  <span className={`flex-shrink-0 ${analyticsActive ? 'text-[#111]' : 'text-[#666]'}`}>
                    {CHART_ICON}
                  </span>
                  <span className="flex-1">Analíticas</span>
                </Link>
              )}
              {isITAdmin && (
                <Link
                  to="/tickets/notificaciones"
                  className={`flex items-center gap-2.5 w-full px-3 py-1.5 rounded-lg text-[12.5px] font-medium transition-all text-left ${
                    notifActive
                      ? 'bg-[#FFB800] text-[#111]'
                      : 'text-[#444] hover:bg-[#f5f3eb] hover:text-[#111]'
                  }`}
                >
                  <span className={`flex-shrink-0 ${notifActive ? 'text-[#111]' : 'text-[#666]'}`}>
                    {BELL_ICON}
                  </span>
                  <span className="flex-1">Notificaciones</span>
                </Link>
              )}
            </div>
          )}
          {/* Campañas & Tácticas — menú desplegable */}
          <button
            onClick={() => setAdsOpen(o => !o)}
            className={`flex items-center gap-2.5 w-full px-3 py-2 rounded-lg text-[13px] font-medium transition-all text-left ${
              isAdsRoute && !adsOpen
                ? 'bg-[#FFB800] text-[#111]'
                : isAdsRoute
                  ? 'text-[#111] bg-[#f5f3eb]'
                  : 'text-[#444] hover:bg-[#f5f3eb] hover:text-[#111]'
            }`}
          >
            <span className={`flex-shrink-0 ${isAdsRoute ? 'text-[#111]' : 'text-[#666]'}`}>
              {ADS_ICON}
            </span>
            <span className="flex-1">Campañas</span>
            <svg
              width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.8"
              className={`flex-shrink-0 transition-transform duration-200 ${adsOpen ? 'rotate-180' : ''}`}
            >
              <path d="M2 3.5l3 3 3-3" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>

          {adsOpen && (
            <div className="ml-3 pl-3 border-l-2 border-[#ece9df] space-y-0.5 mt-0.5">
              <Link
                to="/ads"
                className={`flex items-center gap-2.5 w-full px-3 py-1.5 rounded-lg text-[12.5px] font-medium transition-all text-left ${
                  adsActive
                    ? 'bg-[#FFB800] text-[#111]'
                    : 'text-[#444] hover:bg-[#f5f3eb] hover:text-[#111]'
                }`}
              >
                <span className={`flex-shrink-0 ${adsActive ? 'text-[#111]' : 'text-[#666]'}`}>
                  {ADS_ICON}
                </span>
                <span className="flex-1">Lista de campañas</span>
              </Link>
            </div>
          )}
        </div>
      </nav>

      {/* CTA */}
      <div className="px-4 pb-6 pt-3 border-t border-[#ece9df]">
        {hasProjects && (
          <button
            onClick={onNewProject}
            className="w-full bg-[#111] text-white text-[13px] font-bold py-2.5 rounded-xl hover:bg-[#222] transition-colors flex items-center justify-center gap-2"
          >
            <svg width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2.8">
              <path d="M6 1v10M1 6h10" strokeLinecap="round"/>
            </svg>
            Nuevo proyecto
          </button>
        )}
        <div className={`${hasProjects ? 'mt-3' : ''} text-center`}>
          <p className="text-[18px] font-bold text-[#111] leading-none">
            {new Date().toLocaleDateString('es-VE', { day: 'numeric', month: 'short' })}
          </p>
          <p className="text-[11px] font-medium text-[#888] mt-0.5 capitalize">
            {new Date().toLocaleDateString('es-VE', { weekday: 'long' })}
          </p>
        </div>
        <button
          onClick={signOut}
          className="mt-3 w-full text-[12px] font-medium text-[#999] hover:text-[#111] transition-colors py-1.5 rounded-lg hover:bg-[#f5f3eb]"
        >
          Cerrar sesión
        </button>
      </div>
    </aside>
  )
}

export default Sidebar
