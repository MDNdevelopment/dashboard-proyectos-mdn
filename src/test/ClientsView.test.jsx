import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { vi } from 'vitest'

// ── Mock supabase (solo el canal realtime que ClientsView suscribe) ──────────
vi.mock('../supabase', () => ({
  supabase: {
    channel: vi.fn(() => ({
      on: vi.fn().mockReturnThis(),
      subscribe: vi.fn().mockReturnThis(),
    })),
    removeChannel: vi.fn(),
  },
}))

// ── Test data (vi.hoisted: vi.mock se eleva sobre los const normales) ────────
const { MOCK_LINES, MOCK_CLIENTS } = vi.hoisted(() => ({
  MOCK_LINES: [
    { id: 'l1', name: 'Línea Redes', color: '#FFB800' },
    { id: 'l2', name: 'Línea Audiovisual', color: '#4488FF' },
  ],
  MOCK_CLIENTS: [
    { id: 'c1', name: 'Cliente Uno', line_id: 'l1', deleted_at: null, social_links: [] },
    { id: 'c2', name: 'Cliente Dos', line_id: 'l2', deleted_at: null, social_links: [] },
  ],
}))

// ── Mock metricsApi (deep-link solo depende de loadLines/loadClients/loadCompanyEmployees) ──
vi.mock('../components/metricas/metricsApi', () => ({
  loadLines: vi.fn().mockResolvedValue({ data: MOCK_LINES, error: null }),
  loadClients: vi.fn().mockResolvedValue({ data: MOCK_CLIENTS, error: null }),
  loadCompanyEmployees: vi.fn().mockResolvedValue({ data: [], error: null }),
  deleteClient: vi.fn(),
  restoreClient: vi.fn(),
  seedMetricsIfEmpty: vi.fn().mockResolvedValue(undefined),
}))

import ClientsView from '../components/empresa/ClientsView'

function renderAt(path) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <ClientsView companyId="co-1" canManage={false} />
    </MemoryRouter>
  )
}

describe('ClientsView — deep-link ?line=<id> desde Inicio', () => {
  it('preselecciona el filtro de la línea indicada en la URL', async () => {
    renderAt('/empresa/clientes?line=l1')
    // Solo se lista el cliente de l1; el de l2 queda fuera del filtro.
    await waitFor(() => {
      expect(screen.getByText('Cliente Uno')).toBeInTheDocument()
    })
    expect(screen.queryByText('Cliente Dos')).not.toBeInTheDocument()
  })

  it('el botón de la línea de la URL aparece marcado como activo', async () => {
    renderAt('/empresa/clientes?line=l1')
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /línea redes/i })).toBeInTheDocument()
    })
    expect(screen.getByRole('button', { name: /línea redes/i })).toHaveStyle({ borderColor: '#FFB800' })
  })

  it('sin query param, muestra todos los clientes (comportamiento por defecto)', async () => {
    renderAt('/empresa/clientes')
    await waitFor(() => {
      expect(screen.getByText('Cliente Uno')).toBeInTheDocument()
    })
    expect(screen.getByText('Cliente Dos')).toBeInTheDocument()
  })
})
