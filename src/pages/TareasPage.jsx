import { useState, useEffect, useCallback } from 'react'
import { useSearchParams } from 'react-router-dom'
import { supabase } from '../supabase'
import { useAuth } from '../context/AuthContext'
import PanoramaView from '../components/tareas/PanoramaView'
import TeamView from '../components/tareas/TeamView'
import BaseView from '../components/tareas/BaseView'
import KanbanView from '../components/tareas/KanbanView'
import StandupView from '../components/tareas/StandupView'
import TaskModal from '../components/tareas/TaskModal'
import { loadLines, loadClients } from '../components/metricas/metricsApi'
import { currentMonthIndex, fmtMonth } from '../components/tareas/constants'

const VIEWS = [
  {
    key: 'panorama',
    label: 'Panorama',
    desc: 'Esta sección es la cartelera general de los 4 teams. Aquí ves de un vistazo cómo va la agencia esta semana: el porcentaje de cierre de cada team, quién lidera y los números globales. Úsala para detectar rápido dónde hace falta apoyar.',
  },
  {
    key: 'team',
    label: 'Dashboard',
    desc: 'Esta sección es la lupa sobre un team específico. Aquí revisas su semáforo por cliente, el estado de su pipeline y sus cifras. Úsala para entender a fondo cómo va un equipo en particular.',
  },
  {
    key: 'base',
    label: 'Base',
    desc: 'Esta sección es la base de tareas, donde vive cada acuerdo. Aquí vacías todo lo que se acuerda por WhatsApp o minuta y lo filtras o buscas. Recuerda: si no está aquí, no existe.',
  },
  {
    key: 'kanban',
    label: 'Kanban',
    desc: 'Esta sección es el flujo de trabajo visual. Aquí mueves cada tarea por sus estados —En proceso, Por revisar, Bloqueado, Pendiente, Terminado— hasta cerrarla. Úsala para ver en qué punto está cada cosa y empujarla al cierre.',
  },
  {
    key: 'standup',
    label: 'Stand-up',
    desc: 'Esta sección es la agenda de la reunión rápida de 15 minutos. Aquí aparece solo lo que necesita atención (rojo y amarillo) y lo asignado a la dirección. Úsala para reuniones cortas y enfocadas en lo que importa.',
  },
]

export default function TareasPage() {
  const { userProfile } = useAuth()
  const [searchParams] = useSearchParams()
  const [teams, setTeams] = useState([])
  const [tasks, setTasks] = useState([])
  const [clients, setClients] = useState([])
  const [clientsById, setClientsById] = useState(new Map())
  const [usersMap, setUsersMap] = useState(new Map())
  const [allUsers, setAllUsers] = useState([])
  const [loading, setLoading] = useState(true)

  // Privileged users (access_level >= 2 or admin) see all views and all tasks.
  // Level-1 users only see Base and Kanban (their own tasks, enforced by RLS).
  const privileged = userProfile?.access_level >= 2 || userProfile?.admin === true
  const visibleViews = privileged ? VIEWS : VIEWS.filter(v => v.key === 'base' || v.key === 'kanban')

  const [activeView, setActiveView] = useState(
    () => searchParams.get('view') === 'base' ? 'base' : 'panorama',
  )

  // When userProfile loads, redirect level-1 users away from restricted views.
  useEffect(() => {
    if (userProfile && !privileged && activeView !== 'base' && activeView !== 'kanban') {
      setActiveView('base')
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userProfile])
  const [activeTeamId, setActiveTeamId] = useState(null)
  const [monthIdx, setMonthIdx] = useState(currentMonthIndex())
  // null = closed, undefined = new task, object = edit existing
  const [taskModal, setTaskModal] = useState(null)

  const activeTeam = teams.find(t => t.id === activeTeamId) ?? null

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

    const fetchedTeams = linesRes.data ?? []
    setTeams(fetchedTeams)
    setTasks(tasksRes.data ?? [])

    const fetchedClients = clientsRes.data ?? []
    setClients(fetchedClients)
    setClientsById(new Map(fetchedClients.map(c => [c.id, c])))

    const users = usersRes.data ?? []
    setAllUsers(users)
    setUsersMap(new Map(users.map(u => [u.user_id, u])))

    setActiveTeamId(prev => prev ?? (fetchedTeams[0]?.id ?? null))
    setLoading(false)
  }, [userProfile?.company_id])

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
    if (activeView === 'panorama') setActiveView('team')
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
          </div>

          <div className="flex flex-col gap-3 mb-6">
            {teams.length > 0 && (
              <div className="flex flex-wrap gap-1.5 items-center">
                <span className="text-[12.5px] font-mono font-bold tracking-[0.14em] uppercase text-[#888] mr-1">Team</span>
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
                    onClick={() => setActiveView(v.key)}
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
              {['panorama', 'team', 'standup'].includes(activeView) && (
                <div className="flex items-center gap-1 bg-white border border-[#e0ddd4] rounded-xl px-1 py-1 w-full sm:w-auto">
                  <button
                    onClick={() => setMonthIdx(i => i - 1)}
                    className="px-2.5 py-1 rounded-lg text-[16px] text-[#555] hover:bg-[#f5f3eb] hover:text-[#111] transition-colors"
                    aria-label="Mes anterior"
                  >
                    ‹
                  </button>
                  <span className="flex-1 text-center text-[14.5px] font-semibold text-[#111] min-w-[120px]">
                    {fmtMonth(monthIdx)}
                  </span>
                  <button
                    onClick={() => setMonthIdx(i => i + 1)}
                    className="px-2.5 py-1 rounded-lg text-[16px] text-[#555] hover:bg-[#f5f3eb] hover:text-[#111] transition-colors"
                    aria-label="Mes siguiente"
                  >
                    ›
                  </button>
                  {monthIdx !== currentMonthIndex() && (
                    <button
                      onClick={() => setMonthIdx(currentMonthIndex())}
                      className="px-2.5 py-1 rounded-lg text-[13.5px] font-semibold text-[#888] hover:bg-[#f5f3eb] hover:text-[#111] transition-colors border-l border-[#e0ddd4] ml-0.5"
                      aria-label="Volver al mes actual"
                    >
                      Hoy
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>

          {VIEWS.find(v => v.key === activeView)?.desc && (
            <p className="text-[14.5px] text-[#888] leading-relaxed -mt-2 mb-2 max-w-2xl">
              {VIEWS.find(v => v.key === activeView).desc}
            </p>
          )}

          {!loading && teams.length === 0 && (
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
              {activeView === 'panorama' && (
                <PanoramaView teams={teams} tasks={tasks} monthIdx={monthIdx} onSelectTeam={selectTeam} />
              )}
              {activeView === 'team' && (
                <TeamView team={activeTeam} tasks={tasks} usersMap={usersMap} monthIdx={monthIdx} clientsById={clientsById} onOpenTask={openEditTask} />
              )}
              {activeView === 'base' && (
                <BaseView tasks={tasks} teams={teams} team={activeTeam} usersMap={usersMap} clientsById={clientsById} onOpenTask={openEditTask} onUpdated={handleUpdated} />
              )}
              {activeView === 'kanban' && (
                <KanbanView team={activeTeam} tasks={tasks} usersMap={usersMap} clientsById={clientsById} onOpenTask={openEditTask} onUpdated={handleUpdated} />
              )}
              {activeView === 'standup' && (
                <StandupView team={activeTeam} tasks={tasks} teams={teams} usersMap={usersMap} monthIdx={monthIdx} onOpenTask={openEditTask} />
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
          defaultTeamId={activeTeamId}
          onClose={closeTaskModal}
          onCreated={handleCreated}
          onUpdated={handleUpdated}
        />
      )}

    </>
  )
}
