import { useState, useEffect, useCallback } from 'react'
import { format } from 'date-fns'
import { supabase } from '../../supabase'
import { useAuth } from '../../context/AuthContext'
import { Avatar } from '../tareas/UserPickerSingle'
import EmployeeModal from './EmployeeModal'
import VacationsDialog from './VacationsDialog'
import NewEmployeeDialog from './NewEmployeeDialog'
import EmployeeInfoModal from '../metricas/EmployeeInfoModal'
import ConfirmDeleteDialog from '../common/ConfirmDeleteDialog'
import ExternalResourcesView from './ExternalResourcesView'
import EmployeeDatesCalendar from './EmployeeDatesCalendar'
import EmployeeDayEventsModal from './EmployeeDayEventsModal'
import TeamStatusCards from './TeamStatusCards'
import VacationsPanel from './VacationsPanel'
import { activeEmployees as activeEmployeesList } from '../../lib/employees'
import { fetchVacationsInRange, fetchVacationsByYear } from '../../lib/vacations'
import { loadLines } from '../metricas/metricsApi'
import { lineOfMember } from '../../utils/lineMembers'
import {
  monthGridRange,
  buildEmployeeCalendarEvents,
  resolveVacationStatus,
} from '../../utils/employeeCalendar'

const VIEW_STORAGE_KEY = 'empresa.empleados.view'
const LEVELS = [1, 2, 3, 4]

// ── Toggle de vista (iconos discretos) ────────────────────────────────────────
function ViewToggle({ view, onChange }) {
  return (
    <div className="flex bg-[#f5f3eb] border border-[#e0ddd4] rounded-lg p-0.5">
      <button
        type="button"
        onClick={() => onChange('columnas')}
        aria-pressed={view === 'columnas'}
        aria-label="Vista por nivel"
        title="Vista por nivel"
        className={`p-1.5 rounded-md transition-all ${
          view === 'columnas' ? 'bg-white text-[#111] shadow-sm' : 'text-[#999] hover:text-[#555]'
        }`}
      >
        <svg
          width="14"
          height="14"
          viewBox="0 0 14 14"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
        >
          <rect x="1" y="1" width="2.6" height="12" rx="0.5" />
          <rect x="5.7" y="1" width="2.6" height="12" rx="0.5" />
          <rect x="10.4" y="1" width="2.6" height="12" rx="0.5" />
        </svg>
      </button>
      <button
        type="button"
        onClick={() => onChange('lista')}
        aria-pressed={view === 'lista'}
        aria-label="Vista lista"
        title="Vista lista"
        className={`p-1.5 rounded-md transition-all ${
          view === 'lista' ? 'bg-white text-[#111] shadow-sm' : 'text-[#999] hover:text-[#555]'
        }`}
      >
        <svg
          width="14"
          height="14"
          viewBox="0 0 14 14"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
        >
          <line x1="1" y1="2.5" x2="13" y2="2.5" />
          <line x1="1" y1="7" x2="13" y2="7" />
          <line x1="1" y1="11.5" x2="13" y2="11.5" />
        </svg>
      </button>
    </div>
  )
}

// ── Icono X (eliminar) ─────────────────────────────────────────────────────────
function DeleteIcon({ size = 13 }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 14 14"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
    >
      <line x1="2" y1="2" x2="12" y2="12" />
      <line x1="12" y1="2" x2="2" y2="12" />
    </svg>
  )
}

// ── Icono restaurar ─────────────────────────────────────────────────────────────
function RestoreIcon({ size = 13 }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 14 14"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M2 7a5 5 0 1 1 1.6 3.7" />
      <path d="M2 3v3.5h3.5" />
    </svg>
  )
}

// ── Card de empleado (lista completa / columnas compacta) ─────────────────────
function EmployeeCard({
  emp,
  compact,
  onEdit,
  onVacations,
  onOpen,
  onDelete,
  onRestore,
  canDelete,
  showLevel,
}) {
  const fullName = `${emp.first_name} ${emp.last_name}`
  const deleted = !!emp.deleted_at

  if (compact) {
    return (
      <div className="group bg-white rounded-lg border border-[#e0ddd4] px-2.5 py-2 flex items-center gap-2">
        <button
          type="button"
          onClick={() => onOpen(emp)}
          aria-label={`Ver ficha de ${fullName}`}
          className="flex-1 min-w-0 flex items-center gap-2 text-left"
        >
          <Avatar user={emp} size={28} />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1">
              <span className="text-[13px] font-semibold text-[#111] truncate">{fullName}</span>
              {emp.admin && (
                <span className="text-[9px] font-mono font-bold tracking-wide uppercase bg-[#FFB800] text-[#111] px-1 py-0.5 rounded flex-shrink-0">
                  Admin
                </span>
              )}
              {emp.on_probation && (
                <span className="text-[9px] font-mono font-bold tracking-wide uppercase bg-[#fff3e0] text-[#e65100] px-1 py-0.5 rounded flex-shrink-0">
                  Prueba
                </span>
              )}
              {deleted && (
                <span className="text-[9px] font-mono font-bold tracking-wide uppercase bg-red-100 text-red-700 px-1 py-0.5 rounded flex-shrink-0">
                  Eliminado
                </span>
              )}
            </div>
            <p className="text-[12px] text-[#888] truncate">{emp.position?.position_name ?? '—'}</p>
          </div>
        </button>
        {deleted ? (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              onRestore(emp)
            }}
            className="flex-shrink-0 flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] font-semibold text-[#666] border border-[#e0ddd4] hover:bg-[#f5f3eb] transition-colors"
          >
            <RestoreIcon size={11} />
            Restaurar
          </button>
        ) : (
          <div className="flex items-center gap-1 flex-shrink-0 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 focus-within:opacity-100 transition-opacity">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                onVacations(emp)
              }}
              aria-label={`Vacaciones de ${fullName}`}
              title="Vacaciones"
              className="p-1 rounded text-[#999] hover:text-[#555] hover:bg-[#f5f3eb] transition-colors"
            >
              <svg
                width="13"
                height="13"
                viewBox="0 0 14 14"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.4"
              >
                <rect x="1.5" y="2.5" width="11" height="10" rx="1.5" />
                <line x1="1.5" y1="5.5" x2="12.5" y2="5.5" />
                <line x1="4" y1="1" x2="4" y2="3.5" strokeLinecap="round" />
                <line x1="10" y1="1" x2="10" y2="3.5" strokeLinecap="round" />
              </svg>
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                onEdit(emp)
              }}
              aria-label={`Editar ${fullName}`}
              title="Editar"
              className="p-1 rounded text-[#999] hover:text-[#555] hover:bg-[#f5f3eb] transition-colors"
            >
              <svg
                width="13"
                height="13"
                viewBox="0 0 14 14"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.4"
              >
                <path
                  d="M9.5 1.8l2.7 2.7L4.6 12.1l-3.2.6.6-3.2z"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </button>
            {canDelete && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation()
                  onDelete(emp)
                }}
                aria-label={`Eliminar ${fullName}`}
                title="Eliminar"
                className="p-1 rounded text-[#999] hover:text-red-600 hover:bg-red-50 transition-colors"
              >
                <DeleteIcon />
              </button>
            )}
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="bg-white rounded-xl border border-[#e0ddd4] px-4 py-3 flex items-center gap-3">
      {/* Info principal — clickeable, abre la ficha */}
      <button
        type="button"
        onClick={() => onOpen(emp)}
        aria-label={`Ver ficha de ${fullName}`}
        className="flex-1 min-w-0 flex items-center gap-3 text-left"
      >
        <Avatar user={emp} size={38} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[16px] font-semibold text-[#111]">{fullName}</span>
            {emp.admin && (
              <span className="text-[12px] font-mono font-bold tracking-wide uppercase bg-[#FFB800] text-[#111] px-1.5 py-0.5 rounded">
                Admin
              </span>
            )}
            {showLevel && emp.access_level != null && (
              <span className="text-[12px] font-mono font-bold tracking-wide uppercase bg-[#f0ede3] text-[#666] border border-[#e0ddd4] px-1.5 py-0.5 rounded">
                Nivel {emp.access_level}
              </span>
            )}
            {emp.on_probation && (
              <span className="text-[12px] font-mono font-bold tracking-wide uppercase bg-[#fff3e0] text-[#e65100] border border-[#f5d3b0] px-1.5 py-0.5 rounded">
                En prueba
              </span>
            )}
            {deleted && (
              <span className="text-[12px] font-mono font-bold tracking-wide uppercase bg-red-100 text-red-700 border border-red-200 px-1.5 py-0.5 rounded">
                Eliminado
              </span>
            )}
          </div>
          <p className="text-[14px] text-[#888] mt-0.5 truncate">{emp.email}</p>
          <p className="text-[14px] text-[#666] mt-0.5">
            {emp.position?.position_name ?? '—'}
            {emp.department?.department_name ? (
              <span className="text-[#bbb]"> · {emp.department.department_name}</span>
            ) : null}
          </p>
        </div>
      </button>

      {/* Acciones */}
      <div className="flex items-center gap-2 flex-shrink-0">
        {deleted ? (
          <button
            type="button"
            onClick={() => onRestore(emp)}
            className="px-3 py-1.5 rounded-lg text-[14px] font-semibold text-[#555] border border-[#e0ddd4] hover:bg-[#f5f3eb] transition-colors"
          >
            Restaurar
          </button>
        ) : (
          <>
            <button
              type="button"
              onClick={() => onVacations(emp)}
              className="px-3 py-1.5 rounded-lg text-[14px] font-semibold text-[#555] border border-[#e0ddd4] hover:bg-[#f5f3eb] transition-colors"
            >
              Vacaciones
            </button>
            <button
              type="button"
              onClick={() => onEdit(emp)}
              className="px-3 py-1.5 rounded-lg text-[14px] font-bold bg-[#111] text-white hover:bg-[#222] transition-colors"
            >
              Editar
            </button>
            {canDelete && (
              <button
                type="button"
                onClick={() => onDelete(emp)}
                aria-label={`Eliminar ${fullName}`}
                title="Eliminar"
                className="p-1.5 rounded-lg text-[#999] hover:text-red-600 hover:bg-red-50 transition-colors"
              >
                <DeleteIcon size={15} />
              </button>
            )}
          </>
        )}
      </div>
    </div>
  )
}

export default function EmployeesView({ companyId }) {
  const { userProfile } = useAuth()
  // Nivel 1 y 2 no deben ver el nivel de acceso de los demás empleados (ni la vista por
  // columnas, que lo deja intuir por agrupación). Mismo criterio que isFinancePrivileged.
  const canSeeLevels = userProfile?.admin === true || (userProfile?.access_level ?? 1) >= 3
  const [employees, setEmployees] = useState([])
  const [departments, setDepartments] = useState([])
  const [positions, setPositions] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [showArchived, setShowArchived] = useState(false)
  const [showProbationOnly, setShowProbationOnly] = useState(false)

  // Vista: 'columnas' (por defecto, agrupada por nivel) | 'lista'. Se recuerda en localStorage.
  const [view, setView] = useState(() => {
    try {
      return localStorage.getItem(VIEW_STORAGE_KEY) || 'columnas'
    } catch {
      return 'columnas'
    }
  })

  useEffect(() => {
    try {
      localStorage.setItem(VIEW_STORAGE_KEY, view)
    } catch {
      // localStorage no disponible (modo privado, etc.) — ignorar
    }
  }, [view])

  // Modal de edición: null=cerrado, objeto=editar
  const [editModal, setEditModal] = useState(null)
  // Diálogo de vacaciones: null=cerrado, objeto=empleado
  const [vacEmployee, setVacEmployee] = useState(null)
  // Ficha de detalle (solo lectura): null=cerrado, objeto=empleado
  const [infoEmployee, setInfoEmployee] = useState(null)
  // Dialog crear empleado
  const [createOpen, setCreateOpen] = useState(false)
  // Diálogo de confirmación de archivado: null=cerrado, objeto=empleado
  const [confirmArchive, setConfirmArchive] = useState(null)
  const [archiving, setArchiving] = useState(false)
  const [error, setError] = useState(null)

  // Calendario de fechas del equipo: mes visible, vacaciones del rango y día expandido.
  const [calMonth, setCalMonth] = useState(() => {
    const now = new Date()
    return { year: now.getFullYear(), month: now.getMonth() + 1 }
  })
  const [calVacations, setCalVacations] = useState([])
  const [calDay, setCalDay] = useState(null) // Date | null — día con el modal de detalle abierto
  // Vacaciones que abarcan HOY, independiente del mes navegado en el calendario — alimenta
  // la tarjeta fija "De vacaciones ahora" (TeamStatusCards), que no depende de `calMonth`.
  const [todayVacations, setTodayVacations] = useState([])
  // Líneas/equipos (metric_lines), para mostrar el team de cada empleado en "En período
  // de prueba" (TeamStatusCards) — mismo dato que ya usa Métricas/Líneas.
  const [lines, setLines] = useState([])

  // Panel global "Vacaciones del año" (VacationsPanel): año seleccionado + sus vacaciones.
  // El selector de años es un rango fijo (sin query aparte para "qué años tienen datos") —
  // suficiente para el uso real de RRHH: historial reciente + año en curso + el próximo.
  const [panelYear, setPanelYear] = useState(() => new Date().getFullYear())
  const [panelVacations, setPanelVacations] = useState([])
  const panelAvailableYears = Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - 3 + i)

  // ── Carga de datos ──────────────────────────────────────────────────────────
  const loadAll = useCallback(async () => {
    if (!companyId) return
    setLoading(true)
    const [usersRes, deptsRes, posRes, linesRes] = await Promise.all([
      supabase
        .from('users')
        .select(
          '*, department:departments(department_name), position:positions(position_name, position_description, position_functions)',
        )
        .eq('company_id', companyId)
        .order('first_name'),
      supabase.from('departments').select('*').eq('company_id', companyId).order('department_name'),
      supabase.from('positions').select('*').eq('company_id', companyId).order('position_name'),
      loadLines(companyId),
    ])
    setEmployees(usersRes.data ?? [])
    setDepartments(deptsRes.data ?? [])
    setPositions(posRes.data ?? [])
    setLines(linesRes.data ?? [])
    setLoading(false)
  }, [companyId])

  useEffect(() => {
    loadAll()
  }, [loadAll])

  // ── Calendario: vacaciones del mes visible ──────────────────────────────────
  // Deps por string de ids (no el array `employees`, que se recrea en cada loadAll)
  // para no disparar un fetch en bucle.
  const activeIdsKey = activeEmployeesList(employees)
    .map((e) => e.user_id)
    .join(',')
  const loadVacations = useCallback(async () => {
    const userIds = activeIdsKey ? activeIdsKey.split(',') : []
    if (userIds.length === 0) {
      setCalVacations([])
      return
    }
    const { fetchStartKey, endKey } = monthGridRange(calMonth.year, calMonth.month)
    const data = await fetchVacationsInRange(userIds, fetchStartKey, endKey)
    setCalVacations(data)
  }, [activeIdsKey, calMonth.year, calMonth.month])

  useEffect(() => {
    loadVacations()
  }, [loadVacations])

  // ── "De vacaciones ahora": vacaciones que abarcan hoy, sin depender de `calMonth` ──
  const loadTodayVacations = useCallback(async () => {
    const userIds = activeIdsKey ? activeIdsKey.split(',') : []
    if (userIds.length === 0) {
      setTodayVacations([])
      return
    }
    const todayKey = format(new Date(), 'yyyy-MM-dd')
    setTodayVacations(await fetchVacationsInRange(userIds, todayKey, todayKey))
  }, [activeIdsKey])

  useEffect(() => {
    loadTodayVacations()
  }, [loadTodayVacations])

  // ── Panel "Vacaciones del año": vacaciones del año seleccionado ──────────────
  const loadPanelVacations = useCallback(async () => {
    const userIds = activeIdsKey ? activeIdsKey.split(',') : []
    if (userIds.length === 0) {
      setPanelVacations([])
      return
    }
    setPanelVacations(await fetchVacationsByYear(userIds, panelYear))
  }, [activeIdsKey, panelYear])

  useEffect(() => {
    loadPanelVacations()
  }, [loadPanelVacations])

  // ── Realtime ────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!companyId) return
    const channel = supabase
      .channel('empresa-empleados-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'users' }, () => loadAll())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'vacations' }, () => {
        loadVacations()
        loadTodayVacations()
        loadPanelVacations()
      })
      .subscribe()
    return () => {
      supabase.removeChannel(channel)
    }
  }, [companyId, loadAll, loadVacations, loadTodayVacations, loadPanelVacations])

  // ── Handlers ────────────────────────────────────────────────────────────────
  function handleEmployeeSaved(saved) {
    setEmployees((prev) => {
      const exists = prev.some((e) => e.user_id === saved.user_id)
      if (exists) return prev.map((e) => (e.user_id === saved.user_id ? saved : e))
      return [...prev, saved].sort((a, b) => a.first_name.localeCompare(b.first_name))
    })
  }

  // Archivar/restaurar van a la Netlify function (service role): banea/desbanea el
  // login en auth.users además de marcar/desmarcar deleted_at en el perfil.
  async function callManage(user_id, action) {
    const {
      data: { session },
    } = await supabase.auth.getSession()
    const res = await fetch('/api/employees/manage', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({ user_id, action }),
    })
    const payload = await res.json()
    if (!res.ok) throw new Error(payload.error ?? 'Error al procesar el empleado')
    return payload
  }

  async function handleArchive() {
    if (!confirmArchive) return
    setArchiving(true)
    setError(null)
    try {
      const updated = await callManage(confirmArchive.user_id, 'archive')
      handleEmployeeSaved(updated)
      setConfirmArchive(null)
    } catch (err) {
      setError(err.message)
    } finally {
      setArchiving(false)
    }
  }

  async function handleRestore(employee) {
    setError(null)
    try {
      const updated = await callManage(employee.user_id, 'restore')
      handleEmployeeSaved(updated)
    } catch (err) {
      setError(err.message)
    }
  }

  // ── Calendario de fechas del equipo ──────────────────────────────────────────
  const calEvents = buildEmployeeCalendarEvents({
    employees: activeEmployeesList(employees),
    vacations: calVacations,
    year: calMonth.year,
    month: calMonth.month,
  })
  const calDayEvents = calDay
    ? calEvents.filter((ev) => ev.dateKey === format(calDay, 'yyyy-MM-dd'))
    : []

  // ── Split activos / archivados + filtro local ────────────────────────────────
  const activeEmployees = employees.filter((e) => !e.deleted_at)
  const archivedEmployees = employees.filter((e) => !!e.deleted_at)
  const probationCount = activeEmployees.filter((e) => e.on_probation).length

  // ── Tarjetas fijas de estado del equipo (TeamStatusCards) ───────────────────
  const todayKey = format(new Date(), 'yyyy-MM-dd')
  const activeById = new Map(activeEmployeesList(employees).map((e) => [e.user_id, e]))
  const onVacationItems = todayVacations
    .filter((v) => v.start_date <= todayKey && v.end_date >= todayKey) // defensivo
    .map((v) => ({
      v,
      emp: activeById.get(v.user_id),
      st: resolveVacationStatus(v.status, v.end_date, todayKey),
    }))
    .filter(({ emp, st }) => emp && (st === 'confirmed' || st === 'tentative'))
    .map(({ v, emp, st }) => ({
      id: v.id,
      user: emp,
      name: `${emp.first_name} ${emp.last_name}`,
      subtitle: `Hasta el ${v.end_date.slice(8, 10)}/${v.end_date.slice(5, 7)}`,
      badge: st === 'tentative' ? { text: 'tentativa', cls: 'bg-amber-100 text-amber-800' } : null,
      dashed: st === 'tentative',
    }))
  const probationItems = activeEmployees
    .filter((e) => e.on_probation)
    .map((e) => {
      const position = e.position?.position_name ?? '—'
      const team = lineOfMember(lines, e.user_id)?.name
      return {
        id: e.user_id,
        user: e,
        name: `${e.first_name} ${e.last_name}`,
        subtitle: team ? `${position} · ${team}` : position,
        badge: null,
        dashed: false,
      }
    })
  // "Solo en prueba" se aplica sobre el pool visible (activos o archivados):
  // combinado con "Ver eliminados" muestra a los que no pasaron la prueba.
  const visibleEmployees = (showArchived ? archivedEmployees : activeEmployees).filter(
    (e) => !showProbationOnly || e.on_probation,
  )

  const filtered = visibleEmployees.filter((e) => {
    const q = search.toLowerCase()
    if (!q) return true
    const fullName = `${e.first_name} ${e.last_name}`.toLowerCase()
    const position = (e.position?.position_name ?? '').toLowerCase()
    const department = (e.department?.department_name ?? '').toLowerCase()
    return (
      fullName.includes(q) ||
      e.email.toLowerCase().includes(q) ||
      position.includes(q) ||
      department.includes(q)
    )
  })

  // Vista efectiva: nivel 1/2 siempre ven la lista plana, sin tocar la preferencia guardada.
  const effectiveView = canSeeLevels ? view : 'lista'

  // ── Agrupación por nivel (solo para vista columnas) ─────────────────────────
  const byLevel = { 1: [], 2: [], 3: [], 4: [] }
  const sinNivel = []
  filtered.forEach((emp) => {
    if (LEVELS.includes(emp.access_level)) byLevel[emp.access_level].push(emp)
    else sinNivel.push(emp)
  })

  // ── Render ──────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-6 h-6 border-2 border-[#FFB800] border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <>
      {/* Barra superior */}
      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <p className="text-[15px] text-[#888] flex-shrink-0">
          {visibleEmployees.length} empleado{visibleEmployees.length !== 1 ? 's' : ''}
          {probationCount > 0 && (
            <span className="text-[#e65100]"> · {probationCount} en prueba</span>
          )}
        </p>
        <input
          type="text"
          className="input-base input-compact max-w-xs"
          placeholder="Buscar por nombre, email, cargo o departamento…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <button
          type="button"
          onClick={() => setShowArchived((v) => !v)}
          className={`px-3 py-1.5 rounded-lg text-[13.5px] font-semibold border transition-all ${
            showArchived
              ? 'bg-[#f5f0e0] text-[#888] border-[#d4c890]'
              : 'bg-white text-[#aaa] border-[#e0ddd4] hover:bg-[#f5f3eb]'
          }`}
        >
          {showArchived ? 'Ocultando activos' : `Ver eliminados (${archivedEmployees.length})`}
        </button>
        <button
          type="button"
          onClick={() => setShowProbationOnly((v) => !v)}
          className={`px-3 py-1.5 rounded-lg text-[13.5px] font-semibold border transition-all ${
            showProbationOnly
              ? 'bg-[#fff3e0] text-[#e65100] border-[#f5c99a]'
              : 'bg-white text-[#aaa] border-[#e0ddd4] hover:bg-[#f5f3eb]'
          }`}
        >
          {showProbationOnly ? 'Mostrando solo prueba' : `Solo en prueba (${probationCount})`}
        </button>
        <div className="flex items-center gap-3 sm:ml-auto">
          {canSeeLevels && <ViewToggle view={view} onChange={setView} />}
          {!showArchived && (
            <button
              type="button"
              onClick={() => setCreateOpen(true)}
              className="px-3 py-1.5 rounded-lg text-[14px] font-bold bg-[#FFB800] text-[#111] hover:bg-[#e6a600] transition-colors"
            >
              + Nuevo empleado
            </button>
          )}
        </div>
      </div>

      {error && (
        <div className="mb-4 bg-red-50 border border-red-300 rounded-xl px-4 py-3 text-[14px] text-red-700 font-medium">
          {error}
        </div>
      )}

      {/* Tarjetas fijas: quién está de vacaciones / en período de prueba ahora mismo */}
      {!showArchived && (
        <TeamStatusCards onVacationItems={onVacationItems} probationItems={probationItems} />
      )}

      {/* Panel global: todas las vacaciones de la empresa para un año, sin abrir empleado
          por empleado */}
      {!showArchived && (
        <VacationsPanel
          year={panelYear}
          onYearChange={setPanelYear}
          availableYears={panelAvailableYears}
          vacations={panelVacations}
          employees={activeEmployeesList(employees)}
          lines={lines}
          onOpenEmployee={setVacEmployee}
        />
      )}

      {/* Calendario de fechas del equipo */}
      {!showArchived && (
        <EmployeeDatesCalendar
          year={calMonth.year}
          month={calMonth.month}
          events={calEvents}
          onMonthChange={(year, month) => setCalMonth({ year, month })}
          onDayClick={setCalDay}
        />
      )}

      {/* Estado vacío */}
      {filtered.length === 0 ? (
        <div className="bg-white rounded-xl border border-[#e0ddd4] p-10 text-center">
          <p className="text-[17px] font-semibold text-[#888] mb-1">
            {search
              ? 'Sin resultados'
              : showArchived
                ? 'Sin empleados eliminados'
                : 'Sin empleados'}
          </p>
          <p className="text-[15px] text-[#bbb]">
            {search
              ? 'Intenta con otro nombre, email, cargo o departamento.'
              : showArchived
                ? 'Los empleados que elimines aparecerán aquí.'
                : 'Aún no hay empleados registrados en esta empresa.'}
          </p>
        </div>
      ) : effectiveView === 'lista' ? (
        <div className="space-y-2">
          {filtered.map((emp) => (
            <EmployeeCard
              key={emp.user_id}
              emp={emp}
              compact={false}
              onEdit={setEditModal}
              onVacations={setVacEmployee}
              onOpen={setInfoEmployee}
              onDelete={setConfirmArchive}
              onRestore={handleRestore}
              canDelete={emp.user_id !== userProfile?.user_id}
              showLevel={canSeeLevels}
            />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {LEVELS.map((level) => (
            <div key={level}>
              <div className="flex items-center gap-2 mb-2">
                <span className="text-[12px] font-mono font-bold tracking-wide uppercase bg-[#f0ede3] text-[#666] border border-[#e0ddd4] px-1.5 py-0.5 rounded">
                  Nivel {level}
                </span>
                <span className="text-[12px] text-[#bbb]">Total: {byLevel[level].length}</span>
              </div>
              {byLevel[level].length === 0 ? (
                <p className="text-[13px] text-[#ccc] px-1">Sin empleados</p>
              ) : (
                <div className="space-y-1.5">
                  {byLevel[level].map((emp) => (
                    <EmployeeCard
                      key={emp.user_id}
                      emp={emp}
                      compact
                      onEdit={setEditModal}
                      onVacations={setVacEmployee}
                      onOpen={setInfoEmployee}
                      onDelete={setConfirmArchive}
                      onRestore={handleRestore}
                      canDelete={emp.user_id !== userProfile?.user_id}
                      showLevel={canSeeLevels}
                    />
                  ))}
                </div>
              )}
            </div>
          ))}
          {sinNivel.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-2">
                <span className="text-[12px] font-mono font-bold tracking-wide uppercase bg-[#f0ede3] text-[#666] border border-[#e0ddd4] px-1.5 py-0.5 rounded">
                  Sin nivel
                </span>
                <span className="text-[12px] text-[#bbb]">Total: {sinNivel.length}</span>
              </div>
              <div className="space-y-1.5">
                {sinNivel.map((emp) => (
                  <EmployeeCard
                    key={emp.user_id}
                    emp={emp}
                    compact
                    onEdit={setEditModal}
                    onVacations={setVacEmployee}
                    onOpen={setInfoEmployee}
                    onDelete={setConfirmArchive}
                    onRestore={handleRestore}
                    canDelete={emp.user_id !== userProfile?.user_id}
                    showLevel={canSeeLevels}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Modal de edición */}
      {editModal !== null && (
        <EmployeeModal
          employee={editModal}
          departments={departments}
          positions={positions}
          onClose={() => setEditModal(null)}
          onSaved={handleEmployeeSaved}
        />
      )}

      {/* Diálogo de vacaciones */}
      {vacEmployee !== null && (
        <VacationsDialog employee={vacEmployee} onClose={() => setVacEmployee(null)} />
      )}

      {/* Ficha de detalle (solo lectura) */}
      {infoEmployee !== null && (
        <EmployeeInfoModal employee={infoEmployee} onClose={() => setInfoEmployee(null)} />
      )}

      {/* Detalle del día del calendario de fechas del equipo */}
      {calDay !== null && (
        <EmployeeDayEventsModal
          date={calDay}
          events={calDayEvents}
          onClose={() => setCalDay(null)}
        />
      )}

      {/* Dialog crear empleado */}
      {createOpen && (
        <NewEmployeeDialog
          departments={departments}
          positions={positions}
          onClose={() => setCreateOpen(false)}
          onCreated={handleEmployeeSaved}
        />
      )}

      {/* Diálogo de confirmación de eliminación (soft delete) */}
      {confirmArchive && (
        <ConfirmDeleteDialog
          itemName={`${confirmArchive.first_name} ${confirmArchive.last_name}`}
          itemLabel="empleado"
          message={
            <>
              <strong>
                {confirmArchive.first_name} {confirmArchive.last_name}
              </strong>{' '}
              dejará de aparecer en selectores y conteos, y no podrá iniciar sesión. Su historial
              (tareas, reuniones, evaluaciones, reportes) se conserva intacto. Esta acción se puede
              revertir restaurando al empleado. Para confirmar, escribe su nombre completo a
              continuación.
            </>
          }
          onConfirm={handleArchive}
          onCancel={() => setConfirmArchive(null)}
          confirming={archiving}
        />
      )}

      {/* Recursos externos (grabación/edición/ads): no son empleados, viven en su propia
          tabla y solo se usan en Pautas — ver ExternalResourcesView. */}
      <ExternalResourcesView companyId={companyId} />
    </>
  )
}
