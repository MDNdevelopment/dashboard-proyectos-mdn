import { render, screen } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { vi } from 'vitest'

vi.mock('../context/AuthContext', () => ({
  useAuth: vi.fn(),
}))

import { useAuth } from '../context/AuthContext'
import RequireAdmin from '../components/RequireAdmin'

function renderWithProfile(userProfile, { loading = false } = {}) {
  useAuth.mockReturnValue({ loading, userProfile })
  return render(
    <MemoryRouter initialEntries={['/feedback']}>
      <Routes>
        <Route
          path="/feedback"
          element={
            <RequireAdmin>
              <div>Panel admin</div>
            </RequireAdmin>
          }
        />
        <Route path="/" element={<div>Inicio</div>} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('RequireAdmin', () => {
  it('muestra el spinner mientras loading es true', () => {
    renderWithProfile({ admin: true }, { loading: true })
    expect(screen.queryByText('Panel admin')).not.toBeInTheDocument()
  })

  it('deja pasar a un usuario admin', () => {
    renderWithProfile({ admin: true })
    expect(screen.getByText('Panel admin')).toBeInTheDocument()
  })

  it('redirige a Inicio a un usuario no admin', () => {
    renderWithProfile({ admin: false })
    expect(screen.queryByText('Panel admin')).not.toBeInTheDocument()
    expect(screen.getByText('Inicio')).toBeInTheDocument()
  })

  it('redirige a Inicio cuando no hay perfil de usuario', () => {
    renderWithProfile(null)
    expect(screen.queryByText('Panel admin')).not.toBeInTheDocument()
    expect(screen.getByText('Inicio')).toBeInTheDocument()
  })
})
