import { useOutletContext } from 'react-router-dom'
import Dashboard from './components/Dashboard'

function App() {
  const {
    projects,
    loading,
    onNewProject,
    onEditProject,
    onUpdateProject,
    onDeleteProject,
    onDuplicateProject,
    onMenuToggle,
    onExport,
  } = useOutletContext()

  return (
    <Dashboard
      projects={projects}
      loading={loading}
      onNewProject={onNewProject}
      onEditProject={onEditProject}
      onUpdateProject={onUpdateProject}
      onDeleteProject={onDeleteProject}
      onDuplicateProject={onDuplicateProject}
      onMenuToggle={onMenuToggle}
      onExport={onExport}
    />
  )
}

export default App
