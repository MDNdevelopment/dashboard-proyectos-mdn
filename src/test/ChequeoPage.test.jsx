import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { vi } from 'vitest'
import { createSupabaseMock, makeQuery } from './helpers/supabaseMock'

vi.mock('../supabase', () => ({
  supabase: createSupabaseMock({
    tables: {
      metric_lines: () => makeQuery(MOCK_LINES),
      metric_clients: () => makeQuery(MOCK_CLIENTS),
      publication_checks: () => makeQuery([]),
    },
  }),
}))

vi.mock('../context/AuthContext', () => ({
  useAuth: vi.fn(),
}))

// Mutable: el grupo "Independientes" reasigna estas listas para agregar la línea general
// y una cuenta sin línea (ver factory de vi.mock arriba, que las lee por referencia).
let MOCK_LINES = [
  {
    id: 'line-1',
    name: 'Georgina',
    company_id: 'co-1',
    members: [{ user_id: 'u1', is_lead: true }],
  },
]
let MOCK_CLIENTS = [
  {
    id: 'c-1',
    name: 'Pepsi',
    line_id: 'line-1',
    logo_url: null,
    social_links: [{ red: 'Instagram', link: '' }],
  },
]

import { useAuth } from '../context/AuthContext'
import ChequeoPage from '../pages/ChequeoPage'

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/tareas/chequeo']}>
      <ChequeoPage />
    </MemoryRouter>,
  )
}

describe('ChequeoPage', () => {
  beforeEach(() => {
    useAuth.mockReturnValue({
      userProfile: { user_id: 'u1', company_id: 'co-1', access_level: 3, admin: false },
      can: () => true,
    })
  })

  it('muestra la grilla de publicaciones con el selector de mes y semana', async () => {
    renderPage()
    await waitFor(() => {
      expect(screen.getByText('Pepsi')).toBeInTheDocument()
    })
    expect(
      screen.getByText('Publicaciones por semana — Publicaciones, Reels e Highlights'),
    ).toBeInTheDocument()
    // Selector de semana: al menos S1, arranca en la semana que contiene hoy.
    expect(screen.getByText('S1')).toBeInTheDocument()
  })

  it('no muestra la píldora "Todas" sin nivel 4/admin ni la capability chequeo.ver_todo', async () => {
    useAuth.mockReturnValue({
      userProfile: { user_id: 'u1', company_id: 'co-1', access_level: 2, admin: false },
      can: () => false,
    })
    renderPage()
    await waitFor(() => {
      expect(screen.getByText('Pepsi')).toBeInTheDocument()
    })
    expect(screen.queryByText('Todas')).not.toBeInTheDocument()
  })

  it('muestra la píldora "Todas" a un usuario de nivel bajo con la capability chequeo.ver_todo', async () => {
    useAuth.mockReturnValue({
      userProfile: { user_id: 'u1', company_id: 'co-1', access_level: 2, admin: false },
      can: (key) => key === 'chequeo.ver_todo',
    })
    renderPage()
    await waitFor(() => {
      expect(screen.getByText('Pepsi')).toBeInTheDocument()
    })
    expect(screen.getByText('Todas')).toBeInTheDocument()
  })

  it('regresión: un usuario sin línea propia pero con chequeo.ver_todo ve todas las líneas en vez de "No hay líneas visibles"', async () => {
    // u2 no pertenece a member_user_ids de ninguna línea (solo u1 es miembro de line-1).
    // Antes del fix, canViewAll era true (por chequeo.ver_todo) pero visibleLinesForUser
    // no recibía ese bypass y devolvía [] igual, mostrando "No hay líneas visibles".
    useAuth.mockReturnValue({
      userProfile: { user_id: 'u2', company_id: 'co-1', access_level: 1, admin: false },
      can: (key) => key === 'chequeo.ver_todo',
    })
    renderPage()
    await waitFor(() => {
      expect(screen.getByText('Pepsi')).toBeInTheDocument()
    })
    expect(screen.queryByText('No hay líneas visibles')).not.toBeInTheDocument()
  })
})

describe('ChequeoPage — team "Independientes" para cuentas sin línea', () => {
  const ORIGINAL_LINES = MOCK_LINES
  const ORIGINAL_CLIENTS = MOCK_CLIENTS

  beforeEach(() => {
    MOCK_LINES = [
      ...ORIGINAL_LINES,
      {
        id: 'line-general',
        name: 'Independientes',
        company_id: 'co-1',
        is_general: true,
        members: [],
      },
    ]
    MOCK_CLIENTS = [
      ...ORIGINAL_CLIENTS,
      { id: 'c-2', name: 'Credimara', line_id: null, logo_url: null, social_links: [] },
    ]
    useAuth.mockReturnValue({
      userProfile: { user_id: 'u1', company_id: 'co-1', access_level: 1, admin: false },
      can: () => false,
    })
  })

  afterEach(() => {
    MOCK_LINES = ORIGINAL_LINES
    MOCK_CLIENTS = ORIGINAL_CLIENTS
  })

  it('muestra la píldora "Independientes" aunque el usuario no sea nivel 4/admin/ver_todo', async () => {
    renderPage()
    await waitFor(() => {
      expect(screen.getByText('Pepsi')).toBeInTheDocument()
    })
    expect(screen.getByText('Independientes')).toBeInTheDocument()
  })

  it('al elegir "Independientes" se ve la cuenta sin línea', async () => {
    renderPage()
    await waitFor(() => {
      expect(screen.getByText('Independientes')).toBeInTheDocument()
    })
    screen.getByText('Independientes').click()
    await waitFor(() => {
      expect(screen.getByText('Credimara')).toBeInTheDocument()
    })
  })
})
