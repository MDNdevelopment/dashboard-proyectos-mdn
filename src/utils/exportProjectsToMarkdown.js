import { getProjectProgress } from './projectProgress'

const TASK_CHECKBOX = { completada: '[x]', pendiente: '[ ]', en_proceso: '[ ]', pausada: '[ ]' }

export function exportProjectsToMarkdown(projects, usersMap = new Map()) {
  const today = new Date().toISOString().slice(0, 10)
  const completedProjects = projects.filter(p => p.status === 'Completado').length
  const globalPercent = projects.length ? Math.round(completedProjects / projects.length * 100) : 0
  const lines = [
    `# Proyectos MDN Publicidad — ${today}`,
    '',
    `Total: ${projects.length} proyecto${projects.length !== 1 ? 's' : ''}`,
    `Progreso global: ${globalPercent}% (${completedProjects} de ${projects.length} proyectos completados)`,
    '',
  ]

  for (const p of projects) {
    lines.push('---', '')
    lines.push(`## ${p.name ?? 'Sin nombre'}`)

    if (p.status)       lines.push(`- **Estado**: ${p.status}`)
    const { completed, total: pTotal, percent: pPercent } = getProjectProgress(p)
    if (pTotal > 0)     lines.push(`- **Progreso**: ${pPercent}% (${completed} de ${pTotal} tareas completadas)`)
    if (p.team)         lines.push(`- **Equipo**: ${p.team}`)
    const depts = p.departments ?? (p.department ? [p.department] : [])
    if (depts.length)   lines.push(`- **Departamentos**: ${depts.join(', ')}`)
    const created = p.createdAt ?? p.created_at
    if (created)        lines.push(`- **Creado**: ${created}`)
    if (p.requirements) lines.push(`- **Requerimientos**: ${p.requirements}`)

    const memberIds = p.members ?? []
    if (memberIds.length) {
      const names = memberIds.map(id => usersMap.get(id) ?? id).join(', ')
      lines.push(`- **Participantes**: ${names}`)
    }

    const phases = p.phases ?? []
    if (phases.length) {
      lines.push('', '### Fases')
      for (const ph of phases) {
        lines.push(`#### ${ph.name ?? 'Fase'}`)
        for (const t of ph.tasks ?? []) {
          const box = TASK_CHECKBOX[t.status] ?? '[ ]'
          lines.push(`- ${box} ${t.name ?? 'Tarea'} — ${t.status ?? ''}`)
        }
      }
    }

    lines.push('')
  }

  return lines.join('\n')
}

export function downloadMarkdown(filename, content) {
  const blob = new Blob([content], { type: 'text/markdown;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}
