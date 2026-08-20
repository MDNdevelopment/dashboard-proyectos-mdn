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

  it('muestra la grilla de última publicación', async () => {
    renderPage()
    await waitFor(() => {
      expect(screen.getByText('Pepsi')).toBeInTheDocument()
    })
    expect(
      screen.getByText('Última publicación por red social — Publicaciones, Reels e Highlights'),
    ).toBeInTheDocument()
  })
})
