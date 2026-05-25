import { useState, useEffect } from 'react'
import { Outlet } from 'react-router-dom'
import { supabase } from '../supabase'
import Sidebar from './Sidebar'
import ProjectModal from './ProjectModal'

const normalize = (row) => ({ ...row, createdAt: row.created_at })

export default function AppLayout() {
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
            if (payload.eventType === 'INSERT') return [normalize(payload.new), ...prev]
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

  const updateProject = async (id, updates) => {
    await supabase.from('projects').update(updates).eq('id', id)
  }

  const deleteProject = async (id) => {
    if (window.confirm('¿Eliminar este proyecto? Esta acción no se puede deshacer.')) {
      await supabase.from('projects').delete().eq('id', id)
    }
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
          onNewProject={() => setModalProject(null)}
          connected={connected}
        />
      </div>

      <div className="flex-1 min-w-0">
        <Outlet context={{
          projects,
          loading,
          activeFilter,
          onNewProject: () => setModalProject(null),
          onEditProject: (p) => setModalProject(p),
          onUpdateProject: updateProject,
          onDeleteProject: deleteProject,
          onMenuToggle: () => setSidebarOpen(o => !o),
        }} />
      </div>

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
