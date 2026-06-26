import { useState, useEffect } from 'react'
import { Outlet, useSearchParams } from 'react-router-dom'
import { supabase } from '../supabase'
import Sidebar from './Sidebar'
import ProjectModal from './ProjectModal'
import MDNLogo from './MDNLogo'
import InstallBanner from './InstallBanner'
import { exportProjectsToMarkdown, downloadMarkdown } from '../utils/exportProjectsToMarkdown'

const normalize = (row) => ({ ...row, createdAt: row.created_at })

export default function AppLayout() {
  const [searchParams, setSearchParams] = useSearchParams()
  const [projects, setProjects] = useState([])
  const [loading, setLoading] = useState(true)
  const [connected, setConnected] = useState(false)
  const [activeFilter, setActiveFilter] = useState('all')
  const [modalProject, setModalProject] = useState(undefined)
  const [sidebarOpen, setSidebarOpen] = useState(false)

  useEffect(() => {
    let channel

    const init = async () => {
      const { data, error } = await supabase
        .from('projects')
        .select('*')
        .order('created_at', { ascending: false })

      if (error) {
        setLoading(false)
        setConnected(false)
        return
      }

      setProjects(data.map(normalize))
      setLoading(false)
      setConnected(true)

      channel = supabase
        .channel('projects-changes')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'projects' }, (payload) => {
          setProjects(prev => {
            if (payload.eventType === 'INSERT') return prev.some(p => p.id === payload.new.id) ? prev : [normalize(payload.new), ...prev]
            if (payload.eventType === 'UPDATE') return prev.map(p => p.id === payload.new.id ? normalize(payload.new) : p)
            if (payload.eventType === 'DELETE') return prev.filter(p => p.id !== payload.old.id)
            return prev
          })
        })
        .subscribe()
    }

    init()
    return () => { if (channel) supabase.removeChannel(channel) }
  }, [])

  const createProject = async (data) => {
    await supabase.from('projects').insert(data)
  }

  const duplicateProject = async (project) => {
    const regenIds = (phases) => (phases ?? []).map(ph => ({
      ...ph,
      id: Math.random().toString(36).slice(2),
      tasks: (ph.tasks ?? []).map(t => ({ ...t, id: Math.random().toString(36).slice(2) })),
    }))
    const { data, error } = await supabase
      .from('projects')
      .insert({
        name: `Copia de ${project.name}`,
        team: project.team,
        requirements: project.requirements,
        departments: project.departments ?? [],
        phases: regenIds(project.phases),
        status: 'Pendiente',
      })
      .select()
      .single()
    if (error || !data) return
    setProjects(prev => prev.some(p => p.id === data.id) ? prev : [normalize(data), ...prev])
  }

  const updateProject = async (id, updates) => {
    await supabase.from('projects').update(updates).eq('id', id)
  }

  const deleteProject = async (id) => {
    if (window.confirm('¿Eliminar este proyecto? Esta acción no se puede deshacer.')) {
      await supabase.from('projects').delete().eq('id', id)
    }
  }

  // Abrir el modal de un proyecto específico desde ?projectId=uuid (deeplink desde Mi Perfil v2)
  useEffect(() => {
    const projectId = searchParams.get('projectId')
    if (!projectId || projects.length === 0) return
    const project = projects.find(p => p.id === projectId)
    if (project) setModalProject(project)
    // Limpiar el param del URL después de procesar
    setSearchParams(prev => {
      const next = new URLSearchParams(prev)
      next.delete('projectId')
      return next
    }, { replace: true })
  }, [searchParams, projects])

  const exportProjects = async () => {
    const { data: users } = await supabase
      .from('users')
      .select('user_id, first_name, last_name')
    const usersMap = new Map(
      (users ?? []).map(u => [u.user_id, `${u.first_name} ${u.last_name}`.trim()])
    )
    const today = new Date().toISOString().slice(0, 10)
    downloadMarkdown(`proyectos-mdn-${today}.md`, exportProjectsToMarkdown(projects, usersMap))
  }

  return (
    <div className="flex min-h-screen bg-[#f2f0e8]">
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/60 z-40 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <div className={`fixed lg:sticky top-0 h-screen z-50 transition-transform duration-200 lg:translate-x-0 ${sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}`}>
        <Sidebar
          projects={projects}
          activeFilter={activeFilter}
          onFilterChange={(f) => { setActiveFilter(f); setSidebarOpen(false) }}
          connected={connected}
        />
      </div>

      <div className="flex-1 min-w-0 flex flex-col">
        {/* Mobile top bar — visible on all routes */}
        <div className="lg:hidden flex items-center px-5 py-3.5 bg-white border-b border-[#e8e5db] sticky top-0 z-30">
          <button onClick={() => setSidebarOpen(o => !o)} className="text-[#777] hover:text-[#111] transition-colors flex-shrink-0">
            <svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8">
              <path d="M3 5h14M3 10h14M3 15h14" strokeLinecap="round"/>
            </svg>
          </button>
          <div className="flex-1 flex justify-center">
            <MDNLogo size={32} />
          </div>
          <div className="w-[18px] flex-shrink-0" />
        </div>

        <Outlet context={{
          projects,
          loading,
          activeFilter,
          onNewProject: () => setModalProject(null),
          onEditProject: (p) => setModalProject(p),
          onUpdateProject: updateProject,
          onDeleteProject: deleteProject,
          onDuplicateProject: duplicateProject,
          onMenuToggle: () => setSidebarOpen(o => !o),
          onExport: exportProjects,
        }} />
      </div>

      <InstallBanner />

      {modalProject !== undefined && (
        <ProjectModal
          project={modalProject}
          onClose={() => setModalProject(undefined)}
          onSave={async (data) => {
            if (modalProject) {
              await updateProject(modalProject.id, data)
            } else {
              await createProject(data)
            }
            setModalProject(undefined)
          }}
        />
      )}
    </div>
  )
}
