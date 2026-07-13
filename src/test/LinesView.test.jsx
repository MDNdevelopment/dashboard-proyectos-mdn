import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { vi } from 'vitest'

// ── Mock supabase (solo el canal realtime que LinesView suscribe) ────────────
vi.mock('../supabase', () => ({
  supabase: {
    channel: vi.fn(() => ({
      on: vi.fn().mockReturnThis(),
      subscribe: vi.fn().mockReturnThis(),
    })),
    removeChannel: vi.fn(),
  },
}))

vi.mock('../context/AuthContext', () => ({
  useAuth: () => ({ can: () => true }),
}))

// ── Test data (vi.hoisted: vi.mock se eleva sobre los const normales) ────────
const { MOCK_LINES } = vi.hoisted(() => ({
  MOCK_LINES: [
    { id: 'l1', name: 'Línea Redes', color: '#FFB800', sort_order: 1, member_user_ids: ['u1'] },
    { id: 'l2', name: 'Línea Audiovisual', color: '#4488FF', sort_order: 2, member_user_ids: [] },
  ],
}))

// ── Mock metricsApi (deep-link solo depende de loadLines/loadClients/loadYearReports) ──
vi.mock('../components/metricas/metricsApi', () => ({
  loadLines: vi.fn().mockResolvedValue({ data: MOCK_LINES, error: null }),
  loadClients: vi.fn().mockResolvedValue({ data: [], error: null }),
  loadYearReports: vi.fn().mockResolvedValue({ data: [], error: null }),
  loadCompanyEmployees: vi.fn().mockResolvedValue({ data: [], error: null }),
  updateLine: vi.fn(),
  deleteLine: vi.fn(),
  addLineMember: vi.fn(),
  removeLineMember: vi.fn(),
}))

import LinesView from '../components/empresa/LinesView'

function renderAt(path) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <LinesView companyId="co-1" canManage={false} />
    </MemoryRouter>
  )
}

describe('LinesView — deep-link ?line=<id> desde Inicio', () => {
  it('abre automáticamente la ficha de la línea indicada en la URL', async () => {
    renderAt('/empresa/lineas?line=l1')
    // LineFichaModal renderiza <h2>{line.name}</h2> cuando está abierto.
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /línea redes/i })).toBeInTheDocument()
    })
  })

  it('sin query param, no abre ninguna ficha', async () => {
    renderAt('/empresa/lineas')
    await waitFor(() => {
      expect(screen.getByText(/línea redes/i)).toBeInTheDocument()
    })
    expect(screen.queryByRole('heading', { name: /línea redes/i })).not.toBeInTheDocument()
  })
})
