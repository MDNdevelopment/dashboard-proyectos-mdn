import { render, screen, fireEvent } from '@testing-library/react'
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest'
import Dashboard from '../components/Dashboard'

const sampleProjects = [
  {
    id: 'uuid-1',
    name: 'Campaña verano',
    team: 'Diseño',
    requirements: 'Brief adjunto',
    status: 'En proceso',
    departments: ['Diseño'],
    phases: [],
    createdAt: '2026-05-25T00:00:00Z',
  },
]

function renderDashboard(activeFilter = 'all', onExport = vi.fn()) {
  return render(
    <Dashboard
      projects={sampleProjects}
      loading={false}
      activeFilter={activeFilter}
      onNewProject={vi.fn()}
      onEditProject={vi.fn()}
      onUpdateProject={vi.fn()}
      onDeleteProject={vi.fn()}
      onMenuToggle={vi.fn()}
      onExport={onExport}
    />
  )
}

describe('Dashboard — botón Exportar', () => {
  it('aparece en la vista "all" (Todos los proyectos)', () => {
    renderDashboard('all')
    expect(screen.getByRole('button', { name: /exportar/i })).toBeInTheDocument()
  })

  it('aparece en la vista "En proceso"', () => {
    renderDashboard('En proceso')
    expect(screen.getByRole('button', { name: /exportar/i })).toBeInTheDocument()
  })

  it('aparece en la vista "Pendiente"', () => {
    renderDashboard('Pendiente')
    expect(screen.getByRole('button', { name: /exportar/i })).toBeInTheDocument()
  })

  it('aparece en la vista "Completado"', () => {
    renderDashboard('Completado')
    expect(screen.getByRole('button', { name: /exportar/i })).toBeInTheDocument()
  })

  it('NO aparece en vistas de departamento (dept:*)', () => {
    renderDashboard('dept:Redes')
    expect(screen.queryByRole('button', { name: /exportar/i })).not.toBeInTheDocument()
  })

  it('llama a onExport al hacer clic', () => {
    const onExport = vi.fn()
    renderDashboard('all', onExport)
    fireEvent.click(screen.getByRole('button', { name: /exportar/i }))
    expect(onExport).toHaveBeenCalledTimes(1)
  })
})

describe('Dashboard — descarga de archivo al exportar', () => {
  let createObjectURL
  let revokeObjectURL
  let clickSpy

  beforeEach(async () => {
    createObjectURL = vi.fn(() => 'blob:mock-url')
    revokeObjectURL = vi.fn()
    URL.createObjectURL = createObjectURL
    URL.revokeObjectURL = revokeObjectURL
    clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('crea un Blob y dispara descarga al llamar a onExport directamente', async () => {
    // Import the util directly to test the download mechanics
    const { exportProjectsToMarkdown, downloadMarkdown } = await import('../utils/exportProjectsToMarkdown')
    const content = exportProjectsToMarkdown(sampleProjects)
    downloadMarkdown('test.md', content)

    expect(createObjectURL).toHaveBeenCalledTimes(1)
    const blob = createObjectURL.mock.calls[0][0]
    expect(blob).toBeInstanceOf(Blob)
    const text = await blob.text()
    expect(text).toContain('Campaña verano')
    expect(clickSpy).toHaveBeenCalledTimes(1)
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:mock-url')
  })
})
