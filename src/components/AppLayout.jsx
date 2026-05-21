import { useState, useEffect } from 'react'
import { Outlet } from 'react-router-dom'
import {
  collection, onSnapshot, addDoc, updateDoc,
  doc, deleteDoc, serverTimestamp, query, orderBy
} from 'firebase/firestore'
import { db } from '../firebase'
import Sidebar from './Sidebar'
import ProjectModal from './ProjectModal'

export default function AppLayout() {
  const [projects, setProjects] = useState([])
  const [loading, setLoading] = useState(true)
  const [connected, setConnected] = useState(false)
  const [activeFilter, setActiveFilter] = useState('all')
  const [modalProject, setModalProject] = useState(undefined)
  const [sidebarOpen, setSidebarOpen] = useState(false)

  useEffect(() => {
    const q = query(collection(db, 'projects'), orderBy('createdAt', 'desc'))
    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        setProjects(snapshot.docs.map(d => ({ ...d.data(), id: d.id })))
        setLoading(false)
        setConnected(true)
      },
      () => { setLoading(false); setConnected(false) }
    )
    return unsubscribe
  }, [])

  const createProject = async (data) => {
    await addDoc(collection(db, 'projects'), { ...data, createdAt: serverTimestamp() })
  }

  const updateProject = async (id, updates) => {
    await updateDoc(doc(db, 'projects', id), updates)
  }

  const deleteProject = async (id) => {
    if (window.confirm('¿Eliminar este proyecto? Esta acción no se puede deshacer.')) {
      await deleteDoc(doc(db, 'projects', id))
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
