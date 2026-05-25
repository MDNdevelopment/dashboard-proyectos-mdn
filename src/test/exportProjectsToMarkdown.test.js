import { describe, it, expect } from 'vitest'
import { exportProjectsToMarkdown } from '../utils/exportProjectsToMarkdown'

const fixture = [
  {
    id: 'uuid-1',
    name: 'Campaña verano',
    team: 'Diseño',
    requirements: 'Brief adjunto',
    status: 'En proceso',
    departments: ['Diseño', 'Redes'],
    created_at: '2026-05-25T00:00:00Z',
    members: ['uid-a', 'uid-b'],
    phases: [
      {
        id: 'ph-1',
        name: 'Conceptualización',
        tasks: [
          { id: 't-1', name: 'Moodboard', status: 'completada' },
          { id: 't-2', name: 'Propuesta creativa', status: 'en_proceso' },
        ],
      },
    ],
  },
]

describe('exportProjectsToMarkdown', () => {
  it('includes the project name as a level-2 heading', () => {
    const md = exportProjectsToMarkdown(fixture)
    expect(md).toContain('## Campaña verano')
  })

  it('includes project metadata fields', () => {
    const md = exportProjectsToMarkdown(fixture)
    expect(md).toContain('**Estado**: En proceso')
    expect(md).toContain('**Equipo**: Diseño')
    expect(md).toContain('**Departamentos**: Diseño, Redes')
    expect(md).toContain('**Requerimientos**: Brief adjunto')
  })

  it('renders phases section heading', () => {
    const md = exportProjectsToMarkdown(fixture)
    expect(md).toContain('### Fases')
    expect(md).toContain('#### Conceptualización')
  })

  it('marks completed tasks with [x] and others with [ ]', () => {
    const md = exportProjectsToMarkdown(fixture)
    expect(md).toContain('- [x] Moodboard — completada')
    expect(md).toContain('- [ ] Propuesta creativa — en_proceso')
  })

  it('includes a header with total count', () => {
    const md = exportProjectsToMarkdown(fixture)
    expect(md).toContain('Total: 1 proyecto')
  })

  it('omits Fases section when phases array is empty', () => {
    const noPhases = [{ ...fixture[0], phases: [] }]
    const md = exportProjectsToMarkdown(noPhases)
    expect(md).not.toContain('### Fases')
  })

  it('handles an empty projects array gracefully', () => {
    const md = exportProjectsToMarkdown([])
    expect(md).toContain('Total: 0 proyectos')
    expect(md).not.toContain('##')
  })

  it('resolves member IDs to names using usersMap', () => {
    const usersMap = new Map([['uid-a', 'Ana García'], ['uid-b', 'Luis Pérez']])
    const md = exportProjectsToMarkdown(fixture, usersMap)
    expect(md).toContain('**Participantes**: Ana García, Luis Pérez')
  })

  it('falls back to the raw ID when a member is not in usersMap', () => {
    const usersMap = new Map([['uid-a', 'Ana García']])
    const md = exportProjectsToMarkdown(fixture, usersMap)
    expect(md).toContain('Ana García, uid-b')
  })

  it('omits Participantes line when members array is empty', () => {
    const noMembers = [{ ...fixture[0], members: [] }]
    const md = exportProjectsToMarkdown(noMembers)
    expect(md).not.toContain('Participantes')
  })

  it('includes global progress line in the header', () => {
    // fixture has 2 tasks: 1 completada, 1 en_proceso → 50% per-project → 50% global
    const md = exportProjectsToMarkdown(fixture)
    expect(md).toContain('Progreso global: 50% (1 de 2 tareas completadas)')
  })

  it('includes per-project progress line for each project with tasks', () => {
    const md = exportProjectsToMarkdown(fixture)
    expect(md).toContain('**Progreso**: 50% (1 de 2 tareas completadas)')
  })

  it('omits per-project progress line when a project has no tasks', () => {
    const noTasks = [{ ...fixture[0], phases: [] }]
    const md = exportProjectsToMarkdown(noTasks)
    expect(md).not.toContain('**Progreso**:')
  })

  it('shows 0% global progress when no projects', () => {
    const md = exportProjectsToMarkdown([])
    expect(md).toContain('Progreso global: 0% (0 de 0 tareas completadas)')
  })
})
