import { render, screen, fireEvent } from '@testing-library/react'
import { vi, describe, it, expect } from 'vitest'

vi.mock('../context/AuthContext', () => ({ useAuth: vi.fn() }))

import { useAuth } from '../context/AuthContext'
import ViewAsBanner from '../components/ViewAsBanner'

const JUAN = { user_id: 'juan', first_name: 'Juan' }
const NAIRIM = {
  user_id: 'u-nairim',
  first_name: 'Nairim',
  last_name: 'Pérez',
  access_level: 1,
  admin: false,
  position: { position_name: 'Coordinadora' },
}

function renderBanner(auth) {
  useAuth.mockReturnValue({ stopViewAs: vi.fn(), ...auth })
  return render(<ViewAsBanner />)
}

describe('ViewAsBanner', () => {
  it('no renderiza nada fuera del modo "Ver como"', () => {
    const { container } = renderBanner({ isViewingAs: false, userProfile: JUAN })
    expect(container).toBeEmptyDOMElement()
  })

  it('muestra a quién se está viendo, con cargo y nivel', () => {
    renderBanner({ isViewingAs: true, userProfile: NAIRIM, realUserProfile: JUAN })
    expect(screen.getByText(/nairim pérez/i)).toBeInTheDocument()
    expect(screen.getByText(/coordinadora/i)).toBeInTheDocument()
    expect(screen.getByText(/nivel 1/i)).toBeInTheDocument()
  })

  it('etiqueta a un admin como admin en vez de por nivel', () => {
    renderBanner({
      isViewingAs: true,
      userProfile: { ...NAIRIM, admin: true },
      realUserProfile: JUAN,
    })
    expect(screen.getByText(/admin/i)).toBeInTheDocument()
  })

  it('avisa del límite de datos nombrando la cuenta real', () => {
    renderBanner({ isViewingAs: true, userProfile: NAIRIM, realUserProfile: JUAN })
    expect(screen.getByText(/solo lectura/i)).toBeInTheDocument()
    expect(screen.getByText(/siguen siendo los de juan/i)).toBeInTheDocument()
  })

  it('el botón Salir llama a stopViewAs', () => {
    const stopViewAs = vi.fn()
    renderBanner({ isViewingAs: true, userProfile: NAIRIM, realUserProfile: JUAN, stopViewAs })
    fireEvent.click(screen.getByRole('button', { name: /salir/i }))
    expect(stopViewAs).toHaveBeenCalled()
  })
})
