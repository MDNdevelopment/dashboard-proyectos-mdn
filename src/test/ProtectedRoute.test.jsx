import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { vi } from 'vitest'
import ProtectedRoute from '../components/ProtectedRoute'

vi.mock('../context/AuthContext', () => ({
  useAuth: vi.fn(),
}))

import { useAuth } from '../context/AuthContext'

function renderRoute(children) {
  return render(<MemoryRouter><ProtectedRoute>{children}</ProtectedRoute></MemoryRouter>)
}

describe('ProtectedRoute', () => {
  it('muestra spinner mientras carga', () => {
    useAuth.mockReturnValue({ session: null, loading: true })
    const { container } = renderRoute(<div>Contenido</div>)
    expect(container.querySelector('.animate-spin')).toBeInTheDocument()
    expect(screen.queryByText('Contenido')).not.toBeInTheDocument()
  })

  it('redirige a /login si no hay sesión', () => {
    useAuth.mockReturnValue({ session: null, loading: false })
    renderRoute(<div>Contenido</div>)
    expect(screen.queryByText('Contenido')).not.toBeInTheDocument()
  })

  it('renderiza hijos cuando hay sesión activa', () => {
    useAuth.mockReturnValue({ session: { user: { id: '1' } }, loading: false })
    renderRoute(<div>Contenido protegido</div>)
    expect(screen.getByText('Contenido protegido')).toBeInTheDocument()
  })
})
