import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../supabase'
import { useAuth } from '../context/AuthContext'
import PanoramaView from '../components/tareas/PanoramaView'
import TeamView from '../components/tareas/TeamView'
import BaseView from '../components/tareas/BaseView'
import KanbanView from '../components/tareas/KanbanView'
import StandupView from '../components/tareas/StandupView'
import TaskModal from '../components/tareas/TaskModal'
import TeamManagerModal from '../components/tareas/TeamManagerModal'

const VIEWS = [
  { key: 'panorama', label: 'Panorama' },
  { key: 'team',     label: 'Dashboard' },
  { key: 'base',     label: 'Base' },
  { key: 'kanban',   label: 'Kanban' },
  { key: 'standup',  label: 'Stand-up' },
]

export default function TareasPage() {
  const { userProfile } = useAuth()
  const [teams, setTeams] = useState([])
  const [teamMembers, setTeamMembers] = useState([])
  const [tasks, setTasks] = useState([])
  const [usersMap, setUsersMap] = useState(new Map())
  const [allUsers, setAllUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [activeView, setActiveView] = useState('panorama')
  const [activeTeamId, setActiveTeamId] = useState(null)
  // null = closed, undefined = new task, object = edit existing
  const [taskModal, setTaskModal] = useState(null)
  const [showTeamManager, setShowTeamManager] = useState(false)

  const activeTeam = teams.find(t => t.id === activeTeamId) ?? null

  const loadAll = useCallback(async () => {
    if (!userProfile?.company_id) return
    setLoading(true)
    const companyId = userProfile.company_id

    const [teamsRes, membersRes, tasksRes, usersRes] = await Promise.all([
      supabase.from('teams').select('*').eq('company_id', companyId).order('created_at'),
      supabase.from('team_members').select('*'),
      supabase.from('tasks').select('*').eq('company_id', companyId).order('created_at', { ascending: false }),
      supabase.from('users').select('user_id, first_name, last_name, avatar_url, access_level').eq('company_id', companyId).order('first_name'),
    ])

    const fetchedTeams = teamsRes.data ?? []
    setTeams(fetchedTeams)
    setTeamMembers(membersRes.data ?? [])
    setTasks(tasksRes.data ?? [])

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
      .on('postgres_changes', { event: '*', schema: 'public', table: 'teams' }, () => loadAll())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'team_members' }, () => loadAll())
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
      <main className="flex-1 overflow-y-auto main-bg h-screen">
        <div className="max-w-7xl mx-auto px-6 py-8">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h1 className="text-[24px] font-bold text-[#111] leading-tight">Gestión de Tareas</h1>
              <p className="text-[13px] text-[#888] mt-0.5">QC · Cierre · Stand-up semanal</p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowTeamManager(true)}
                className="flex items-center gap-2 px-3.5 py-2 rounded-xl border border-[#e0ddd4] text-[13px] font-semibold text-[#555] hover:bg-[#f5f3eb] hover:text-[#111] transition-colors"
              >
                <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.7">
                  <circle cx="6" cy="5.5" r="2.5"/>
                  <path d="M1 14c0-3 2.2-5 5-5" strokeLinecap="round"/>
                  <circle cx="12" cy="8.5" r="2"/>
                  <path d="M9 14c0-2 1.3-3.5 3-3.5s3 1.5 3 3.5" strokeLinecap="round"/>
                </svg>
                Gestionar teams
              </button>
              <button
                onClick={openNewTask}
                className="flex items-center gap-2 bg-[#111] text-white text-[13px] font-bold px-4 py-2.5 rounded-xl hover:bg-[#222] transition-colors"
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
                <span className="text-[10.5px] font-mono font-bold tracking-[0.14em] uppercase text-[#888] mr-1">Team</span>
                {teams.map(t => (
                  <button
                    key={t.id}
                    onClick={() => selectTeam(t.id)}
                    className={`px-3 py-1 rounded-full text-[12.5px] font-semibold transition-all ${
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
            <div className="flex bg-white border border-[#e0ddd4] rounded-xl p-1 w-fit">
              {VIEWS.map(v => (
                <button
                  key={v.key}
                  onClick={() => setActiveView(v.key)}
                  className={`px-4 py-1.5 rounded-lg text-[12.5px] font-semibold transition-all ${
                    activeView === v.key
                      ? 'bg-[#111] text-white'
                      : 'text-[#666] hover:text-[#111] hover:bg-[#f5f3eb]'
                  }`}
                >
                  {v.label}
                </button>
              ))}
            </div>
          </div>

          {!loading && teams.length === 0 && (
            <div className="bg-white rounded-xl border border-[#e0ddd4] p-10 text-center mb-4">
              <p className="text-[15px] font-semibold text-[#888] mb-1">No hay teams creados</p>
              <p className="text-[13px] text-[#bbb] mb-4">Crea el primer team para empezar a gestionar tareas</p>
              <button
                onClick={() => setShowTeamManager(true)}
                className="px-4 py-2 bg-[#111] text-white text-[13px] font-bold rounded-xl hover:bg-[#222] transition-colors"
              >
                Crear primer team
              </button>
            </div>
          )}

          {loading ? (
            <div className="flex items-center justify-center py-20">
              <div className="w-6 h-6 border-2 border-[#FFB800] border-t-transparent rounded-full animate-spin" />
            </div>
          ) : (
            <>
              {activeView === 'panorama' && (
                <PanoramaView teams={teams} tasks={tasks} onSelectTeam={selectTeam} />
              )}
              {activeView === 'team' && (
                <TeamView team={activeTeam} tasks={tasks} usersMap={usersMap} onOpenTask={openEditTask} />
              )}
              {activeView === 'base' && (
                <BaseView tasks={tasks} teams={teams} team={activeTeam} usersMap={usersMap} onOpenTask={openEditTask} />
              )}
              {activeView === 'kanban' && (
                <KanbanView team={activeTeam} tasks={tasks} usersMap={usersMap} onOpenTask={openEditTask} onUpdated={handleUpdated} />
              )}
              {activeView === 'standup' && (
                <StandupView team={activeTeam} tasks={tasks} teams={teams} usersMap={usersMap} onOpenTask={openEditTask} />
              )}
            </>
          )}
        </div>
      </main>

      {taskModal !== null && (
        <TaskModal
          task={taskModal === undefined ? null : taskModal}
          teams={teams}
          users={allUsers}
          defaultTeamId={activeTeamId}
          onClose={closeTaskModal}
          onCreated={handleCreated}
          onUpdated={handleUpdated}
        />
      )}

      {showTeamManager && (
        <TeamManagerModal
          teams={teams}
          teamMembers={teamMembers}
          users={allUsers}
          onClose={() => setShowTeamManager(false)}
          onTeamsChanged={loadAll}
        />
      )}
    </>
  )
}
