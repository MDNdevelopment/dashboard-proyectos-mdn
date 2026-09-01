import { useState, useEffect, Fragment } from 'react'
import { useOutletContext, useNavigate, Link } from 'react-router-dom'
import { startOfWeek, endOfWeek, format } from 'date-fns'
import { es } from 'date-fns/locale'
import { supabase } from '../supabase'
import { useAuth } from '../context/AuthContext'
import { MODULES } from '../config/modules'
import { isLate, isClosed } from '../components/tareas/constants'
import KpiCard from '../components/common/KpiCard'
import {
  loadLines,
  loadYearReports,
  loadClients,
  loadCompanyEmployees,
  loadCompanyUsers,
} from '../components/metricas/metricsApi'
import { loadMeetings } from '../components/reuniones/meetingsApi'
import { activeEmployees } from '../lib/employees'
import { calcTotal, sumScore, monthLineScore } from '../utils/metricsScore'
import { calcFinanzas } from '../utils/metricsFinance'
import { aggregateMetricsDashboard } from '../utils/aggregateMetricsDashboard'
import { scoreDialColor } from '../components/metricas/ScoreDial'
import { MONTHS } from '../components/metricas/constants'
import { visibleLinesForUser } from '../utils/lineMembers'
import { canSeeCeoAnalysis } from '../lib/ceoAnalysisAccess'
import CeoAnalysisCard from '../components/home/CeoAnalysisCard'
import HomeDatesCalendar from '../components/home/HomeDatesCalendar'
import HomeDayEventsModal from '../components/home/HomeDayEventsModal'
import { buildHomeCalendarEvents } from '../utils/homeCalendar'

// Íconos simples reutilizados por los accesos rápidos (mismo estilo que Sidebar).
// Oculto temporalmente hasta nuevo aviso (solicitado por el usuario)
const SHOW_CEO_ANALYSIS = false

const MODULE_ICON = {
  proyectos: (
    <svg
      width="18"
      height="18"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
    >
      <rect x="1" y="1" width="6" height="6" rx="1.5" />
      <rect x="9" y="1" width="6" height="6" rx="1.5" />
      <rect x="1" y="9" width="6" height="6" rx="1.5" />
      <rect x="9" y="9" width="6" height="6" rx="1.5" />
    </svg>
  ),
  tickets: (
    <svg
      width="18"
      height="18"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
    >
      <rect x="1" y="3" width="14" height="10" rx="1.5" />
      <path d="M1 6h14" strokeLinecap="round" />
    </svg>
  ),
  ads: (
    <svg
      width="18"
      height="18"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
    >
      <path d="M2 11V5l6-3 6 3v6l-6 3-6-3Z" strokeLinejoin="round" />
    </svg>
  ),
  tareas: (
    <svg
      width="18"
      height="18"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
    >
      <rect x="1.5" y="2" width="13" height="12" rx="1.5" />
      <path d="M5 6h6M5 9h4" strokeLinecap="round" />
    </svg>
  ),
  empresa: (
    <svg
      width="18"
      height="18"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
    >
      <rect x="1" y="4" width="14" height="10" rx="1.5" />
      <path d="M1 8h14" strokeLinecap="round" />
    </svg>
  ),
  evaluaciones: (
    <svg
      width="18"
      height="18"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
    >
      <circle cx="8" cy="5.5" r="2.5" />
      <path d="M2 14c0-3.3 2.7-6 6-6s6 2.7 6 6" strokeLinecap="round" />
    </svg>
  ),
  reportes: (
    <svg
      width="18"
      height="18"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
    >
      <polyline points="1 12 5 7 8 10 11 5 15 8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
}

const ICON_ASSIGNED = (
  <svg
    width="16"
    height="16"
    viewBox="0 0 16 16"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.7"
  >
    <rect x="3" y="2" width="10" height="12" rx="1.5" />
    <path d="M6 1.5h4v1.5H6z" />
    <path d="M5.5 8.5l1.5 1.5 3-3.5" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
)
const ICON_LATE = (
  <svg
    width="16"
    height="16"
    viewBox="0 0 16 16"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.7"
  >
    <circle cx="8" cy="9" r="5.5" />
    <path d="M8 6.5V9l2 1.2" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M5.5 1.5h5M3 3l1-1M13 3l-1-1" strokeLinecap="round" />
  </svg>
)
const ICON_SUPPORT = (
  <svg
    width="16"
    height="16"
    viewBox="0 0 16 16"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.7"
  >
    <path
      d="M8 1.5s3 1.2 5 .8v4.6c0 3-2.2 5.2-5 6.1-2.8-.9-5-3.1-5-6.1V2.3c2 .4 5-.8 5-.8Z"
      strokeLinejoin="round"
    />
    <path d="M5.7 8l1.6 1.6 3-3.4" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
)
const ICON_COMPANY_TASKS = (
  <svg
    width="16"
    height="16"
    viewBox="0 0 16 16"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.7"
  >
    <rect x="1.5" y="2" width="13" height="12" rx="1.5" />
    <path d="M5 6h6M5 9h4M5 12h2" strokeLinecap="round" />
  </svg>
)
const ICON_REPORTS = (
  <svg
    width="16"
    height="16"
    viewBox="0 0 16 16"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.7"
  >
    <polyline points="1.5 12.5 5.5 7 8.5 10 14.5 3" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M1.5 14.5h13" strokeLinecap="round" />
  </svg>
)
const ICON_CLIENTS = (
  <svg
    width="16"
    height="16"
    viewBox="0 0 16 16"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.7"
  >
    <rect x="2" y="6" width="12" height="8" rx="1.5" />
    <path
      d="M6 6V4.5a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1V6"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <path d="M2 9.5h12" strokeLinecap="round" />
  </svg>
)
const ICON_EMPLOYEES = (
  <svg
    width="16"
    height="16"
    viewBox="0 0 16 16"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.7"
  >
    <circle cx="8" cy="5" r="2.5" />
    <path d="M3 14c0-2.8 2.2-5 5-5s5 2.2 5 5" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
)
const ICON_LINES = (
  <svg
    width="16"
    height="16"
    viewBox="0 0 16 16"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.7"
  >
    <path d="M2 4h7M2 8h10M2 12h5" strokeLinecap="round" />
  </svg>
)

const ICON_CALENDAR = (
  <svg
    width="13"
    height="13"
    viewBox="0 0 16 16"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.6"
    className="flex-shrink-0"
  >
    <rect x="1.5" y="2.5" width="13" height="12" rx="1.5" />
    <path d="M1.5 6h13" strokeLinecap="round" />
    <path d="M5 1v3M11 1v3" strokeLinecap="round" />
  </svg>
)
const ICON_VIDEO = (
  <svg
    width="13"
    height="13"
    viewBox="0 0 16 16"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.6"
    className="flex-shrink-0"
  >
    <rect x="1.5" y="4" width="9" height="8" rx="1.5" />
    <path d="M10.5 6.5 14.5 4v8l-4-2.5" strokeLinejoin="round" />
  </svg>
)
const ICON_LOCATION = (
  <svg
    width="13"
    height="13"
    viewBox="0 0 16 16"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.6"
    className="flex-shrink-0"
  >
    <path d="M8 14.5S13 9.8 13 6.3a5 5 0 1 0-10 0c0 3.5 5 8.2 5 8.2Z" strokeLinejoin="round" />
    <circle cx="8" cy="6.2" r="1.8" />
  </svg>
)

function attendeeFullName(u) {
  return `${u?.first_name ?? ''} ${u?.last_name ?? ''}`.trim()
}
function attendeeInitials(u) {
  return `${u?.first_name?.[0] ?? ''}${u?.last_name?.[0] ?? ''}`.toUpperCase()
}

// Salud de la empresa: se muestra el mes cerrado más reciente (el anterior al actual),
// igual convención que el dashboard de reportes (DashboardView.jsx).
const HEALTH_CURRENT_MONTH = new Date().getMonth() + 1
const HEALTH_PREV_MONTH = HEALTH_CURRENT_MONTH === 1 ? 12 : HEALTH_CURRENT_MONTH - 1
const HEALTH_YEAR =
  HEALTH_CURRENT_MONTH === 1 ? new Date().getFullYear() - 1 : new Date().getFullYear()

function timeGreeting() {
  const h = new Date().getHours()
  if (h < 12) return 'Buenos días'
  if (h < 19) return 'Buenas tardes'
  return 'Buenas noches'
}

export default function HomePage() {
  const { userProfile, can = () => true } = useAuth()
  const navigate = useNavigate()
  // Proyectos ya vive en el estado de AppLayout — se reutiliza en vez de re-fetchear.
  const outlet = useOutletContext() ?? {}
  const projects = outlet.projects ?? []

  const [tasks, setTasks] = useState([])
  const [loadingTasks, setLoadingTasks] = useState(true)
  const [companyCounts, setCompanyCounts] = useState({ empleados: null })
  const [lines, setLines] = useState([])
  const [metricReports, setMetricReports] = useState([])
  const [clients, setClients] = useState([])
  const [meetings, setMeetings] = useState([])
  const [loadingMeetings, setLoadingMeetings] = useState(true)
  // Empleados de la empresa. Se usan para el nombre/avatar de "Mis reuniones" y para
  // derivar los cumpleaños/aniversarios de hoy del bloque "Fechas del equipo y clientes".
  const [companyEmployees, setCompanyEmployees] = useState([])
  // Set de user_id activos (no archivados) de la empresa — usado para excluir
  // empleados dados de baja de los conteos (KPI de empresa y de línea).
  const [activeEmployeeIds, setActiveEmployeeIds] = useState(null)
  // Mes visible y día seleccionado del calendario "Fechas del equipo y clientes"
  // (mismo patrón de estado que EmployeesView.jsx para su calendario).
  const [calMonth, setCalMonth] = useState(() => {
    const now = new Date()
    return { year: now.getFullYear(), month: now.getMonth() + 1 }
  })
  const [calDay, setCalDay] = useState(null)

  const isDirector = userProfile?.access_level >= 4 || userProfile?.admin === true
  // A nivel 4 no se le asignan tareas directamente, solo se le pone como apoyo de dirección.
  const isLevel4 = userProfile?.access_level >= 4
  // Nivel 3 no-admin: lidera una línea, ve tareas y salud de su línea (pero no el resumen de empresa).
  const isLineLead = userProfile?.access_level === 3 && !isDirector
  const showTareas = can('tareas')
  const showReportes = can('reportes')
  const showEmpresa = can('empresa')
  const showEmpresaClientes = can('empresa.clientes')
  const showEmpresaEmpleados = can('empresa.empleados')
  const showEmpresaLineas = can('empresa.lineas')
  const showReuniones = can('reuniones')

  useEffect(() => {
    if (!userProfile?.company_id || !showTareas) {
      setLoadingTasks(false)
      return
    }
    let cancelled = false
    supabase
      .from('tasks')
      .select('*')
      .eq('company_id', userProfile.company_id)
      .then(({ data, error }) => {
        if (cancelled) return
        setTasks(error ? [] : (data ?? []))
        setLoadingTasks(false)
      })
    return () => {
      cancelled = true
    }
  }, [userProfile?.company_id, showTareas])

  // Reuniones de la semana actual (lunes a domingo) — se filtran a "las mías" client-side,
  // mismo patrón que "Mis tareas".
  useEffect(() => {
    if (!userProfile?.company_id || !showReuniones) {
      setLoadingMeetings(false)
      return
    }
    let cancelled = false
    const now = new Date()
    const from = startOfWeek(now, { weekStartsOn: 1 })
    const to = endOfWeek(now, { weekStartsOn: 1 })
    loadMeetings(userProfile.company_id, { from, to }).then(({ data, error }) => {
      if (cancelled) return
      setMeetings(error ? [] : (data ?? []))
      setLoadingMeetings(false)
    })
    return () => {
      cancelled = true
    }
  }, [userProfile?.company_id, showReuniones])

  // Empleados de la empresa — nombre/avatar de "Mis reuniones" y cumpleaños/aniversarios
  // de "Fechas del equipo y clientes". Se carga siempre (no solo con permiso de reuniones)
  // porque ese aviso lo debe ver todo el mundo.
  useEffect(() => {
    if (!userProfile?.company_id) return
    let cancelled = false
    loadCompanyEmployees(userProfile.company_id).then(({ data }) => {
      if (cancelled) return
      setCompanyEmployees(data ?? [])
    })
    return () => {
      cancelled = true
    }
  }, [userProfile?.company_id])

  useEffect(() => {
    if (!userProfile?.company_id || !(isDirector || isLineLead)) return
    let cancelled = false
    loadCompanyUsers(userProfile.company_id).then(({ data }) => {
      if (cancelled) return
      const active = activeEmployees(data ?? [])
      setActiveEmployeeIds(new Set(active.map((u) => u.user_id)))
      if (isDirector) setCompanyCounts({ empleados: active.length })
    })
    return () => {
      cancelled = true
    }
  }, [userProfile?.company_id, isDirector, isLineLead])

  // Líneas + reportes + clientes del año: los usa el director (salud/conteos de empresa), el
  // nivel 3 (salud/conteos de su línea) y "Fechas del equipo y clientes" (necesita `lines` para
  // saber de qué línea es miembro el usuario, y `clients` para sus fechas). Para nivel 3,
  // loadYearReports ya viene filtrado por RLS a los reportes de su propia línea; clientes y
  // líneas se filtran client-side por line_id. Se carga para cualquier usuario (no solo
  // director/nivel 3) porque cualquier miembro de una línea puede tener clientes con fechas.
  useEffect(() => {
    if (!userProfile?.company_id) return
    let cancelled = false
    Promise.all([
      loadLines(userProfile.company_id),
      loadYearReports(userProfile.company_id, HEALTH_YEAR),
      loadClients(userProfile.company_id),
    ]).then(([linesRes, reportsRes, clientsRes]) => {
      if (cancelled) return
      setLines(linesRes.data ?? [])
      setMetricReports(reportsRes.data ?? [])
      setClients(clientsRes.data ?? [])
    })
    return () => {
      cancelled = true
    }
  }, [userProfile?.company_id, isDirector, isLineLead])

  const myUserId = userProfile?.user_id
  const activeTasks = tasks.filter((t) => !isClosed(t))
  const myTasks = activeTasks.filter((t) => (t.assignee_ids ?? []).includes(myUserId))
  const myLateTasks = myTasks.filter(isLate)
  const mySupportTasks = activeTasks.filter((t) => t.support_id === myUserId)
  const mySupportLateTasks = mySupportTasks.filter(isLate)
  const companyLateTasks = activeTasks.filter(isLate)
  const myMeetings = meetings.filter(
    (m) => m.status === 'programada' && (m.attendee_ids ?? []).includes(myUserId),
  )

  // "Fechas del equipo y clientes": calendario del mes visible con cumpleaños/aniversario
  // del equipo MDN + aniversario empresa / cliente MDN desde / cumpleaños de contacto de
  // los clientes. Se calcula en el cliente (no depende del cron de notificaciones) a
  // partir de datos ya cargados arriba.
  const homeCalEvents = buildHomeCalendarEvents({
    employees: activeEmployees(companyEmployees),
    clients,
    lines,
    userProfile,
    year: calMonth.year,
    month: calMonth.month,
    canSeeAllClients: can('empresa.calendario.ver_todo'),
  })
  const homeCalDayEvents = calDay
    ? homeCalEvents.filter((ev) => ev.dateKey === format(calDay, 'yyyy-MM-dd'))
    : []

  const greetingName = userProfile?.first_name ?? ''
  const roleLine = [userProfile?.department?.department_name, userProfile?.position?.position_name]
    .filter(Boolean)
    .join(' · ')
  const initials =
    ((userProfile?.first_name?.[0] ?? '') + (userProfile?.last_name?.[0] ?? '')).toUpperCase() ||
    '?'

  const quickAccessModules = MODULES.filter((m) => can(m.key))

  // Salud de la empresa del mes cerrado más reciente, promediada entre todas las líneas.
  const health = lines.length
    ? aggregateMetricsDashboard(
        lines,
        metricReports,
        HEALTH_YEAR,
        calcTotal,
        sumScore,
        calcFinanzas,
        HEALTH_PREV_MONTH,
      ).promMesActual
    : null

  // Línea(s) que lidera un nivel 3: tareas activas, salud del mes cerrado, clientes y empleados de la línea.
  const myLines = isLineLead ? visibleLinesForUser(lines, userProfile) : []
  const lineSummary = myLines.map((line) => {
    const lineTasks = activeTasks.filter((t) => t.team_id === line.id)
    const lineLate = lineTasks.filter(isLate)
    const { score } = monthLineScore(
      metricReports.filter((r) => r.line_id === line.id),
      HEALTH_PREV_MONTH,
    )
    const lineClients = clients.filter((c) => c.line_id === line.id)
    // Excluye empleados archivados del conteo (activeEmployeeIds llega vacío hasta
    // que resuelve el fetch; en ese instante se muestra el total sin filtrar).
    const lineEmployees = (line.member_user_ids ?? []).filter(
      (id) => activeEmployeeIds === null || activeEmployeeIds.has(id),
    )
    return {
      line,
      count: lineTasks.length,
      late: lineLate.length,
      score,
      clientCount: lineClients.length,
      employeeCount: lineEmployees.length,
    }
  })

  return (
    <div className="main-bg min-h-screen">
      <div className="max-w-6xl mx-auto px-5 sm:px-8 py-8 sm:py-10">
        {/* Panel de bienvenida */}
        <div className="rise-in relative overflow-hidden rounded-3xl bg-[#111111] px-6 py-7 sm:px-9 sm:py-9 mb-8">
          <div
            className="absolute inset-0 opacity-[0.07]"
            style={{
              backgroundImage: 'radial-gradient(rgba(255,255,255,0.9) 1px, transparent 1px)',
              backgroundSize: '18px 18px',
            }}
            aria-hidden="true"
          />
          <div
            className="absolute -right-16 -top-20 w-64 h-64 rounded-full blur-3xl opacity-25"
            style={{ backgroundColor: '#FFB800' }}
            aria-hidden="true"
          />
          <div className="relative flex items-center gap-4">
            {userProfile?.avatar_url ? (
              <img
                src={userProfile.avatar_url}
                alt=""
                className="flex-shrink-0 w-14 h-14 rounded-full object-cover ring-4 ring-[#FFB800]/20"
              />
            ) : (
              <div className="flex-shrink-0 w-14 h-14 rounded-full bg-[#FFB800] flex items-center justify-center ring-4 ring-[#FFB800]/20">
                <span className="text-[20px] font-bold text-[#111]">{initials}</span>
              </div>
            )}
            <div className="min-w-0">
              <p className="text-[13px] font-mono font-semibold tracking-[0.12em] uppercase text-[#FFB800] mb-0.5">
                {timeGreeting()}
              </p>
              <h1 className="text-[26px] sm:text-[30px] font-bold text-white leading-tight truncate">
                Hola, {greetingName || 'de nuevo'} 👋
              </h1>
              {roleLine && <p className="text-[14px] text-[#bbb] mt-1">{roleLine}</p>}
            </div>
          </div>
        </div>

        {/* Análisis IA — oculto temporalmente hasta nuevo aviso (solicitado por el usuario) */}
        {SHOW_CEO_ANALYSIS && canSeeCeoAnalysis(userProfile) && (
          <section className="mb-8 rise-in" style={{ animationDelay: '60ms' }}>
            <CeoAnalysisCard />
          </section>
        )}

        {/* Mis tareas */}
        {showTareas && (
          <section className="mb-8 rise-in" style={{ animationDelay: '80ms' }}>
            <div className="flex items-center gap-2 mb-3">
              <span className="w-1.5 h-4 rounded-full bg-[#ccc]" aria-hidden="true" />
              <h2 className="text-[13px] font-mono font-bold tracking-[0.14em] uppercase text-[#888]">
                Mis tareas
              </h2>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {!isLevel4 && (
                <>
                  <KpiCard
                    label="Asignadas activas"
                    value={loadingTasks ? '—' : myTasks.length}
                    icon={ICON_ASSIGNED}
                    to={`/tareas?view=base&assignee=${myUserId}`}
                    linkLabel="Ver mis tareas"
                  />
                  <KpiCard
                    label="Atrasadas"
                    value={loadingTasks ? '—' : myLateTasks.length}
                    accent={myLateTasks.length > 0 ? '#E14848' : '#111'}
                    icon={ICON_LATE}
                    iconColor={myLateTasks.length > 0 ? '#E14848' : '#FFB800'}
                    to={`/tareas?view=base&assignee=${myUserId}&fAlert=late`}
                    linkLabel="Ver atrasadas"
                  />
                </>
              )}
              {isDirector && (
                <KpiCard
                  label="Apoyo de dirección"
                  value={loadingTasks ? '—' : mySupportTasks.length}
                  sub={
                    !loadingTasks && mySupportLateTasks.length > 0
                      ? `${mySupportLateTasks.length} atrasada(s)`
                      : undefined
                  }
                  accent={mySupportLateTasks.length > 0 ? '#E14848' : '#111'}
                  icon={ICON_SUPPORT}
                  iconColor={mySupportLateTasks.length > 0 ? '#E14848' : '#FFB800'}
                  to={`/tareas?view=base&support=${myUserId}&hideDone=1`}
                  linkLabel="Ver apoyo"
                />
              )}
            </div>
          </section>
        )}

        {/* Mis reuniones */}
        {showReuniones && (
          <section className="mb-8 rise-in" style={{ animationDelay: '95ms' }}>
            <div className="flex items-center gap-2 mb-3">
              <span className="w-1.5 h-4 rounded-full bg-[#ccc]" aria-hidden="true" />
              <h2 className="text-[13px] font-mono font-bold tracking-[0.14em] uppercase text-[#888]">
                Mis reuniones de la semana
              </h2>
            </div>
            {loadingMeetings ? (
              <p className="text-[14px] text-[#888]">Cargando…</p>
            ) : myMeetings.length === 0 ? (
              <div className="bg-white border border-[#e0ddd4] rounded-2xl p-4 w-full">
                <p className="text-[14px] text-[#888]">
                  No tienes reuniones agendadas para esta semana
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                {myMeetings.map((m) => {
                  const attendees = companyEmployees.filter((u) =>
                    (m.attendee_ids ?? []).includes(u.user_id),
                  )
                  const isVideo = m.modality === 'videollamada'
                  const place = isVideo ? 'Videollamada' : m.location || 'Presencial'
                  return (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => navigate(`/reuniones?meetingId=${m.id}`)}
                      className="text-left bg-white border border-[#e0ddd4] rounded-2xl p-3 flex flex-col transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_10px_30px_-8px_rgba(0,0,0,0.14)]"
                    >
                      {/* Título: siempre presente (campo obligatorio). */}
                      <p className="text-[13.5px] font-bold text-[#111] leading-snug truncate">
                        {m.title}
                      </p>
                      {/* Cliente: slot de altura fija, invisible si no aplica, para no correr el resto del contenido. */}
                      <p
                        className={`text-[12px] text-[#888] mt-0.5 truncate ${m.client_name ? '' : 'invisible'}`}
                      >
                        {m.client_name || '—'}
                      </p>
                      <p className="flex items-center gap-1.5 text-[12px] text-[#555] font-medium capitalize mt-2">
                        {ICON_CALENDAR}
                        <span className="truncate">
                          {format(new Date(m.starts_at), 'EEE d · HH:mm', { locale: es })}
                        </span>
                      </p>
                      <p className="flex items-center gap-1.5 text-[12px] text-[#555] mt-1.5 truncate">
                        {isVideo ? ICON_VIDEO : ICON_LOCATION}
                        <span className="truncate">{place}</span>
                      </p>
                      {/* Participantes: contenedor de altura fija, vacío si no hay ninguno. */}
                      <div className="flex items-center -space-x-1.5 mt-2.5 h-6">
                        {attendees.slice(0, 4).map((u) => (
                          <span
                            key={u.user_id}
                            title={attendeeFullName(u)}
                            className="w-6 h-6 rounded-full ring-2 ring-white bg-[#eee] flex items-center justify-center text-[9px] font-bold text-[#888] overflow-hidden flex-shrink-0"
                          >
                            {u.avatar_url ? (
                              <img
                                src={u.avatar_url}
                                alt=""
                                className="w-full h-full object-cover"
                              />
                            ) : (
                              attendeeInitials(u)
                            )}
                          </span>
                        ))}
                        {attendees.length > 4 && (
                          <span className="text-[11px] text-[#888] pl-3">
                            +{attendees.length - 4}
                          </span>
                        )}
                      </div>
                    </button>
                  )
                })}
              </div>
            )}
          </section>
        )}

        {/* Mi línea — solo nivel 3 (líder de línea) */}
        {isLineLead && lineSummary.length > 0 && (
          <section className="mb-8 rise-in" style={{ animationDelay: '110ms' }}>
            <div className="flex items-center gap-2 mb-3">
              <span className="w-1.5 h-4 rounded-full bg-[#ccc]" aria-hidden="true" />
              <h2 className="text-[13px] font-mono font-bold tracking-[0.14em] uppercase text-[#888]">
                Mi línea
              </h2>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {lineSummary.map(({ line, count, late, score, clientCount, employeeCount }) => (
                <Fragment key={line.id}>
                  <KpiCard
                    label={lineSummary.length > 1 ? `Tareas · ${line.name}` : 'Tareas de mi línea'}
                    value={loadingTasks ? '—' : count}
                    sub={!loadingTasks ? `${late} atrasada(s)` : undefined}
                    accent={!loadingTasks && late > 0 ? '#E14848' : '#111'}
                    icon={ICON_COMPANY_TASKS}
                    iconColor={!loadingTasks && late > 0 ? '#E14848' : '#FFB800'}
                    to="/tareas?view=base"
                    linkLabel="Ver tareas"
                  />
                  <KpiCard
                    label={lineSummary.length > 1 ? `Salud · ${line.name}` : 'Salud de mi línea'}
                    value={score != null ? score.toFixed(1) : '—'}
                    sub={`Salud de ${MONTHS[HEALTH_PREV_MONTH - 1]} · /100`}
                    accent={score != null ? scoreDialColor(score) : '#111'}
                    icon={ICON_REPORTS}
                    {...(showReportes
                      ? { to: `/reportes/linea/${line.id}`, linkLabel: 'Ver reportes' }
                      : {})}
                  />
                  {showEmpresa && showEmpresaClientes && (
                    <KpiCard
                      label={
                        lineSummary.length > 1 ? `Clientes · ${line.name}` : 'Clientes de mi línea'
                      }
                      value={clientCount}
                      icon={ICON_CLIENTS}
                      to={`/empresa/clientes?line=${line.id}`}
                      linkLabel="Ver clientes"
                    />
                  )}
                  {showEmpresa && showEmpresaEmpleados && (
                    <KpiCard
                      label={
                        lineSummary.length > 1
                          ? `Empleados · ${line.name}`
                          : 'Empleados de mi línea'
                      }
                      value={employeeCount}
                      icon={ICON_EMPLOYEES}
                      to={`/empresa/lineas?line=${line.id}`}
                      linkLabel="Ver equipo"
                    />
                  )}
                </Fragment>
              ))}
            </div>
          </section>
        )}

        {/* Resumen general — solo nivel 4 / admin */}
        {isDirector && (
          <section className="mb-8 rise-in" style={{ animationDelay: '140ms' }}>
            <div className="flex items-center gap-2 mb-3">
              <span className="w-1.5 h-4 rounded-full bg-[#ccc]" aria-hidden="true" />
              <h2 className="text-[13px] font-mono font-bold tracking-[0.14em] uppercase text-[#888]">
                Resumen general
              </h2>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {showTareas && (
                <KpiCard
                  label="Tareas de la empresa"
                  value={loadingTasks ? '—' : activeTasks.length}
                  sub={!loadingTasks ? `${companyLateTasks.length} atrasada(s)` : undefined}
                  accent={!loadingTasks && companyLateTasks.length > 0 ? '#E14848' : '#111'}
                  icon={ICON_COMPANY_TASKS}
                  iconColor={!loadingTasks && companyLateTasks.length > 0 ? '#E14848' : '#FFB800'}
                  to="/tareas?view=base&hideDone=1"
                  linkLabel="Ver tareas"
                />
              )}
              {showReportes && (
                <KpiCard
                  label="Reportes"
                  value={health != null ? health.toFixed(1) : '—'}
                  sub={`Salud de ${MONTHS[HEALTH_PREV_MONTH - 1]} · /100`}
                  accent={health != null ? scoreDialColor(health) : '#111'}
                  icon={ICON_REPORTS}
                  to="/reportes"
                  linkLabel="Ver reportes"
                />
              )}
              {showEmpresa && showEmpresaClientes && (
                <KpiCard
                  label="Clientes activos"
                  value={clients.length || '—'}
                  icon={ICON_CLIENTS}
                  to="/empresa/clientes"
                  linkLabel="Ver clientes"
                />
              )}
              {showEmpresa && showEmpresaEmpleados && (
                <KpiCard
                  label="Empleados"
                  value={companyCounts.empleados ?? '—'}
                  icon={ICON_EMPLOYEES}
                  to="/empresa/empleados"
                  linkLabel="Ver empleados"
                />
              )}
              {showEmpresa && showEmpresaLineas && (
                <KpiCard
                  label="Líneas"
                  value={lines.length || '—'}
                  icon={ICON_LINES}
                  to="/empresa/lineas"
                  linkLabel="Ver líneas"
                />
              )}
            </div>
          </section>
        )}

        {/* Accesos rápidos */}
        <section className="rise-in" style={{ animationDelay: '200ms' }}>
          <div className="flex items-center gap-2 mb-3">
            <span className="w-1.5 h-4 rounded-full bg-[#ccc]" aria-hidden="true" />
            <h2 className="text-[13px] font-mono font-bold tracking-[0.14em] uppercase text-[#888]">
              Accesos rápidos
            </h2>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {quickAccessModules.map((m) => (
              <Link
                key={m.key}
                to={m.routePrefix}
                className="group bg-white border border-[#e0ddd4] rounded-2xl p-4 flex items-center gap-3 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_10px_30px_-8px_rgba(0,0,0,0.14)]"
              >
                <span className="flex-shrink-0 w-9 h-9 rounded-full flex items-center justify-center bg-[#FFB800]/40 text-[#111]">
                  {MODULE_ICON[m.key]}
                </span>
                <span className="text-[14.5px] font-semibold text-[#111]">{m.label}</span>
                <svg
                  className="ml-auto flex-shrink-0 text-[#ccc] opacity-0 -translate-x-1 group-hover:opacity-100 group-hover:translate-x-0 transition-all duration-200"
                  width="14"
                  height="14"
                  viewBox="0 0 16 16"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                >
                  <path d="M6 3.5 10.5 8 6 12.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </Link>
            ))}
          </div>
          {projects.length > 0 && (
            <p className="text-[13px] text-[#888] mt-3">{projects.length} proyecto(s) en total.</p>
          )}
        </section>

        {/* Fechas del equipo y clientes */}
        <div className="mt-8 rise-in" style={{ animationDelay: '220ms' }}>
          <HomeDatesCalendar
            year={calMonth.year}
            month={calMonth.month}
            events={homeCalEvents}
            onMonthChange={(year, month) => setCalMonth({ year, month })}
            onDayClick={setCalDay}
          />
        </div>
        {calDay !== null && (
          <HomeDayEventsModal
            date={calDay}
            events={homeCalDayEvents}
            onClose={() => setCalDay(null)}
          />
        )}
      </div>
    </div>
  )
}
