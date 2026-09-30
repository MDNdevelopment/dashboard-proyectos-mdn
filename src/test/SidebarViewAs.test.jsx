/**
 * Selector "Ver como" del popover del Sidebar (modo dev, src/lib/viewAs.js).
 * Archivo aparte de Sidebar.test.jsx porque necesita mockear `../supabase`
 * (el selector carga la lista de empleados) y vi.mock aplica a todo el archivo.
 */
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { vi, describe, it, expect, beforeEach } from 'vitest'

const { mockFrom } = vi.hoisted(() => ({ mockFrom: vi.fn() }))

vi.mock('../supabase', () => ({
  supabase: {
    from: mockFrom,
    auth: { getSession: vi.fn().mockResolvedValue({ data: { session: null } }) },
    channel: vi.fn(() => ({ on: vi.fn().mockReturnThis(), subscribe: vi.fn() })),
    removeChannel: vi.fn(),
  },
}))

vi.mock('../context/AuthContext', () => ({ useAuth: vi.fn() }))

import { useAuth } from '../context/AuthContext'
import Sidebar from '../components/Sidebar'

const JUAN = '2d50a4e5-35db-4be5-b27a-a24d1282ce82'
const JUAN_PROFILE = {
  user_id: JUAN,
  first_name: 'Juan',
  last_name: 'Lauretta',
  company_id: 'co-1',
  admin: true,
  access_level: 3,
}
const NAIRIM = {
  user_id: 'u-nairim',
  first_name: 'Nairim',
  last_name: 'Pérez',
  company_id: 'co-1',
  admin: false,
  access_level: 1,
}

const EMPLEADOS = [
  { user_id: JUAN, first_name: 'Juan', last_name: 'Lauretta', access_level: 3, admin: true },
  { user_id: 'u-nairim', first_name: 'Nairim', last_name: 'Pérez', access_level: 1, admin: false },
]

function renderSidebar(auth) {
  useAuth.mockReturnValue({
    signOut: vi.fn(),
    can: () => true,
    permissionsLoaded: true,
    startViewAs: vi.fn(),
    stopViewAs: vi.fn(),
    ...auth,
  })
  return render(
    <MemoryRouter>
      <Sidebar />
    </MemoryRouter>,
  )
}

function openMenu() {
  fireEvent.click(screen.getByRole('button', { name: /opciones de usuario/i }))
}

beforeEach(() => {
  vi.clearAllMocks()
  // `order` cierra la consulta del selector; `range` la de NotificationBell.
  const chain = {
    select: vi.fn().mockReturnThis(),
    is: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    range: vi.fn(() => Promise.resolve({ data: [], error: null })),
    order: vi.fn(function order() {
      const promise = Promise.resolve({ data: EMPLEADOS, error: null })
      promise.range = chain.range
      return promise
    }),
  }
  mockFrom.mockReturnValue(chain)
})

describe('Sidebar — selector "Ver como"', () => {
  it('no aparece para un admin cualquiera', () => {
    renderSidebar({ userProfile: { ...NAIRIM, admin: true }, realUserProfile: null })
    openMenu()
    expect(screen.queryByLabelText(/ver la plataforma como otro usuario/i)).not.toBeInTheDocument()
  })

  it('aparece para el desarrollador y lista a los empleados', async () => {
    renderSidebar({ userProfile: JUAN_PROFILE, realUserProfile: JUAN_PROFILE })
    openMenu()

    const select = screen.getByLabelText(/ver la plataforma como otro usuario/i)
    expect(select).toBeInTheDocument()
    await waitFor(() => expect(screen.getByRole('option', { name: /nairim/i })).toBeInTheDocument())
    // La propia cuenta no se ofrece como destino: es la opción de salida.
    expect(screen.queryByRole('option', { name: /lauretta/i })).not.toBeInTheDocument()
  })

  it('elegir a alguien llama a startViewAs con su user_id', async () => {
    const startViewAs = vi.fn()
    renderSidebar({ userProfile: JUAN_PROFILE, realUserProfile: JUAN_PROFILE, startViewAs })
    openMenu()
    await waitFor(() => screen.getByRole('option', { name: /nairim/i }))

    fireEvent.change(screen.getByLabelText(/ver la plataforma como otro usuario/i), {
      target: { value: 'u-nairim' },
    })
    expect(startViewAs).toHaveBeenCalledWith('u-nairim')
  })

  it('sigue visible mientras se suplanta, gateado por el perfil real', async () => {
    renderSidebar({ userProfile: NAIRIM, realUserProfile: JUAN_PROFILE, isViewingAs: true })
    openMenu()
    const select = screen.getByLabelText(/ver la plataforma como otro usuario/i)
    // Las opciones se cargan al abrir el popover; hasta que llegan, el <select>
    // no puede tomar el valor del suplantado.
    await waitFor(() => expect(select).toHaveValue('u-nairim'))
  })

  it('volver a "Yo" llama a stopViewAs', () => {
    const stopViewAs = vi.fn()
    renderSidebar({
      userProfile: NAIRIM,
      realUserProfile: JUAN_PROFILE,
      isViewingAs: true,
      stopViewAs,
    })
    openMenu()
    fireEvent.change(screen.getByLabelText(/ver la plataforma como otro usuario/i), {
      target: { value: '' },
    })
    expect(stopViewAs).toHaveBeenCalled()
  })

  it('deshabilita el Modo dios mientras se suplanta', () => {
    renderSidebar({ userProfile: NAIRIM, realUserProfile: JUAN_PROFILE, isViewingAs: true })
    openMenu()
    expect(screen.getByRole('switch', { name: '' })).toBeDisabled()
    // El nivel mostrado es el REAL, no el del suplantado.
    expect(screen.getByDisplayValue('Nivel 3')).toBeInTheDocument()
  })
})
