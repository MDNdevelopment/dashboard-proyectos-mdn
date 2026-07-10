import { render, screen, fireEvent } from '@testing-library/react'
import { vi, describe, it, expect } from 'vitest'
import ProjectCard from '../components/ProjectCard'

const sampleProject = {
  id: 'uuid-1',
  name: 'Campaña verano',
  team: 'Diseño',
  requirements: 'Brief adjunto',
  status: 'En proceso',
  departments: ['Diseño'],
  phases: [
    {
      id: 'phase-1',
      name: 'Fase 1',
      tasks: [{ id: 'task-1', name: 'Tarea 1', status: 'pendiente' }],
    },
  ],
  createdAt: '2026-05-25T00:00:00Z',
  created_at: '2026-05-25T00:00:00Z',
}

function renderCard(props = {}, project = sampleProject) {
  const handlers = {
    onView: vi.fn(),
    onEdit: vi.fn(),
    onDelete: vi.fn(),
    onDuplicate: vi.fn(),
    ...props,
  }
  render(<ProjectCard project={project} {...handlers} />)
  return handlers
}

describe('ProjectCard — clic en la card abre el modal de detalle', () => {
  it('un clic en el título/cuerpo de la card llama a onView', () => {
    const { onView } = renderCard()
    fireEvent.click(screen.getByText('Campaña verano'))
    expect(onView).toHaveBeenCalledTimes(1)
  })

  it('el botón Editar llama a onEdit una sola vez y no llama a onView', () => {
    const { onEdit, onView } = renderCard()
    fireEvent.click(screen.getByRole('button', { name: 'Editar' }))
    expect(onEdit).toHaveBeenCalledTimes(1)
    expect(onView).not.toHaveBeenCalled()
  })

  it('el botón Duplicar llama a onDuplicate y no a onView ni onEdit', () => {
    const { onDuplicate, onView, onEdit } = renderCard()
    fireEvent.click(screen.getByRole('button', { name: 'Duplicar' }))
    expect(onDuplicate).toHaveBeenCalledTimes(1)
    expect(onView).not.toHaveBeenCalled()
    expect(onEdit).not.toHaveBeenCalled()
  })

  it('el botón de eliminar llama a onDelete y no a onView', () => {
    const { onDelete, onView } = renderCard()
    const buttons = screen.getAllByRole('button')
    // El botón eliminar es el último del footer (icono X, sin texto accesible)
    const deleteBtn = buttons[buttons.length - 1]
    fireEvent.click(deleteBtn)
    expect(onDelete).toHaveBeenCalledTimes(1)
    expect(onView).not.toHaveBeenCalled()
  })
})

describe('ProjectCard — estado como badge de solo lectura', () => {
  it('muestra la etiqueta del estado sin controles interactivos', () => {
    renderCard()
    expect(screen.getByText('En proceso')).toBeInTheDocument()
    // No debe haber ningún dropdown/select de estado en la card
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument()
  })

  it('ya no muestra la lista desplegable de fases/tareas', () => {
    renderCard()
    expect(screen.queryByText('Tarea 1')).not.toBeInTheDocument()
    expect(screen.queryByText(/Ver \d+ fase/)).not.toBeInTheDocument()
  })
})

describe('ProjectCard — anillo de progreso', () => {
  it('muestra el porcentaje dentro del anillo y el conteo de tareas', () => {
    renderCard()
    // sampleProject: 1 tarea pendiente de 1 → 0%
    expect(screen.getByText('0%')).toBeInTheDocument()
    expect(screen.getByText('0 de 1 tareas completadas')).toBeInTheDocument()
  })

  it('cuando el proyecto no tiene tareas, muestra un anillo en 0% con fallback "Sin tareas"', () => {
    renderCard({}, { ...sampleProject, phases: [] })
    expect(screen.getByText('0%')).toBeInTheDocument()
    expect(screen.getByText('Sin tareas')).toBeInTheDocument()
  })
})
