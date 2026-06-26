import { useState, useRef, useEffect } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../supabase'
import MDNLogo from './MDNLogo'
import AvatarUpload from './empresa/AvatarUpload'

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

const PROJECTS_ICON = <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.7"><rect x="1" y="1" width="6" height="6" rx="1.5"/><rect x="9" y="1" width="6" height="6" rx="1.5"/><rect x="1" y="9" width="6" height="6" rx="1.5"/><rect x="9" y="9" width="6" height="6" rx="1.5"/></svg>
const TICKET_ICON = <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.7"><rect x="1" y="3" width="14" height="10" rx="1.5"/><path d="M1 6h14" strokeLinecap="round"/><path d="M5 10h6" strokeLinecap="round"/></svg>
const BELL_ICON = <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.7"><path d="M8 1.5a4.5 4.5 0 0 1 4.5 4.5c0 2.5.8 3.5 1.5 4.5H2c.7-1 1.5-2 1.5-4.5A4.5 4.5 0 0 1 8 1.5Z" strokeLinecap="round" strokeLinejoin="round"/><path d="M6.5 13a1.5 1.5 0 0 0 3 0" strokeLinecap="round"/></svg>
const CHART_ICON = <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.7"><rect x="1" y="8" width="3" height="6" rx="1"/><rect x="6" y="5" width="3" height="9" rx="1"/><rect x="11" y="2" width="3" height="12" rx="1"/></svg>
const ADS_ICON = <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.7"><path d="M2 11V5l6-3 6 3v6l-6 3-6-3Z" strokeLinejoin="round"/><path d="M8 2v12M2 5l6 3 6-3" strokeLinecap="round"/></svg>
const TASKS_ICON = <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.7"><rect x="1.5" y="2" width="13" height="12" rx="1.5"/><path d="M5 6h6M5 9h4" strokeLinecap="round"/><path d="M5 12h2" strokeLinecap="round"/></svg>
const COMPANY_ICON = <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.7"><rect x="1" y="4" width="14" height="10" rx="1.5"/><path d="M5 4V3a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v1" strokeLinecap="round"/><path d="M1 8h14" strokeLinecap="round"/></svg>
const EVAL_ICON = <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.7"><circle cx="8" cy="5.5" r="2.5"/><path d="M2 14c0-3.3 2.7-6 6-6s6 2.7 6 6" strokeLinecap="round"/><path d="M10.5 8.5l1 1 2-2" strokeLinecap="round" strokeLinejoin="round"/></svg>
const METRICS_ICON = <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.7"><polyline points="1 12 5 7 8 10 11 5 15 8" strokeLinecap="round" strokeLinejoin="round"/><path d="M1 14h14" strokeLinecap="round"/></svg>

function Sidebar({ projects, activeFilter, onFilterChange, connected }) {
  const { signOut, userProfile, refreshProfile } = useAuth()
  const [menuOpen, setMenuOpen] = useState(false)
  const avatarInputRef = useRef(null)
  const menuRef = useRef(null)

  async function handleAvatarUploaded(url) {
    if (!userProfile?.user_id) return
    await supabase.from('users').update({ avatar_url: url }).eq('user_id', userProfile.user_id)
    await refreshProfile()
  }

  useEffect(() => {
    if (!menuOpen) return
    function handleClick(e) {
      if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [menuOpen])
  const isITAdmin = userProfile?.department_id === 0 && (userProfile?.access_level >= 3 || userProfile?.admin === true)
  const canAnalytics = userProfile?.access_level >= 3 || userProfile?.admin === true
  const location = useLocation()
  const navigate = useNavigate()
  const hasProjects = projects != null
  const projectList = projects ?? []

  const counts = {
    all:           projectList.length,
    'En proceso':  projectList.filter(p => p.status === 'En proceso').length,
    'Pendiente':   projectList.filter(p => p.status === 'Pendiente').length,
    'Completado':  projectList.filter(p => p.status === 'Completado').length,
  }

  const deptCounts = {}
  DEPARTMENTS.forEach(d => {
    deptCounts[d] = projectList.filter(p =>
      (p.departments ?? (p.department ? [p.department] : [])).includes(d)
    ).length
  })

  const hasDepts = DEPARTMENTS.some(d => deptCounts[d] > 0)
  const isProjectsRoute = location.pathname === '/'
  const [projectsOpen, setProjectsOpen] = useState(isProjectsRoute)
  const isTicketsRoute = location.pathname.startsWith('/tickets')
  const ticketsActive = location.pathname === '/tickets'
  const analyticsActive = location.pathname === '/tickets/analytics'
  const notifActive = location.pathname === '/tickets/notificaciones'
  const [ticketsOpen, setTicketsOpen] = useState(isTicketsRoute || isITAdmin)

  const isAdsRoute = location.pathname.startsWith('/ads')
  const adsActive = location.pathname === '/ads'
  const [adsOpen, setAdsOpen] = useState(isAdsRoute)

  const isTareasRoute = location.pathname.startsWith('/tareas')
  const tareasActive = location.pathname === '/tareas'
  const [tareasOpen, setTareasOpen] = useState(isTareasRoute)

  const isEmpresaRoute = location.pathname.startsWith('/empresa')
  const empresaActive = location.pathname === '/empresa'
  const empresaDeptActive = location.pathname === '/empresa/departamentos'
  const empresaEmpActive = location.pathname === '/empresa/empleados'
  const empresaPregActive = location.pathname === '/empresa/preguntas'
  const empresaCliActive  = location.pathname === '/empresa/clientes'
  const empresaLinActive  = location.pathname === '/empresa/lineas'
  const [empresaOpen, setEmpresaOpen] = useState(isEmpresaRoute)

  const canEval = userProfile?.access_level >= 2 || userProfile?.admin === true
  const isMetricasRoute = location.pathname.startsWith('/metricas')
  const metricasDashActive = location.pathname === '/metricas'
  const [metricasOpen, setMetricasOpen] = useState(isMetricasRoute)
  const isEvalRoute = location.pathname.startsWith('/evaluaciones')
  const evalActive = location.pathname === '/evaluaciones'
  const evalResumenActive = location.pathname === '/evaluaciones/resumen'
  const evalPerfilActive = location.pathname === '/evaluaciones/perfil'
  const [evalOpen, setEvalOpen] = useState(isEvalRoute)

  return (
    <aside className="w-[260px] flex-shrink-0 bg-white border-r border-[#e0ddd4] flex flex-col h-full">

      {/* Brand */}
      <div className="px-5 pt-6 pb-5 border-b border-[#ece9df]">
        <MDNLogo size={72} />
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-4 overflow-y-auto">

        <p className="text-[12px] font-mono font-bold tracking-[0.16em] uppercase text-[#888] px-2 mb-2">
          Herramientas
        </p>
        <div className="space-y-0.5">
          {/* Proyectos — menú desplegable */}
          <button
            onClick={() => setProjectsOpen(o => !o)}
            className={`flex items-center gap-2.5 w-full px-3 py-2 rounded-lg text-[15px] font-medium transition-all text-left ${
              isProjectsRoute && !projectsOpen
                ? 'bg-[#FFB800] text-[#111]'
                : isProjectsRoute
                  ? 'text-[#111] bg-[#f5f3eb]'
                  : 'text-[#444] hover:bg-[#f5f3eb] hover:text-[#111]'
            }`}
          >
            <span className={`flex-shrink-0 ${isProjectsRoute ? 'text-[#111]' : 'text-[#666]'}`}>
              {PROJECTS_ICON}
            </span>
            <span className="flex-1">Proyectos</span>
            <svg
              width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.8"
              className={`flex-shrink-0 transition-transform duration-200 ${projectsOpen ? 'rotate-180' : ''}`}
            >
              <path d="M2 3.5l3 3 3-3" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>

          {projectsOpen && (
            <div className="ml-3 pl-3 border-l-2 border-[#ece9df] space-y-0.5 mt-0.5">
              {VIEWS.map(view => {
                const active = isProjectsRoute && activeFilter === view.key
                return (
                  <button
                    key={view.key}
                    onClick={() => { onFilterChange(view.key); if (!isProjectsRoute) navigate('/') }}
                    className={`flex items-center gap-2.5 w-full px-3 py-1.5 rounded-lg text-[14.5px] font-medium transition-all text-left ${
                      active
                        ? 'bg-[#FFB800] text-[#111]'
                        : 'text-[#444] hover:bg-[#f5f3eb] hover:text-[#111]'
                    }`}
                  >
                    <span className={`flex-shrink-0 ${active ? 'text-[#111]' : 'text-[#666]'}`}>
                      {VIEW_ICONS[view.key]}
                    </span>
                    <span className="flex-1">{view.label}</span>
                    <span className={`text-[13px] font-mono font-bold min-w-[22px] text-center px-1.5 py-0.5 rounded-md ${
                      active ? 'bg-black/12 text-[#111]' : 'bg-[#f0ede3] text-[#555]'
                    }`}>
                      {counts[view.key] ?? 0}
                    </span>
                  </button>
                )
              })}

              {hasDepts && (
                <>
                  <p className="text-[12px] font-mono font-bold tracking-[0.14em] uppercase text-[#aaa] px-3 pt-2 pb-1">
                    Departamentos
                  </p>
                  {DEPARTMENTS.filter(d => deptCounts[d] > 0).map(dept => {
                    const key = `dept:${dept}`
                    const active = isProjectsRoute && activeFilter === key
                    return (
                      <button
                        key={dept}
                        onClick={() => { onFilterChange(key); if (!isProjectsRoute) navigate('/') }}
                        className={`flex items-center gap-2.5 w-full px-3 py-1.5 rounded-lg text-[14.5px] font-medium transition-all text-left ${
                          active
                            ? 'bg-[#FFB800] text-[#111]'
                            : 'text-[#444] hover:bg-[#f5f3eb] hover:text-[#111]'
                        }`}
                      >
                        <span className={`w-2 h-2 rounded-full flex-shrink-0 ${active ? 'bg-[#111]' : 'bg-[#bbb]'}`} />
                        <span className="flex-1">{dept}</span>
                        <span className={`text-[13px] font-mono font-bold min-w-[22px] text-center px-1.5 py-0.5 rounded-md ${
                          active ? 'bg-black/12 text-[#111]' : 'bg-[#f0ede3] text-[#555]'
                        }`}>
                          {deptCounts[dept]}
                        </span>
                      </button>
                    )
                  })}
                </>
              )}
            </div>
          )}

          {/* Soporte técnico — menú desplegable */}
          <button
            onClick={() => setTicketsOpen(o => !o)}
            className={`flex items-center gap-2.5 w-full px-3 py-2 rounded-lg text-[15px] font-medium transition-all text-left ${
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
            <span className="flex-1">Soporte Técnico</span>
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
                className={`flex items-center gap-2.5 w-full px-3 py-1.5 rounded-lg text-[14.5px] font-medium transition-all text-left ${
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
                  className={`flex items-center gap-2.5 w-full px-3 py-1.5 rounded-lg text-[14.5px] font-medium transition-all text-left ${
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
                  className={`flex items-center gap-2.5 w-full px-3 py-1.5 rounded-lg text-[14.5px] font-medium transition-all text-left ${
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
            className={`flex items-center gap-2.5 w-full px-3 py-2 rounded-lg text-[15px] font-medium transition-all text-left ${
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
                className={`flex items-center gap-2.5 w-full px-3 py-1.5 rounded-lg text-[14.5px] font-medium transition-all text-left ${
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
          {/* Gestión de Tareas — menú desplegable */}
          <button
            onClick={() => setTareasOpen(o => !o)}
            className={`flex items-center gap-2.5 w-full px-3 py-2 rounded-lg text-[15px] font-medium transition-all text-left ${
              isTareasRoute && !tareasOpen
                ? 'bg-[#FFB800] text-[#111]'
                : isTareasRoute
                  ? 'text-[#111] bg-[#f5f3eb]'
                  : 'text-[#444] hover:bg-[#f5f3eb] hover:text-[#111]'
            }`}
          >
            <span className={`flex-shrink-0 ${isTareasRoute ? 'text-[#111]' : 'text-[#666]'}`}>
              {TASKS_ICON}
            </span>
            <span className="flex-1">Tareas QC / Cierre</span>
            <svg
              width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.8"
              className={`flex-shrink-0 transition-transform duration-200 ${tareasOpen ? 'rotate-180' : ''}`}
            >
              <path d="M2 3.5l3 3 3-3" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>

          {tareasOpen && (
            <div className="ml-3 pl-3 border-l-2 border-[#ece9df] space-y-0.5 mt-0.5">
              <Link
                to="/tareas"
                className={`flex items-center gap-2.5 w-full px-3 py-1.5 rounded-lg text-[14.5px] font-medium transition-all text-left ${
                  tareasActive
                    ? 'bg-[#FFB800] text-[#111]'
                    : 'text-[#444] hover:bg-[#f5f3eb] hover:text-[#111]'
                }`}
              >
                <span className={`flex-shrink-0 ${tareasActive ? 'text-[#111]' : 'text-[#666]'}`}>
                  {TASKS_ICON}
                </span>
                <span className="flex-1">Gestión de Tareas</span>
              </Link>
            </div>
          )}

          {/* Empresa — visible a todos */}
          <button
            onClick={() => setEmpresaOpen(o => !o)}
            className={`flex items-center gap-2.5 w-full px-3 py-2 rounded-lg text-[15px] font-medium transition-all text-left ${
              isEmpresaRoute && !empresaOpen
                ? 'bg-[#FFB800] text-[#111]'
                : isEmpresaRoute
                  ? 'text-[#111] bg-[#f5f3eb]'
                  : 'text-[#444] hover:bg-[#f5f3eb] hover:text-[#111]'
            }`}
          >
            <span className={`flex-shrink-0 ${isEmpresaRoute ? 'text-[#111]' : 'text-[#666]'}`}>
              {COMPANY_ICON}
            </span>
            <span className="flex-1">Empresa</span>
            <svg
              width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.8"
              className={`flex-shrink-0 transition-transform duration-200 ${empresaOpen ? 'rotate-180' : ''}`}
            >
              <path d="M2 3.5l3 3 3-3" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>

          {empresaOpen && (
            <div className="ml-3 pl-3 border-l-2 border-[#ece9df] space-y-0.5 mt-0.5">
              <Link
                to="/empresa"
                className={`flex items-center gap-2.5 w-full px-3 py-1.5 rounded-lg text-[14.5px] font-medium transition-all text-left ${
                  empresaActive
                    ? 'bg-[#FFB800] text-[#111]'
                    : 'text-[#444] hover:bg-[#f5f3eb] hover:text-[#111]'
                }`}
              >
                <span className={`flex-shrink-0 ${empresaActive ? 'text-[#111]' : 'text-[#666]'}`}>
                  {COMPANY_ICON}
                </span>
                <span className="flex-1">Inicio</span>
              </Link>
              {userProfile?.admin === true && (
                <>
                  <Link
                    to="/empresa/departamentos"
                    className={`flex items-center gap-2.5 w-full px-3 py-1.5 rounded-lg text-[14.5px] font-medium transition-all text-left ${
                      empresaDeptActive
                        ? 'bg-[#FFB800] text-[#111]'
                        : 'text-[#444] hover:bg-[#f5f3eb] hover:text-[#111]'
                    }`}
                  >
                    <span className={`flex-shrink-0 ${empresaDeptActive ? 'text-[#111]' : 'text-[#666]'}`}>
                      <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.7"><rect x="1" y="1" width="6" height="6" rx="1.5"/><rect x="9" y="1" width="6" height="6" rx="1.5"/><rect x="1" y="9" width="6" height="6" rx="1.5"/><rect x="9" y="9" width="6" height="6" rx="1.5"/></svg>
                    </span>
                    <span className="flex-1">Departamentos</span>
                  </Link>
                  <Link
                    to="/empresa/empleados"
                    className={`flex items-center gap-2.5 w-full px-3 py-1.5 rounded-lg text-[14.5px] font-medium transition-all text-left ${
                      empresaEmpActive
                        ? 'bg-[#FFB800] text-[#111]'
                        : 'text-[#444] hover:bg-[#f5f3eb] hover:text-[#111]'
                    }`}
                  >
                    <span className={`flex-shrink-0 ${empresaEmpActive ? 'text-[#111]' : 'text-[#666]'}`}>
                      <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.7"><circle cx="6" cy="5" r="3"/><path d="M1 14c0-3.3 2.7-5 5-5" strokeLinecap="round"/><circle cx="12" cy="9" r="2"/><path d="M9.5 14c0-1.9 1.1-3 2.5-3s2.5 1.1 2.5 3" strokeLinecap="round"/></svg>
                    </span>
                    <span className="flex-1">Empleados</span>
                  </Link>
                  <Link
                    to="/empresa/preguntas"
                    className={`flex items-center gap-2.5 w-full px-3 py-1.5 rounded-lg text-[14.5px] font-medium transition-all text-left ${
                      empresaPregActive
                        ? 'bg-[#FFB800] text-[#111]'
                        : 'text-[#444] hover:bg-[#f5f3eb] hover:text-[#111]'
                    }`}
                  >
                    <span className={`flex-shrink-0 ${empresaPregActive ? 'text-[#111]' : 'text-[#666]'}`}>
                      <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.7"><circle cx="8" cy="8" r="6.5"/><path d="M8 5.5a1.5 1.5 0 0 1 1.5 1.5c0 .8-.6 1.3-1.2 1.7C7.7 9.1 7.5 9.5 7.5 10" strokeLinecap="round"/><circle cx="8" cy="12" r=".6" fill="currentColor" stroke="none"/></svg>
                    </span>
                    <span className="flex-1">Preguntas</span>
                  </Link>
                </>
              )}
              {/* Clientes — visible a managers y admins */}
              {canEval && (
                <>
                  <Link
                    to="/empresa/clientes"
                    className={`flex items-center gap-2.5 w-full px-3 py-1.5 rounded-lg text-[14.5px] font-medium transition-all text-left ${
                      empresaCliActive
                        ? 'bg-[#FFB800] text-[#111]'
                        : 'text-[#444] hover:bg-[#f5f3eb] hover:text-[#111]'
                    }`}
                  >
                    <span className={`flex-shrink-0 ${empresaCliActive ? 'text-[#111]' : 'text-[#666]'}`}>
                      <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.7"><path d="M2 13c0-3 1.8-5 5-5s5 2 5 5"/><circle cx="7" cy="5" r="3"/><path d="M11.5 8.5c1.5.5 2.5 2 2.5 4" strokeLinecap="round"/><circle cx="11.5" cy="3.5" r="2"/></svg>
                    </span>
                    <span className="flex-1">Clientes</span>
                  </Link>
                  <Link
                    to="/empresa/lineas"
                    className={`flex items-center gap-2.5 w-full px-3 py-1.5 rounded-lg text-[14.5px] font-medium transition-all text-left ${
                      empresaLinActive
                        ? 'bg-[#FFB800] text-[#111]'
                        : 'text-[#444] hover:bg-[#f5f3eb] hover:text-[#111]'
                    }`}
                  >
                    <span className={`flex-shrink-0 ${empresaLinActive ? 'text-[#111]' : 'text-[#666]'}`}>
                      <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.7"><rect x="1" y="5" width="5" height="6" rx="1.5"/><rect x="10" y="5" width="5" height="6" rx="1.5"/><path d="M6 8h4" strokeLinecap="round"/></svg>
                    </span>
                    <span className="flex-1">Líneas</span>
                  </Link>
                </>
              )}
            </div>
          )}

          {/* Evaluaciones — visible a todos los usuarios logueados */}
          <>
            <button
              onClick={() => setEvalOpen(o => !o)}
              className={`flex items-center gap-2.5 w-full px-3 py-2 rounded-lg text-[15px] font-medium transition-all text-left ${
                isEvalRoute && !evalOpen
                  ? 'bg-[#FFB800] text-[#111]'
                  : isEvalRoute
                    ? 'text-[#111] bg-[#f5f3eb]'
                    : 'text-[#444] hover:bg-[#f5f3eb] hover:text-[#111]'
              }`}
            >
              <span className={`flex-shrink-0 ${isEvalRoute ? 'text-[#111]' : 'text-[#666]'}`}>
                {EVAL_ICON}
              </span>
              <span className="flex-1">Evaluaciones</span>
              <svg
                width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.8"
                className={`flex-shrink-0 transition-transform duration-200 ${evalOpen ? 'rotate-180' : ''}`}
              >
                <path d="M2 3.5l3 3 3-3" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </button>

            {evalOpen && (
              <div className="ml-3 pl-3 border-l-2 border-[#ece9df] space-y-0.5 mt-0.5">
                {/* Mi Perfil — visible a todos */}
                <Link
                  to="/evaluaciones/perfil"
                  className={`flex items-center gap-2.5 w-full px-3 py-1.5 rounded-lg text-[14.5px] font-medium transition-all text-left ${
                    evalPerfilActive
                      ? 'bg-[#FFB800] text-[#111]'
                      : 'text-[#444] hover:bg-[#f5f3eb] hover:text-[#111]'
                  }`}
                >
                  <span className={`flex-shrink-0 ${evalPerfilActive ? 'text-[#111]' : 'text-[#666]'}`}>
                    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.7">
                      <circle cx="8" cy="5.5" r="2.5"/>
                      <path d="M2 14c0-3.3 2.7-6 6-6s6 2.7 6 6" strokeLinecap="round"/>
                    </svg>
                  </span>
                  <span className="flex-1">Mi Perfil</span>
                </Link>

                {/* Empleados y Resumen — solo para managers/admins */}
                {canEval && (
                  <>
                    <Link
                      to="/evaluaciones"
                      className={`flex items-center gap-2.5 w-full px-3 py-1.5 rounded-lg text-[14.5px] font-medium transition-all text-left ${
                        evalActive
                          ? 'bg-[#FFB800] text-[#111]'
                          : 'text-[#444] hover:bg-[#f5f3eb] hover:text-[#111]'
                      }`}
                    >
                      <span className={`flex-shrink-0 ${evalActive ? 'text-[#111]' : 'text-[#666]'}`}>
                        {EVAL_ICON}
                      </span>
                      <span className="flex-1">Empleados</span>
                    </Link>
                    <Link
                      to="/evaluaciones/resumen"
                      className={`flex items-center gap-2.5 w-full px-3 py-1.5 rounded-lg text-[14.5px] font-medium transition-all text-left ${
                        evalResumenActive
                          ? 'bg-[#FFB800] text-[#111]'
                          : 'text-[#444] hover:bg-[#f5f3eb] hover:text-[#111]'
                      }`}
                    >
                      <span className={`flex-shrink-0 ${evalResumenActive ? 'text-[#111]' : 'text-[#666]'}`}>
                        {CHART_ICON}
                      </span>
                      <span className="flex-1">Resumen</span>
                    </Link>
                  </>
                )}
              </div>
            )}
          </>

          {/* Métricas — visible a managers/admins */}
          {canEval && (
            <>
              <button
                onClick={() => setMetricasOpen(o => !o)}
                className={`flex items-center gap-2.5 w-full px-3 py-2 rounded-lg text-[15px] font-medium transition-all text-left ${
                  isMetricasRoute && !metricasOpen
                    ? 'bg-[#FFB800] text-[#111]'
                    : isMetricasRoute
                      ? 'text-[#111] bg-[#f5f3eb]'
                      : 'text-[#444] hover:bg-[#f5f3eb] hover:text-[#111]'
                }`}
              >
                <span className={`flex-shrink-0 ${isMetricasRoute ? 'text-[#111]' : 'text-[#666]'}`}>
                  {METRICS_ICON}
                </span>
                <span className="flex-1">Métricas</span>
                <svg
                  width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.8"
                  className={`flex-shrink-0 transition-transform duration-200 ${metricasOpen ? 'rotate-180' : ''}`}
                >
                  <path d="M2 3.5l3 3 3-3" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </button>

              {metricasOpen && (
                <div className="ml-3 pl-3 border-l-2 border-[#ece9df] space-y-0.5 mt-0.5">
                  <Link
                    to="/metricas"
                    className={`flex items-center gap-2.5 w-full px-3 py-1.5 rounded-lg text-[14.5px] font-medium transition-all text-left ${
                      metricasDashActive
                        ? 'bg-[#FFB800] text-[#111]'
                        : 'text-[#444] hover:bg-[#f5f3eb] hover:text-[#111]'
                    }`}
                  >
                    <span className={`flex-shrink-0 ${metricasDashActive ? 'text-[#111]' : 'text-[#666]'}`}>
                      {METRICS_ICON}
                    </span>
                    <span className="flex-1">Dashboard General</span>
                  </Link>
                </div>
              )}
            </>
          )}
        </div>
      </nav>

      {/* User menu */}
      <div className="px-4 pb-5 pt-3 border-t border-[#ece9df] relative" ref={menuRef}>
        <div className="flex items-center gap-2.5">
          {/* Avatar */}
          {userProfile?.avatar_url ? (
            <img
              src={userProfile.avatar_url}
              alt=""
              className="w-9 h-9 rounded-full object-cover flex-shrink-0 border border-[#e0ddd4]"
            />
          ) : (
            <div className="w-9 h-9 rounded-full flex-shrink-0 bg-[#FFB800] flex items-center justify-center">
              <span className="text-[15px] font-bold text-[#111]">
                {((userProfile?.first_name?.[0] ?? '') + (userProfile?.last_name?.[0] ?? '')).toUpperCase() || '?'}
              </span>
            </div>
          )}

          {/* Info */}
          <div className="flex-1 min-w-0">
            <p className="text-[15px] font-semibold text-[#111] truncate leading-snug">
              {userProfile ? `${userProfile.first_name} ${userProfile.last_name}` : '—'}
            </p>
            <p className="text-[13px] text-[#888] truncate leading-snug">
              {userProfile?.email ?? ''}
            </p>
            {(userProfile?.department?.department_name || userProfile?.position?.position_name) && (
              <p className="text-[12.5px] font-mono text-[#666] truncate leading-snug mt-0.5">
                {[userProfile.department?.department_name, userProfile.position?.position_name].filter(Boolean).join(' · ')}
              </p>
            )}
          </div>

          {/* 3-dot trigger */}
          <button
            onClick={() => setMenuOpen(o => !o)}
            aria-label="Opciones de usuario"
            className="flex-shrink-0 w-7 h-7 flex items-center justify-center rounded-lg text-[#999] hover:text-[#111] hover:bg-[#f0ede3] transition-colors"
          >
            <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
              <circle cx="8" cy="3" r="1.4"/>
              <circle cx="8" cy="8" r="1.4"/>
              <circle cx="8" cy="13" r="1.4"/>
            </svg>
          </button>
        </div>

        {/* Popover */}
        {menuOpen && (
          <div className="absolute bottom-full left-4 right-4 mb-2 bg-white border border-[#e0ddd4] rounded-xl shadow-lg overflow-hidden">
            <button
              onClick={() => { setMenuOpen(false); avatarInputRef.current?.click() }}
              className="w-full flex items-center gap-2.5 px-4 py-3 text-[15px] font-medium text-[#444] hover:bg-[#f5f3eb] hover:text-[#111] transition-colors text-left"
            >
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.7">
                <circle cx="8" cy="6" r="3.5"/>
                <path d="M1.5 14c0-3.6 2.9-6.5 6.5-6.5s6.5 2.9 6.5 6.5" strokeLinecap="round"/>
              </svg>
              Cambiar foto
            </button>
            <button
              onClick={() => { setMenuOpen(false); signOut() }}
              className="w-full flex items-center gap-2.5 px-4 py-3 text-[15px] font-medium text-[#444] hover:bg-[#f5f3eb] hover:text-[#111] transition-colors text-left"
            >
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.7">
                <path d="M6 2H3a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3M11 11l3-3-3-3M14 8H6" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              Cerrar sesión
            </button>
          </div>
        )}

        {/* AvatarUpload del usuario propio (trigger oculto; el botón "Cambiar foto" dispara avatarInputRef) */}
        {userProfile && (
          <AvatarUpload
            user={userProfile}
            onUploaded={handleAvatarUploaded}
            size={0}
            label=""
            triggerRef={avatarInputRef}
          />
        )}
      </div>
    </aside>
  )
}

export default Sidebar
