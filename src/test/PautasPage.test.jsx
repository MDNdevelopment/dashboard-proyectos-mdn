import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { vi } from 'vitest'
import { createSupabaseMock, makeQuery } from './helpers/supabaseMock'

// Mutables: el bloque "Independientes" les agrega la línea general, cuentas y pautas.
let MOCK_LINES = [
  { id: 'line-1', name: 'Georgina', company_id: 'co-1', is_general: false, members: [] },
  { id: 'line-2', name: 'Sabrina', company_id: 'co-1', is_general: false, members: [] },
]
let MOCK_CLIENTS = []
let MOCK_PAUTAS = []

vi.mock('../supabase', () => ({
  supabase: createSupabaseMock({
    tables: {
      metric_lines: () => makeQuery(MOCK_LINES),
      metric_clients: () => makeQuery(MOCK_CLIENTS),
      av_pautas: () => makeQuery(MOCK_PAUTAS),
      av_pauta_piezas: () => makeQuery([]),
      external_resources: () => makeQuery([]),
      users: () => makeQuery([]),
    },
  }),
}))

vi.mock('../context/AuthContext', () => ({
  useAuth: vi.fn(),
}))

import { useAuth } from '../context/AuthContext'
import PautasPage from '../pages/PautasPage'

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/tareas/pautas']}>
      <PautasPage />
    </MemoryRouter>,
  )
}

describe('PautasPage — visibilidad de líneas', () => {
  it('con audiovisual.ver_todo, un coordinador de nivel bajo y sin membresía en ninguna línea ve TODAS las líneas (bug: antes recibía [])', async () => {
    useAuth.mockReturnValue({
      userProfile: {
        user_id: 'coord-1',
        company_id: 'co-1',
        access_level: 2,
        admin: false,
      },
      can: (key) => key === 'audiovisual.ver_todo' || key === 'audiovisual.coordina',
    })
    renderPage()
    await waitFor(() => {
      expect(screen.getByText('Georgina')).toBeInTheDocument()
    })
    expect(screen.getByText('Sabrina')).toBeInTheDocument()
    expect(screen.getByText('Todos')).toBeInTheDocument()
  })

  it('con audiovisual.piezas, un editor de nivel bajo y sin membresía en ninguna línea ve TODAS las líneas', async () => {
    useAuth.mockReturnValue({
      userProfile: {
        user_id: 'editor-1',
        company_id: 'co-1',
        access_level: 1,
        admin: false,
      },
      can: (key) => key === 'audiovisual.piezas',
    })
    renderPage()
    await waitFor(() => {
      expect(screen.getByText('Georgina')).toBeInTheDocument()
    })
    expect(screen.getByText('Sabrina')).toBeInTheDocument()
    expect(screen.getByText('Todos')).toBeInTheDocument()
  })

  it('sin audiovisual.ver_todo, un usuario de nivel bajo y sin membresía no ve badges de línea (comportamiento previo intacto)', async () => {
    useAuth.mockReturnValue({
      userProfile: {
        user_id: 'coord-1',
        company_id: 'co-1',
        access_level: 2,
        admin: false,
      },
      can: () => false,
    })
    renderPage()
    await waitFor(() => {
      expect(screen.getByText('Sin línea')).toBeInTheDocument()
    })
    expect(screen.queryByText('Georgina')).not.toBeInTheDocument()
    expect(screen.queryByText('Sabrina')).not.toBeInTheDocument()
  })
})

describe('PautasPage — team "Independientes" para cuentas sin línea', () => {
  const BASE_LINES = MOCK_LINES
  const GENERAL_LINE = {
    id: 'line-indep',
    name: 'Independientes',
    company_id: 'co-1',
    is_general: true,
    members: [],
  }
  const pauta = (overrides) => ({
    id: 'p',
    company_id: 'co-1',
    status: 'solicitada',
    // visibleSolicitudes() solo muestra las enviadas a quien coordina (ver utils/audiovisual).
    submitted: true,
    pauta_date: null,
    tema: 'Tema',
    deleted_at: null,
    ...overrides,
  })

  beforeEach(() => {
    MOCK_LINES = [...BASE_LINES, GENERAL_LINE]
    MOCK_CLIENTS = [
      { id: 'c-1', name: 'ConLinea', company_id: 'co-1', line_id: 'line-1', deleted_at: null },
      { id: 'c-2', name: 'SinLinea', company_id: 'co-1', line_id: null, deleted_at: null },
    ]
    MOCK_PAUTAS = [
      pauta({ id: 'p-1', client_id: 'c-1', client_name: 'ConLinea', line_id: 'line-1' }),
      pauta({ id: 'p-2', client_id: 'c-2', client_name: 'SinLinea', line_id: null }),
    ]
    useAuth.mockReturnValue({
      userProfile: { user_id: 'coord-1', company_id: 'co-1', access_level: 2, admin: false },
      can: (key) => key === 'audiovisual.ver_todo' || key === 'audiovisual.coordina',
    })
  })

  afterEach(() => {
    MOCK_LINES = BASE_LINES
    MOCK_CLIENTS = []
    MOCK_PAUTAS = []
  })

  it('muestra la píldora "Independientes" junto a las líneas reales', async () => {
    renderPage()
    await waitFor(() => {
      expect(screen.getByText('Georgina')).toBeInTheDocument()
    })
    expect(screen.getByText('Independientes')).toBeInTheDocument()
  })

  it('al elegir "Independientes" solo se ven las pautas de cuentas sin línea', async () => {
    renderPage()
    await waitFor(() => {
      expect(screen.getByText('Independientes')).toBeInTheDocument()
    })
    // En "Todos" se ven ambas (la cuenta aparece además como opción del selector de cliente).
    expect(screen.getAllByText('ConLinea').length).toBeGreaterThan(0)
    expect(screen.getAllByText('SinLinea').length).toBeGreaterThan(0)

    screen.getByText('Independientes').click()
    await waitFor(() => {
      expect(screen.queryAllByText('ConLinea')).toHaveLength(0)
    })
    expect(screen.getAllByText('SinLinea').length).toBeGreaterThan(0)
  })

  it('al elegir una línea real, la pauta sin línea no se cuela', async () => {
    renderPage()
    await waitFor(() => {
      expect(screen.getByText('Georgina')).toBeInTheDocument()
    })
    screen.getByText('Georgina').click()
    await waitFor(() => {
      expect(screen.queryAllByText('SinLinea')).toHaveLength(0)
    })
    expect(screen.getAllByText('ConLinea').length).toBeGreaterThan(0)
  })
})
