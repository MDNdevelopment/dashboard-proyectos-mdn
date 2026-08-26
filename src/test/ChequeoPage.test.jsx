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

const MOCK_LINES = [
  {
    id: 'line-1',
    name: 'Georgina',
    company_id: 'co-1',
    members: [{ user_id: 'u1', is_lead: true }],
  },
]
const MOCK_CLIENTS = [
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
