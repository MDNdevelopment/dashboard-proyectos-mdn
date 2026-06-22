import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { vi } from 'vitest'

vi.mock('../context/AuthContext', () => ({
  useAuth: vi.fn(),
}))

import { useAuth } from '../context/AuthContext'
import Sidebar from '../components/Sidebar'

function renderSidebar(userProfile) {
  useAuth.mockReturnValue({ signOut: vi.fn(), userProfile })
  return render(
    <MemoryRouter>
      <Sidebar projects={null} activeFilter="all" onFilterChange={() => {}} onNewProject={() => {}} connected={true} />
    </MemoryRouter>
  )
}

describe('Sidebar — enlace Gestión de Tareas', () => {
  it('muestra el botón de Tareas QC / Cierre en la barra lateral', () => {
    renderSidebar({ department_id: 1, access_level: 1, admin: false })
    expect(screen.getByRole('button', { name: /tareas qc \/ cierre/i })).toBeInTheDocument()
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
