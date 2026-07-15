import { useState, useEffect, useCallback } from 'react'
import { useSearchParams, useNavigate, useLocation } from 'react-router-dom'
import { supabase } from '../supabase'
import { useAuth } from '../context/AuthContext'
import PanoramaView from '../components/tareas/PanoramaView'
import TeamView from '../components/tareas/TeamView'
import BaseView from '../components/tareas/BaseView'
import KanbanView from '../components/tareas/KanbanView'
import StandupView from '../components/tareas/StandupView'
import TaskModal from '../components/tareas/TaskModal'
import { loadLines, loadClients } from '../components/metricas/metricsApi'
import { currentMonthIndex } from '../components/tareas/constants'
import { MONTHS } from '../components/metricas/constants'
import { visibleLinesForUser } from '../utils/lineMembers'

const ALL_TEAMS = '__all__'
const CURRENT_YEAR = Math.floor(currentMonthIndex() / 12)
const YEARS = [CURRENT_YEAR, CURRENT_YEAR - 1, CURRENT_YEAR - 2, CURRENT_YEAR - 3]

const VIEWS = [
  {
    key: 'team',
    label: 'Dashboard',
    desc: 'Esta sección es la lupa sobre un team específico. Aquí revisas su semáforo por cliente, el estado de su pipeline y sus cifras. Úsala para entender a fondo cómo va un equipo en particular.',
    descAll: 'Esta sección es la cartelera general de todos los teams. Aquí ves de un vistazo cómo va la agencia esta semana: el porcentaje de cierre de cada team, quién lidera y los números globales. Úsala para detectar rápido dónde hace falta apoyar.',
  },
  {
    key: 'base',
    label: 'Base',
    desc: 'Esta sección es la base de tareas, donde vive cada acuerdo. Aquí vacías todo lo que se acuerda por WhatsApp o minuta y lo filtras o buscas. Recuerda: si no está aquí, no existe.',
  },
  {
    key: 'kanban',
    label: 'Kanban',
    desc: 'Esta sección es el flujo de trabajo visual. Aquí mueves cada tarea por sus estados —En proceso, Por revisar, Paralizado, Pendiente, Terminado— hasta cerrarla. Úsala para ver en qué punto está cada cosa y empujarla al cierre.',
  },
  {
    key: 'standup',
    label: 'Stand-up',
    desc: 'Esta sección es la agenda de la reunión rápida de 15 minutos. Aquí aparece solo lo que necesita atención (rojo y amarillo) y lo asignado a la dirección. Úsala para reuniones cortas y enfocadas en lo que importa.',
  },
]

export default function TareasPage() {
  const { userProfile, can = () => true } = useAuth()
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const location = useLocation()
  const [teams, setTeams] = useState([])
  const [tasks, setTasks] = useState([])
  const [clients, setClients] = useState([])
  const [clientsById, setClientsById] = useState(new Map())
  const [usersMap, setUsersMap] = useState(new Map())
  const [allUsers, setAllUsers] = useState([])
  const [loading, setLoading] = useState(true)

  // Visibilidad de vistas: config-driven vía capacidades de permisos.
  // Sin reglas configuradas → acceso libre (mismo default del sistema).
  const visibleViews = VIEWS.filter(v => can(`tareas.${v.key}`))
  const canManage = can('tareas.manage')
  // "Todos" (ver todas las líneas combinadas) es exclusivo de nivel 4 / admin.
  const canViewAll = userProfile?.access_level >= 4 || userProfile?.admin === true

  const [activeView, setActiveView] = useState(
    () => searchParams.get('view') === 'base' ? 'base' : 'team',
  )

  // Cuando cargan los permisos, redirigir si la vista activa no está disponible.
  useEffect(() => {
    if (userProfile && visibleViews.length > 0 && !visibleViews.find(v => v.key === activeView)) {
      setActiveView(visibleViews[0].key)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userProfile, activeView])

  // Sincroniza la vista activa con el historial del navegador: cuando una card del
  // dashboard navega a Base se empuja una entrada de historial (ver goToBaseWithFilter);
  // al presionar "atrás" el navegador dispara este efecto (vía cambio de location) en
  // lugar de sacar al usuario de la página de Tareas.
  useEffect(() => {
    const st = location.state
    if (st?.tareasView) {
      setActiveView(st.tareasView)
      setPendingBaseFilter(st.baseFilter ?? null)
    } else {
      setActiveView(searchParams.get('view') === 'base' ? 'base' : 'team')
      setPendingBaseFilter(null)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.key])
  const [activeTeamId, setActiveTeamId] = useState(
    () => searchParams.get('team') ?? null,
  )
  const [monthIdx, setMonthIdx] = useState(currentMonthIndex())
  // null = closed, undefined = new task, object = edit existing
  const [taskModal, setTaskModal] = useState(null)
  // Filtro pendiente a aplicar al entrar a Base desde una card del dashboard.
  // { status?: string, alert?: string, support?: 'all' } | null
  const [pendingBaseFilter, setPendingBaseFilter] = useState(null)

  const isAll = activeTeamId === ALL_TEAMS
  const activeTeam = isAll ? null : teams.find(t => t.id === activeTeamId) ?? null

  const loadAll = useCallback(async () => {
    if (!userProfile?.company_id) return
    setLoading(true)
    const companyId = userProfile.company_id

    const [linesRes, tasksRes, usersRes, clientsRes] = await Promise.all([
      loadLines(companyId),
      supabase.from('tasks').select('*').eq('company_id', companyId).order('created_at', { ascending: false }),
      supabase.from('users').select('user_id, first_name, last_name, avatar_url, access_level, position:positions(position_name)').eq('company_id', companyId).order('first_name'),
      loadClients(companyId),
    ])

    const fetchedTeams = visibleLinesForUser(linesRes.data ?? [], userProfile)
    setTeams(fetchedTeams)
    setTasks(tasksRes.data ?? [])

    const fetchedClients = clientsRes.data ?? []
    setClients(fetchedClients)
    setClientsById(new Map(fetchedClients.map(c => [c.id, c])))

    const users = usersRes.data ?? []
    setAllUsers(users)
    setUsersMap(new Map(users.map(u => [u.user_id, u])))

    setActiveTeamId(prev => prev ?? (canViewAll ? ALL_TEAMS : (fetchedTeams[0]?.id ?? null)))
    setLoading(false)
  }, [userProfile?.company_id, canViewAll])

  useEffect(() => {
    loadAll()
  }, [loadAll])

  useEffect(() => {
    if (!userProfile?.company_id) return
    let channel = supabase
      .channel('tasks-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tasks' }, payload => {
        setTasks(prev => {
          if (payload.eventType === 'INSERT') {
            return prev.some(t => t.id === payload.new.id) ? prev : [payload.new, ...prev]
          }
          if (payload.eventType === 'UPDATE') {
            return prev.map(t => t.id === payload.new.id ? payload.new : t)
          }
          if (payload.eventType === 'DELETE') {
            return prev.filter(t => t.id !== payload.old.id)
          }
          return prev
        })
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'metric_lines' }, () => loadAll())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'metric_clients' }, () => loadAll())
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [userProfile?.company_id, loadAll])

  function handleCreated(task) {
    setTasks(prev => [task, ...prev])
  }

  function handleUpdated(task) {
    if (task._deleted) {
      setTasks(prev => prev.filter(t => t.id !== task.id))
    } else {
      setTasks(prev => prev.map(t => t.id === task.id ? task : t))
    }
  }

  function openNewTask() { setTaskModal(undefined) }
  function openEditTask(task) { setTaskModal(task) }
  function closeTaskModal() { setTaskModal(null) }

  function selectTeam(teamId) {
    setActiveTeamId(teamId)
  }

  function goToBaseWithFilter(filter) {
    // Empuja una entrada de historial (misma URL, distinto state) para que el botón
    // "atrás" del navegador regrese al Dashboard en vez de salir de Tareas.
    navigate(location.pathname + location.search, {
      state: { tareasView: 'base', baseFilter: filter ?? null },
    })
  }

  return (
    <>
      <main className="flex-1 overflow-y-auto main-bg">
        <div className="max-w-7xl mx-auto px-4 py-6 sm:px-6 sm:py-8">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-6">
            <div>
              <h1 className="text-[26px] font-bold text-[#111] leading-tight">Gestión de Tareas</h1>
              <p className="text-[15px] text-[#888] mt-0.5">QC · Cierre · Stand-up mensual</p>
            </div>
            {canManage && (
              <div className="flex items-center gap-2 w-full sm:w-auto">
                <button
                  onClick={openNewTask}
                  className="flex-1 sm:flex-none flex items-center justify-center gap-2 bg-[#111] text-white text-[15px] font-bold px-4 py-2.5 rounded-xl hover:bg-[#222] transition-colors"
                >
                  <svg width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2.8">
                    <path d="M6 1v10M1 6h10" strokeLinecap="round"/>
                  </svg>
                  Nueva tarea
                </button>
              </div>
            )}
          </div>

          <div className="flex flex-col gap-3 mb-6">
            {(teams.length > 0 || canViewAll) && (
              <div className="flex flex-wrap gap-1.5 items-center">
                {canViewAll && (
                  <button
                    onClick={() => setActiveTeamId(ALL_TEAMS)}
                    className={`px-3 py-1 rounded-full text-[14.5px] font-semibold transition-all ${
                      isAll
                        ? 'bg-[#FFB800] text-[#111]'
                        : 'bg-white border border-[#e0ddd4] text-[#555] hover:border-[#FFB800] hover:text-[#111]'
                    }`}
                  >
                    Todos
                  </button>
                )}
                {teams.map(t => (
                  <button
                    key={t.id}
                    onClick={() => selectTeam(t.id)}
                    className={`px-3 py-1 rounded-full text-[14.5px] font-semibold transition-all ${
                      activeTeamId === t.id
                        ? 'bg-[#FFB800] text-[#111]'
                        : 'bg-white border border-[#e0ddd4] text-[#555] hover:border-[#FFB800] hover:text-[#111]'
                    }`}
                  >
                    {t.name}
                  </button>
                ))}
              </div>
            )}
            <div className="flex flex-col sm:flex-row sm:items-center gap-2">
              <div className="flex bg-white border border-[#e0ddd4] rounded-xl p-1 w-full sm:w-fit">
                {visibleViews.map(v => (
                  <button
                    key={v.key}
                    onClick={() => {
                      setActiveView(v.key)
                      if (v.key === 'base') setPendingBaseFilter(null)
                    }}
                    className={`flex-1 sm:flex-none px-2.5 sm:px-4 py-1.5 rounded-lg text-[14.5px] font-semibold transition-all ${
                      activeView === v.key
                        ? 'bg-[#111] text-white'
                        : 'text-[#666] hover:text-[#111] hover:bg-[#f5f3eb]'
                    }`}
                  >
                    {v.label}
                  </button>
                ))}
              </div>
              {activeView !== 'standup' && (
                <div className="flex items-center gap-1.5">
                  <span className="text-[12px] font-mono font-bold tracking-[0.14em] uppercase text-[#888] mr-1">
                    Período
                  </span>
                  <select
                    value={monthIdx % 12}
                    onChange={e => setMonthIdx(Math.floor(monthIdx / 12) * 12 + Number(e.target.value))}
                    className="text-[13.5px] border border-[#e0ddd4] rounded-lg px-2 py-1.5 bg-white text-[#333] focus:outline-none focus:border-[#FFB800]"
                  >
                    {MONTHS.map((name, i) => (
                      <option key={i} value={i}>{name}</option>
                    ))}
                  </select>
                  <select
                    value={Math.floor(monthIdx / 12)}
                    onChange={e => setMonthIdx(Number(e.target.value) * 12 + (monthIdx % 12))}
                    className="text-[13.5px] border border-[#e0ddd4] rounded-lg px-2 py-1.5 bg-white text-[#333] focus:outline-none focus:border-[#FFB800]"
                  >
                    {YEARS.map(y => (
                      <option key={y} value={y}>{y}</option>
                    ))}
                  </select>
                </div>
              )}
            </div>
          </div>

          {(() => {
            const v = VIEWS.find(v => v.key === activeView)
            const desc = activeView === 'team' && isAll ? v?.descAll : v?.desc
            return desc && (
              <p className="text-[14.5px] text-[#888] leading-relaxed -mt-2 mb-2 max-w-2xl">
                {desc}
              </p>
            )
          })()}

          {!loading && teams.length === 0 && !canViewAll && (
            <div className="bg-white rounded-xl border border-[#e0ddd4] p-10 text-center mb-4">
              <p className="text-[17px] font-semibold text-[#888] mb-1">No hay líneas creadas</p>
              <p className="text-[15px] text-[#bbb]">Crea las líneas desde <strong>Empresa → Líneas</strong> para empezar a gestionar tareas</p>
            </div>
          )}

          {loading ? (
            <div className="flex items-center justify-center py-20">
              <div className="w-6 h-6 border-2 border-[#FFB800] border-t-transparent rounded-full animate-spin" />
            </div>
          ) : (
            <>
              {activeView === 'team' && (
                isAll
                  ? <PanoramaView teams={teams} tasks={tasks} monthIdx={monthIdx} onSelectTeam={selectTeam} onNavigateToBase={goToBaseWithFilter} />
                  : <TeamView team={activeTeam} tasks={tasks} usersMap={usersMap} monthIdx={monthIdx} clientsById={clientsById} onOpenTask={openEditTask} onNavigateToBase={goToBaseWithFilter} />
              )}
              {activeView === 'base' && (
                <BaseView tasks={tasks} teams={teams} team={activeTeam} allLines={isAll} usersMap={usersMap} clientsById={clientsById} monthIdx={monthIdx} onOpenTask={openEditTask} onUpdated={handleUpdated} initialFilter={pendingBaseFilter} />
              )}
              {activeView === 'kanban' && (
                <KanbanView team={activeTeam} teams={teams} allLines={isAll} tasks={tasks} usersMap={usersMap} clientsById={clientsById} monthIdx={monthIdx} onOpenTask={openEditTask} onUpdated={handleUpdated} />
              )}
              {activeView === 'standup' && (
                <StandupView team={activeTeam} allLines={isAll} tasks={tasks} teams={teams} usersMap={usersMap} monthIdx={currentMonthIndex()} onOpenTask={openEditTask} />
              )}
            </>
          )}
        </div>
      </main>

      {taskModal !== null && (
        <TaskModal
          task={taskModal === undefined ? null : taskModal}
          teams={teams}
          clients={clients}
          users={allUsers}
          defaultTeamId={isAll ? null : activeTeamId}
          onClose={closeTaskModal}
          onCreated={handleCreated}
          onUpdated={handleUpdated}
        />
      )}

    </>
  )
}
