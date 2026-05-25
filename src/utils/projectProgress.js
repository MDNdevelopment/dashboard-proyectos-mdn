export function getProjectTasks(project) {
  return project.phases?.flatMap(ph => ph.tasks ?? []) ?? []
}

export function getProjectProgress(project) {
  const tasks = getProjectTasks(project)
  const completed = tasks.filter(t => t.status === 'completada').length
  const percent = tasks.length ? Math.round(completed / tasks.length * 100) : 0
  return { completed, total: tasks.length, percent }
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
