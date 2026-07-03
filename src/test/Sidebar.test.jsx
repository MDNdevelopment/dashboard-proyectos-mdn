import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { vi } from 'vitest'

vi.mock('../context/AuthContext', () => ({
  useAuth: vi.fn(),
}))

import { useAuth } from '../context/AuthContext'
import Sidebar from '../components/Sidebar'

function renderSidebar(userProfile, { initialRoute = '/' } = {}) {
  // permissionsLoaded + can abierto: simula permisos ya cargados sin reglas de exclusión,
  // el contrato de useAuth desde el fix del flash de módulos (21e5e2e).
  useAuth.mockReturnValue({ signOut: vi.fn(), userProfile, can: () => true, permissionsLoaded: true })
  return render(
    <MemoryRouter initialEntries={[initialRoute]}>
      <Sidebar />
    </MemoryRouter>
  )
}

const USER = { department_id: 1, access_level: 1, admin: false }

describe('Sidebar — módulo Proyectos', () => {
  it('muestra el enlace directo Proyectos (sin desplegable)', () => {
    renderSidebar(USER)
    expect(screen.getByRole('link', { name: /^proyectos$/i })).toBeInTheDocument()
  })

  it('el enlace Proyectos apunta a /', () => {
    renderSidebar(USER)
    expect(screen.getByRole('link', { name: /^proyectos$/i })).toHaveAttribute('href', '/')
  })

  it('no hay botón desplegable para Proyectos', () => {
    renderSidebar(USER, { initialRoute: '/tareas' })
    // No debe existir un button (no un link) con el nombre Proyectos
    expect(screen.queryByRole('button', { name: /^proyectos$/i })).not.toBeInTheDocument()
  })

  it('funciona sin error cuando no hay userProfile', () => {
    expect(() => renderSidebar(null)).not.toThrow()
  })
})

describe('Sidebar — módulo Campañas', () => {
  it('muestra el enlace directo Campañas (sin desplegable)', () => {
    renderSidebar(USER)
    expect(screen.getByRole('link', { name: /^campañas$/i })).toBeInTheDocument()
  })

  it('el enlace Campañas apunta a /ads', () => {
    renderSidebar(USER)
    expect(screen.getByRole('link', { name: /^campañas$/i })).toHaveAttribute('href', '/ads')
  })
})

describe('Sidebar — módulo Gestión de Tareas', () => {
  it('muestra el enlace directo con el nuevo nombre "Gestión de Tareas"', () => {
    renderSidebar(USER)
    expect(screen.getByRole('link', { name: /gestión de tareas/i })).toBeInTheDocument()
  })

  it('el enlace apunta a /tareas', () => {
    renderSidebar(USER)
    expect(screen.getByRole('link', { name: /gestión de tareas/i })).toHaveAttribute('href', '/tareas')
  })

  it('no aparece el nombre antiguo "Tareas QC / Cierre"', () => {
    renderSidebar(USER)
    expect(screen.queryByText(/tareas qc \/ cierre/i)).not.toBeInTheDocument()
  })
})

describe('Sidebar — módulo Empresa', () => {
  it('muestra el enlace directo Empresa (sin desplegable)', () => {
    renderSidebar(USER)
    expect(screen.getByRole('link', { name: /^empresa$/i })).toBeInTheDocument()
  })

  it('el enlace Empresa apunta a /empresa', () => {
    renderSidebar(USER)
    expect(screen.getByRole('link', { name: /^empresa$/i })).toHaveAttribute('href', '/empresa')
  })

  it('no muestra sub-enlaces de Empresa en el sidebar (Departamentos/Empleados/etc.)', () => {
    renderSidebar(USER)
    expect(screen.queryByRole('link', { name: /^departamentos$/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /^empleados$/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /^permisos$/i })).not.toBeInTheDocument()
  })
})

describe('Sidebar — módulo Reportes', () => {
  it('muestra el enlace directo Reportes (sin desplegable)', () => {
    renderSidebar(USER)
    expect(screen.getByRole('link', { name: /^reportes$/i })).toBeInTheDocument()
  })

  it('el enlace Reportes apunta a /reportes', () => {
    renderSidebar(USER)
    expect(screen.getByRole('link', { name: /^reportes$/i })).toHaveAttribute('href', '/reportes')
  })
})

describe('Sidebar — sección Evaluaciones (sigue siendo desplegable)', () => {
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

describe('Sidebar — Soporte Técnico (link único, sin desplegable)', () => {
  it('muestra el enlace directo Soporte Técnico (sin desplegable)', () => {
    renderSidebar(USER)
    expect(screen.getByRole('link', { name: /soporte técnico/i })).toBeInTheDocument()
  })

  it('el enlace Soporte Técnico apunta a /tickets', () => {
    renderSidebar(USER)
    expect(screen.getByRole('link', { name: /soporte técnico/i })).toHaveAttribute('href', '/tickets')
  })

  it('no hay botón desplegable para Soporte Técnico', () => {
    renderSidebar(USER)
    expect(screen.queryByRole('button', { name: /soporte técnico/i })).not.toBeInTheDocument()
  })

  it('no muestra sub-enlaces en el sidebar (las secciones son tabs dentro de la página)', () => {
    renderSidebar({ department_id: 0, access_level: 3, admin: false })
    expect(screen.queryByRole('link', { name: /^lista de tickets$/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /^analíticas$/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /^notificaciones$/i })).not.toBeInTheDocument()
  })
})
