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
    created_at: '2026-05-25T00:00:00Z',
  },
  {
    id: 'uuid-2',
    name: 'Rediseño logo',
    team: 'Redes',
    requirements: '',
    status: 'Pendiente',
    departments: ['Redes'],
    phases: [],
    createdAt: '2026-05-26T00:00:00Z',
    created_at: '2026-05-26T00:00:00Z',
  },
]

function renderDashboard(onExport = vi.fn()) {
  return render(
    <Dashboard
      projects={sampleProjects}
      loading={false}
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
  it('siempre aparece en la vista principal', () => {
    renderDashboard()
    expect(screen.getByRole('button', { name: /exportar/i })).toBeInTheDocument()
  })

  it('llama a onExport al hacer clic', () => {
    const onExport = vi.fn()
    renderDashboard(onExport)
    fireEvent.click(screen.getByRole('button', { name: /exportar/i }))
    expect(onExport).toHaveBeenCalledTimes(1)
  })
})

describe('Dashboard — filtros de estado y departamento', () => {
  it('muestra el select de Estado con opción por defecto', () => {
    renderDashboard()
    const select = screen.getByDisplayValue('Estado')
    expect(select).toBeInTheDocument()
  })

  it('muestra el select de Departamento con opción por defecto', () => {
    renderDashboard()
    const select = screen.getByDisplayValue('Departamento')
    expect(select).toBeInTheDocument()
  })

  it('filtrar por Estado muestra solo los proyectos del estado seleccionado', () => {
    renderDashboard()
    const statusSelect = screen.getByDisplayValue('Estado')
    fireEvent.change(statusSelect, { target: { value: 'Pendiente' } })
    // Solo "Rediseño logo" es Pendiente
    expect(screen.getByText('Rediseño logo')).toBeInTheDocument()
    expect(screen.queryByText('Campaña verano')).not.toBeInTheDocument()
  })

  it('filtrar por Departamento muestra solo proyectos del departamento seleccionado', () => {
    renderDashboard()
    const deptSelect = screen.getByDisplayValue('Departamento')
    fireEvent.change(deptSelect, { target: { value: 'Redes' } })
    // Solo "Rediseño logo" es de Redes
    expect(screen.getByText('Rediseño logo')).toBeInTheDocument()
    expect(screen.queryByText('Campaña verano')).not.toBeInTheDocument()
  })

  it('los filtros de Estado y Departamento se aplican en conjunto (AND)', () => {
    renderDashboard()
    const statusSelect = screen.getByDisplayValue('Estado')
    const deptSelect = screen.getByDisplayValue('Departamento')
    // Filtrar por Pendiente + Diseño → ningún proyecto coincide (Rediseño logo es Pendiente pero de Redes, no Diseño)
    fireEvent.change(statusSelect, { target: { value: 'Pendiente' } })
    fireEvent.change(deptSelect, { target: { value: 'Diseño' } })
    expect(screen.queryByText('Campaña verano')).not.toBeInTheDocument()
    expect(screen.queryByText('Rediseño logo')).not.toBeInTheDocument()
  })

  it('volver a "all" en Estado muestra todos los proyectos', () => {
    renderDashboard()
    const statusSelect = screen.getByDisplayValue('Estado')
    fireEvent.change(statusSelect, { target: { value: 'Pendiente' } })
    fireEvent.change(statusSelect, { target: { value: 'all' } })
    expect(screen.getByText('Campaña verano')).toBeInTheDocument()
    expect(screen.getByText('Rediseño logo')).toBeInTheDocument()
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
