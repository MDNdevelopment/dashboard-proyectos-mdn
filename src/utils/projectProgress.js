export function getProjectTasks(project) {
  return project.phases?.flatMap(ph => ph.tasks ?? []) ?? []
}

export function getProjectProgress(project) {
  const tasks = getProjectTasks(project)
  const completed = tasks.filter(t => t.status === 'completada').length
  const percent = tasks.length ? Math.round(completed / tasks.length * 100) : 0
  return { completed, total: tasks.length, percent }
}

// Deriva el estado del proyecto a partir del estado de sus tareas.
// - Sin tareas: se conserva el fallback (estado actual del proyecto).
// - Todas completadas: "Completado".
// - Todas pendientes: "Pendiente".
// - Cualquier otra mezcla (incluye completadas + pendientes sin nada en curso): "En proceso",
//   porque ya hay avance parcial aunque ninguna tarea esté explícitamente "en_proceso"/"pausada".
export function deriveProjectStatus(phases, fallback) {
  const tasks = getProjectTasks({ phases })
  if (!tasks.length) return fallback
  if (tasks.every(t => t.status === 'completada')) return 'Completado'
  if (tasks.every(t => t.status === 'pendiente')) return 'Pendiente'
  return 'En proceso'
}

export function getGlobalProgress(projects) {
  if (!projects.length) return { percent: 0, doneTasks: 0, totalTasks: 0 }
  const all = projects.flatMap(getProjectTasks)
  const doneTasks = all.filter(t => t.status === 'completada').length
  const totalTasks = all.length
  // Unweighted mean of per-project percentages — matches Dashboard "Avance global" card
  const percent = Math.round(
    projects.reduce((s, p) => s + getProjectProgress(p).percent, 0) / projects.length
  )
  return { percent, doneTasks, totalTasks }
}
