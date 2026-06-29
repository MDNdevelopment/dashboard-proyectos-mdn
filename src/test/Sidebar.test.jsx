import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { vi } from 'vitest'

vi.mock('../context/AuthContext', () => ({
  useAuth: vi.fn(),
}))

import { useAuth } from '../context/AuthContext'
import Sidebar from '../components/Sidebar'

function renderSidebar(userProfile, { projects = null, activeFilter = 'all', onFilterChange = () => {}, initialRoute = '/' } = {}) {
  useAuth.mockReturnValue({ signOut: vi.fn(), userProfile })
  return render(
    <MemoryRouter initialEntries={[initialRoute]}>
      <Sidebar projects={projects} activeFilter={activeFilter} onFilterChange={onFilterChange} connected={true} />
    </MemoryRouter>
  )
}

const USER = { department_id: 1, access_level: 1, admin: false }

describe('Sidebar — módulo Proyectos', () => {
  // Render from /tareas so projectsOpen starts closed (no ambiguity with sub-item names)
  it('muestra el botón desplegable Proyectos para todos los usuarios', () => {
    renderSidebar(USER, { initialRoute: '/tareas' })
    expect(screen.getByRole('button', { name: /^proyectos$/i })).toBeInTheDocument()
  })

  it('muestra las vistas al abrir el desplegable', () => {
    renderSidebar(USER, { initialRoute: '/tareas' })
    fireEvent.click(screen.getByRole('button', { name: /^proyectos$/i }))
    expect(screen.getByRole('button', { name: /todos los proyectos/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /en proceso/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /pendientes/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /completados/i })).toBeInTheDocument()
  })

  it('muestra los departamentos con proyectos al abrir el desplegable', () => {
    const projects = [
      { id: '1', status: 'En proceso', departments: ['Redes'] },
      { id: '2', status: 'Pendiente', departments: ['Diseño'] },
    ]
    renderSidebar(USER, { projects, initialRoute: '/tareas' })
    fireEvent.click(screen.getByRole('button', { name: /^proyectos$/i }))
    expect(screen.getByRole('button', { name: /redes/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /diseño/i })).toBeInTheDocument()
  })

  it('llama a onFilterChange con la clave correcta al hacer clic en una vista', () => {
    const onFilterChange = vi.fn()
    renderSidebar(USER, { onFilterChange, initialRoute: '/tareas' })
    fireEvent.click(screen.getByRole('button', { name: /^proyectos$/i }))
    fireEvent.click(screen.getByRole('button', { name: /en proceso/i }))
    expect(onFilterChange).toHaveBeenCalledWith('En proceso')
  })

  it('no muestra vistas cuando el desplegable está cerrado', () => {
    renderSidebar(USER, { initialRoute: '/tareas' })
    expect(screen.queryByRole('button', { name: /todos los proyectos/i })).not.toBeInTheDocument()
  })

  it('funciona sin error cuando projects es null', () => {
    expect(() =>
      renderSidebar(USER, { projects: null, initialRoute: '/tareas' })
    ).not.toThrow()
  })
})

describe('Sidebar — enlace Gestión de Tareas', () => {
  it('muestra el botón de Tareas QC / Cierre en la barra lateral', () => {
    renderSidebar({ department_id: 1, access_level: 1, admin: false })
    expect(screen.getByRole('button', { name: /tareas qc \/ cierre/i })).toBeInTheDocument()
  })
})

describe('Sidebar — sección Empresa', () => {
  it('muestra el botón Empresa para todos los usuarios', () => {
    renderSidebar({ department_id: 1, access_level: 1, admin: false })
    expect(screen.getByRole('button', { name: /empresa/i })).toBeInTheDocument()
  })

  it('no muestra enlaces de gestión (Departamentos/Empleados/Preguntas) a no-admin', () => {
    renderSidebar({ department_id: 1, access_level: 3, admin: false })
    expect(screen.queryByRole('link', { name: /departamentos/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /empleados/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /preguntas/i })).not.toBeInTheDocument()
  })
})

describe('Sidebar — sección Evaluaciones', () => {
  it('es visible para usuarios con access_level >= 2', () => {
    renderSidebar({ department_id: 1, access_level: 2, admin: false })
    expect(screen.getByRole('button', { name: /evaluaciones/i })).toBeInTheDocument()
  })

  it('es visible para admin aunque access_level sea 1', () => {
    renderSidebar({ department_id: 1, access_level: 1, admin: true })
    expect(screen.getByRole('button', { name: /evaluaciones/i })).toBeInTheDocument()
  })

  it('es visible para access_level 1 sin admin (muestra Mi Perfil)', () => {
    renderSidebar({ department_id: 1, access_level: 1, admin: false })
    expect(screen.getByRole('button', { name: /evaluaciones/i })).toBeInTheDocument()
  })
})

describe('Sidebar — enlace Notificaciones', () => {
  it('es visible para IT con access_level >= 3', () => {
    renderSidebar({ department_id: 0, access_level: 3, admin: false })
    expect(screen.getByRole('link', { name: /notificaciones/i })).toBeInTheDocument()
  })

  it('es visible para IT con admin=true aunque access_level sea 2', () => {
    renderSidebar({ department_id: 0, access_level: 2, admin: true })
    expect(screen.getByRole('link', { name: /notificaciones/i })).toBeInTheDocument()
  })

  it('no es visible para usuario no IT', () => {
    renderSidebar({ department_id: 1, access_level: 3, admin: false })
    expect(screen.queryByRole('link', { name: /notificaciones/i })).not.toBeInTheDocument()
  })

  it('no es visible para IT sin nivel admin ni flag admin', () => {
    renderSidebar({ department_id: 0, access_level: 2, admin: false })
    expect(screen.queryByRole('link', { name: /notificaciones/i })).not.toBeInTheDocument()
  })

  it('apunta a /tickets/notificaciones', () => {
    renderSidebar({ department_id: 0, access_level: 3 })
    expect(screen.getByRole('link', { name: /notificaciones/i })).toHaveAttribute('href', '/tickets/notificaciones')
  })
})
