import { useOutletContext } from 'react-router-dom'
import Dashboard from './components/Dashboard'

function App() {
  const {
    projects,
    loading,
    activeFilter,
    onNewProject,
    onEditProject,
    onUpdateProject,
    onDeleteProject,
    onMenuToggle,
    onExport,
  } = useOutletContext()

  return (
    <Dashboard
      projects={projects}
      loading={loading}
      activeFilter={activeFilter}
      onNewProject={onNewProject}
      onEditProject={onEditProject}
      onUpdateProject={onUpdateProject}
      onDeleteProject={onDeleteProject}
      onMenuToggle={onMenuToggle}
      onExport={onExport}
    />
  )
}

export default App
