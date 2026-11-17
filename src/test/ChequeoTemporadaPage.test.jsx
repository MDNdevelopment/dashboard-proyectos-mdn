import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { vi } from 'vitest'
import { createSupabaseMock, makeQuery } from './helpers/supabaseMock'

vi.mock('../supabase', () => ({
  supabase: createSupabaseMock({
    tables: { users: () => makeQuery([]) },
  }),
}))

vi.mock('../context/AuthContext', () => ({ useAuth: vi.fn() }))

vi.mock('../components/metricas/metricsApi', () => ({
  loadLines: vi.fn(),
  loadClients: vi.fn(),
  createClient: vi.fn(),
}))

vi.mock('../components/chequeo/temporadaApi', () => ({
  loadCampaigns: vi.fn(),
  loadPieces: vi.fn(),
  loadAssignments: vi.fn(),
  upsertCell: vi.fn(),
  upsertAssignment: vi.fn(),
  deleteAssignment: vi.fn(),
}))

import { useAuth } from '../context/AuthContext'
import { loadLines, loadClients, createClient } from '../components/metricas/metricsApi'
import { loadCampaigns, loadPieces, loadAssignments } from '../components/chequeo/temporadaApi'
import ChequeoTemporadaPage from '../pages/ChequeoTemporadaPage'

const LINE = {
  id: 'line-1',
  name: 'Team Sabrina',
  member_user_ids: ['u1'],
  lead_user_id: 'u1',
}
const PEPSI = { id: 'c-1', name: 'Pepsi', line_id: 'line-1', social_manager_id: null }

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/tareas/chequeo/temporada']}>
      <ChequeoTemporadaPage />
    </MemoryRouter>,
  )
}

function authWith(permissions) {
  useAuth.mockReturnValue({
    userProfile: { user_id: 'u1', company_id: 'co-1', access_level: 3, admin: false },
    can: (key) => permissions.includes(key),
  })
}

describe('ChequeoTemporadaPage — agregar cliente', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    loadLines.mockResolvedValue({ data: [LINE], error: null })
    loadClients.mockResolvedValue({ data: [PEPSI], error: null })
    loadCampaigns.mockResolvedValue({
      data: [
        {
          id: 'camp-1',
          name: 'Navidad 2026',
          slots: [{ key: '2026-12-24', label: '24/12', kind: 'post' }],
        },
      ],
      error: null,
    })
    loadPieces.mockResolvedValue({ data: [], error: null })
    loadAssignments.mockResolvedValue({ data: [], error: null })
  })

  it('hay un botón para volver al chequeo normal, siempre visible', async () => {
    authWith(['chequeo.manage'])
    renderPage()
    await screen.findByText('Pepsi')
    expect(screen.getByRole('link', { name: '← Volver al chequeo' })).toHaveAttribute(
      'href',
      '/tareas/chequeo',
    )
  })

  it('el botón solo aparece con el permiso de crear clientes', async () => {
    authWith(['chequeo.manage'])
    renderPage()
    await screen.findByText('Pepsi')
    expect(screen.queryByRole('button', { name: '+ Agregar cliente' })).not.toBeInTheDocument()
  })

  it('con el permiso, crea el cliente en MAPPI y aparece en la grilla', async () => {
    authWith(['chequeo.manage', 'empresa.clientes.manage'])
    createClient.mockResolvedValue({
      data: { id: 'c-2', name: 'Hello Fitness', line_id: 'line-1', social_manager_id: null },
      error: null,
    })
    renderPage()
    await screen.findByText('Pepsi')

    fireEvent.click(screen.getByRole('button', { name: '+ Agregar cliente' }))
    fireEvent.change(screen.getByPlaceholderText('Nombre del cliente'), {
      target: { value: 'Hello Fitness' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Agregar cliente' }))

    await waitFor(() =>
      expect(createClient).toHaveBeenCalledWith('co-1', {
        name: 'Hello Fitness',
        line_id: 'line-1',
        social_manager_id: null,
      }),
    )
    expect(await screen.findByText('Hello Fitness')).toBeInTheDocument()
    // El modal se cierra al terminar.
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  })

  it('si no se puede crear (p. ej. RLS), muestra el error y no agrega nada', async () => {
    authWith(['chequeo.manage', 'empresa.clientes.manage'])
    createClient.mockResolvedValue({ data: null, error: { message: 'permission denied' } })
    renderPage()
    await screen.findByText('Pepsi')

    fireEvent.click(screen.getByRole('button', { name: '+ Agregar cliente' }))
    fireEvent.change(screen.getByPlaceholderText('Nombre del cliente'), {
      target: { value: 'Hello Fitness' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Agregar cliente' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('permission denied')
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(screen.queryByText('Hello Fitness')).not.toBeInTheDocument()
  })
})
