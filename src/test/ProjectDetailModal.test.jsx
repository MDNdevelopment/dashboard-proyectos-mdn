import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { vi, describe, it, expect } from 'vitest'
import { createSupabaseMock, makeQuery } from './helpers/supabaseMock'

const { mockUsers } = vi.hoisted(() => ({
  mockUsers: [
    { user_id: 'u-1', first_name: 'María', last_name: 'García', avatar_url: null },
    { user_id: 'u-2', first_name: 'Juan', last_name: 'Pérez', avatar_url: null },
  ],
}))

vi.mock('../supabase', () => ({
  supabase: createSupabaseMock({
    tables: {
      users: () => makeQuery(mockUsers),
    },
  }),
}))

vi.mock('../context/AuthContext', () => ({
  useAuth: vi.fn(() => ({
    userProfile: { user_id: 'u-1', company_id: 'co-1' },
  })),
}))

import ProjectDetailModal from '../components/ProjectDetailModal'

const sampleProject = {
  id: 'uuid-1',
  name: 'Campaña verano',
  team: 'Diseño',
  requirements: 'Brief adjunto',
  status: 'En proceso',
  departments: ['Diseño'],
  members: ['u-1'],
  phases: [
    {
      id: 'phase-1',
      name: 'Fase 1',
      tasks: [
        { id: 'task-1', name: 'Tarea 1', status: 'pendiente' },
        { id: 'task-2', name: 'Tarea 2', status: 'completada' },
      ],
    },
  ],
  createdAt: '2026-05-25T00:00:00Z',
  created_at: '2026-05-25T00:00:00Z',
}

function renderModal(props = {}, project = sampleProject) {
  const handlers = {
    onClose: vi.fn(),
    onUpdate: vi.fn(),
    onEdit: vi.fn(),
    ...props,
  }
  render(<ProjectDetailModal project={project} {...handlers} />)
  return handlers
}

describe('ProjectDetailModal — información de solo lectura', () => {
  it('muestra nombre, departamentos, equipo, requirements y tareas', () => {
    renderModal()
    expect(screen.getByText('Campaña verano')).toBeInTheDocument()
    expect(screen.getAllByText('Diseño').length).toBeGreaterThan(0)
    expect(screen.getByText('Brief adjunto')).toBeInTheDocument()
    expect(screen.getByText('Tarea 1')).toBeInTheDocument()
    expect(screen.getByText('Tarea 2')).toBeInTheDocument()
  })

  it('no tiene controles para añadir o eliminar fases/tareas', () => {
    renderModal()
    expect(screen.queryByText(/Añadir fase/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/Añadir tarea/i)).not.toBeInTheDocument()
  })
})

describe('ProjectDetailModal — encargados', () => {
  it('muestra solo a los usuarios que son miembros del proyecto', async () => {
    renderModal()
    await waitFor(() => expect(screen.getByText('María García')).toBeInTheDocument())
    expect(screen.queryByText('Juan Pérez')).not.toBeInTheDocument()
  })

  it('no muestra la sección de encargados si el proyecto no tiene miembros', () => {
    renderModal({}, { ...sampleProject, members: [] })
    expect(screen.queryByText('Encargados')).not.toBeInTheDocument()
  })
})

describe('ProjectDetailModal — estado del proyecto editable vía select', () => {
  it('cambiar el select de estado del proyecto llama a onUpdate con el nuevo status', () => {
    const { onUpdate } = renderModal()
    const selects = screen.getAllByRole('combobox')
    const statusSelect = selects[0] // primer select es el de estado del proyecto
    fireEvent.change(statusSelect, { target: { value: 'Completado' } })
    expect(onUpdate).toHaveBeenCalledWith({ status: 'Completado' })
  })
})

describe('ProjectDetailModal — estado de actividades editable vía select', () => {
  it('marcar la última tarea pendiente como completada deriva el proyecto a Completado', () => {
    const { onUpdate } = renderModal()
    const selects = screen.getAllByRole('combobox')
    const taskSelect = selects[1] // select de Tarea 1 (pendiente)
    fireEvent.change(taskSelect, { target: { value: 'completada' } })
    expect(onUpdate).toHaveBeenCalledWith({
      phases: [
        {
          id: 'phase-1',
          name: 'Fase 1',
          tasks: [
            { id: 'task-1', name: 'Tarea 1', status: 'completada' },
            { id: 'task-2', name: 'Tarea 2', status: 'completada' },
          ],
        },
      ],
      status: 'Completado',
    })
  })
})

describe('ProjectDetailModal — navegación', () => {
  it('el botón Editar llama a onEdit', () => {
    const { onEdit } = renderModal()
    fireEvent.click(screen.getByRole('button', { name: 'Editar' }))
    expect(onEdit).toHaveBeenCalledTimes(1)
  })

  it('el botón Cerrar llama a onClose', () => {
    const { onClose } = renderModal()
    fireEvent.click(screen.getByRole('button', { name: 'Cerrar' }))
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})
