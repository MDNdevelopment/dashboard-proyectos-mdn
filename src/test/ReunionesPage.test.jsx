/**
 * Tests de ReunionesPage — host del módulo. Cubre la convención de modal
 * (undefined=cerrado, null=crear, objeto=editar), el nuevo flujo ver→editar (click en una
 * reunión abre MeetingDetail de solo lectura; "Editar" ahí transiciona a MeetingModal), la
 * carga inicial vía realtime, el gating de "Nueva reunión"/edición por reuniones.manage
 * (ver SIEMPRE es universal), y el toggle rápido de "realizada" desde la pill del calendario.
 */
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { vi } from 'vitest'

const {
  mockChannelOn, mockSubscribe, mockRemoveChannel, mockFrom,
  mockMarkMeetingHeld, mockUnmarkMeetingHeld, mockCancelMeeting, mockUpdateMeeting, mockDeleteMeeting,
} = vi.hoisted(() => ({
  mockChannelOn: vi.fn(),
  mockSubscribe: vi.fn(),
  mockRemoveChannel: vi.fn(),
  mockFrom: vi.fn(),
  mockMarkMeetingHeld: vi.fn(),
  mockUnmarkMeetingHeld: vi.fn(),
  mockCancelMeeting: vi.fn(),
  mockUpdateMeeting: vi.fn(),
  mockDeleteMeeting: vi.fn(),
}))

vi.mock('../supabase', () => ({
  supabase: {
    channel: vi.fn(() => {
      const chan = { on: mockChannelOn, subscribe: mockSubscribe }
      mockChannelOn.mockReturnValue(chan)
      mockSubscribe.mockReturnValue(chan)
      return chan
    }),
    removeChannel: mockRemoveChannel,
    from: mockFrom,
  },
}))

vi.mock('../components/metricas/metricsApi', () => ({
  loadClients: vi.fn().mockResolvedValue({ data: [{ id: 'c-1', name: 'Banco Exterior' }], error: null }),
  loadCompanyEmployees: vi.fn().mockResolvedValue({
    data: [{ user_id: 'u1', first_name: 'Ana', last_name: 'García', access_level: 4 }],
    error: null,
  }),
}))

vi.mock('../components/reuniones/meetingsApi', () => ({
  markMeetingHeld: (...a) => mockMarkMeetingHeld(...a),
  unmarkMeetingHeld: (...a) => mockUnmarkMeetingHeld(...a),
  cancelMeeting: (...a) => mockCancelMeeting(...a),
  updateMeeting: (...a) => mockUpdateMeeting(...a),
  deleteMeeting: (...a) => mockDeleteMeeting(...a),
}))

vi.mock('../context/AuthContext', () => ({
  useAuth: vi.fn(),
}))

import { useAuth } from '../context/AuthContext'
import ReunionesPage from '../pages/ReunionesPage'

// ReunionesPage usa useSearchParams (deeplink ?meetingId=) — necesita un <Router> alrededor.
function renderPage(initialEntries = ['/reuniones']) {
  return render(<ReunionesPage />, { wrapper: ({ children }) => <MemoryRouter initialEntries={initialEntries}>{children}</MemoryRouter> })
}

function mockMeetingsSelect(data) {
  mockFrom.mockImplementation((table) => {
    if (table === 'meetings') {
      const chain = {
        select: vi.fn(() => chain),
        eq: vi.fn(() => chain),
        order: vi.fn(() => Promise.resolve({ data, error: null })),
      }
      return chain
    }
    return {}
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  mockMeetingsSelect([])
})

describe('ReunionesPage — con permiso de gestión', () => {
  beforeEach(() => {
    useAuth.mockReturnValue({
      userProfile: { user_id: 'u1', company_id: 'co-1' },
      can: (key) => key === 'reuniones.manage',
    })
  })

  it('muestra el botón "Nueva reunión" y abre el modal en modo crear al hacer click', async () => {
    const user = userEvent.setup()
    renderPage()
    await waitFor(() => expect(screen.getByRole('button', { name: /Nueva reunión/ })).toBeInTheDocument())
    await user.click(screen.getByRole('button', { name: /Nueva reunión/ }))
    expect(screen.getByRole('heading', { name: 'Nueva reunión' })).toBeInTheDocument()
    expect(screen.queryByText('Editar reunión')).not.toBeInTheDocument()
  })

  it('click en una reunión existente del calendario abre la vista de detalle (no el modal de edición)', async () => {
    mockMeetingsSelect([
      { id: 'm-1', title: 'Kickoff', company_id: 'co-1', starts_at: new Date().toISOString(), status: 'programada', attendee_ids: [] },
    ])
    const user = userEvent.setup()
    renderPage()
    const pill = await screen.findByText(/Kickoff/)
    await user.click(pill)
    expect(screen.getByRole('heading', { name: 'Kickoff' })).toBeInTheDocument()
    expect(screen.queryByText('Editar reunión')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Editar' })).toBeInTheDocument()
  })

  it('"Editar" dentro del detalle cierra la vista y abre MeetingModal en modo edición', async () => {
    mockMeetingsSelect([
      { id: 'm-1', title: 'Kickoff', company_id: 'co-1', starts_at: new Date().toISOString(), status: 'programada', attendee_ids: [] },
    ])
    const user = userEvent.setup()
    renderPage()
    const pill = await screen.findByText(/Kickoff/)
    await user.click(pill)
    await user.click(screen.getByRole('button', { name: 'Editar' }))
    expect(screen.getByText('Editar reunión')).toBeInTheDocument()
    // La vista de detalle se cerró
    expect(screen.queryByRole('button', { name: 'Editar' })).not.toBeInTheDocument()
  })

  it('se suscribe al canal realtime de "meetings" y lo limpia al desmontar', async () => {
    const { unmount } = renderPage()
    await waitFor(() => expect(mockChannelOn).toHaveBeenCalled())
    expect(mockChannelOn.mock.calls[0][1]).toMatchObject({ event: '*', schema: 'public', table: 'meetings' })
    unmount()
    expect(mockRemoveChannel).toHaveBeenCalled()
  })

  it('click en una reunión vencida sin marcar abre el detalle (no marca directo)', async () => {
    // El calendario abre en el mes/año actual (real) — la reunión de prueba debe caer
    // ahí para que su pill se renderice sin tener que navegar meses en el test.
    const yesterday = new Date()
    yesterday.setDate(yesterday.getDate() - 1)
    mockMeetingsSelect([
      { id: 'm-1', title: 'Vencida', company_id: 'co-1', starts_at: yesterday.toISOString(), status: 'programada', attendee_ids: [] },
    ])
    const user = userEvent.setup()
    renderPage()
    const pill = await screen.findByText(new RegExp('Vencida'))
    await user.click(pill)
    expect(mockMarkMeetingHeld).not.toHaveBeenCalled()
    // Abre el detalle, desde donde se marca realizada (con el link de minuta opcional)
    expect(screen.getByRole('button', { name: 'Marcar realizada' })).toBeInTheDocument()
  })

  it('click en el ✓ de una reunión realizada llama a unmarkMeetingHeld', async () => {
    const now = new Date().toISOString()
    mockMeetingsSelect([
      { id: 'm-1', title: 'Hecha', company_id: 'co-1', starts_at: now, status: 'realizada', attendee_ids: [] },
    ])
    mockUnmarkMeetingHeld.mockResolvedValue({
      data: { id: 'm-1', title: 'Hecha', starts_at: now, status: 'programada' }, error: null,
    })
    const user = userEvent.setup()
    renderPage()
    const toggleBtn = await screen.findByRole('button', { name: /Desmarcar "Hecha" como realizada/ })
    await user.click(toggleBtn)
    await waitFor(() => expect(mockUnmarkMeetingHeld).toHaveBeenCalledWith('m-1'))
  })

  it('con ?meetingId=<id> en la URL (deeplink desde la notificación), abre el detalle de esa reunión automáticamente', async () => {
    mockMeetingsSelect([
      { id: 'm-1', title: 'Kickoff', company_id: 'co-1', starts_at: new Date().toISOString(), status: 'programada', attendee_ids: [] },
      { id: 'm-2', title: 'Otra', company_id: 'co-1', starts_at: new Date().toISOString(), status: 'programada', attendee_ids: [] },
    ])
    renderPage(['/reuniones?meetingId=m-2'])
    expect(await screen.findByRole('heading', { name: 'Otra' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Kickoff' })).not.toBeInTheDocument()
  })
})

describe('ReunionesPage — cards de resumen y filtros', () => {
  beforeEach(() => {
    useAuth.mockReturnValue({
      userProfile: { user_id: 'u1', company_id: 'co-1' },
      can: (key) => key === 'reuniones.manage',
    })
  })

  // Fechas fijas dentro del mes actual (real) — el calendario abre ahí por defecto.
  const now = new Date()
  const inMonth = (day) => new Date(now.getFullYear(), now.getMonth(), day, 10, 0).toISOString()

  it('muestra el conteo correcto de Pautadas/Completadas/Canceladas del mes visible', async () => {
    mockMeetingsSelect([
      { id: 'm1', title: 'A', company_id: 'co-1', starts_at: inMonth(5), status: 'programada', attendee_ids: [] },
      { id: 'm2', title: 'B', company_id: 'co-1', starts_at: inMonth(6), status: 'programada', attendee_ids: [] },
      { id: 'm3', title: 'C', company_id: 'co-1', starts_at: inMonth(7), status: 'realizada', attendee_ids: [] },
      { id: 'm4', title: 'D', company_id: 'co-1', starts_at: inMonth(8), status: 'cancelada', attendee_ids: [] },
    ])
    renderPage()
    await waitFor(() => expect(screen.getByText('Pautadas')).toBeInTheDocument())
    expect(screen.getByText('Pautadas').closest('button')).toHaveTextContent('2')
    expect(screen.getByText('Completadas').closest('button')).toHaveTextContent('1')
    expect(screen.getByText('Canceladas').closest('button')).toHaveTextContent('1')
  })

  it('click en una card activa el filtro de estado (oculta el resto); click de nuevo lo desactiva', async () => {
    mockMeetingsSelect([
      { id: 'm1', title: 'ReunionProgramada', company_id: 'co-1', starts_at: inMonth(5), status: 'programada', attendee_ids: [] },
      { id: 'm2', title: 'ReunionRealizada', company_id: 'co-1', starts_at: inMonth(6), status: 'realizada', attendee_ids: [] },
    ])
    const user = userEvent.setup()
    renderPage()
    await waitFor(() => expect(screen.getByText(/ReunionProgramada/)).toBeInTheDocument())
    expect(screen.getByText(/ReunionRealizada/)).toBeInTheDocument()

    await user.click(screen.getByText('Completadas'))
    expect(screen.queryByText(/ReunionProgramada/)).not.toBeInTheDocument()
    expect(screen.getByText(/ReunionRealizada/)).toBeInTheDocument()

    await user.click(screen.getByText('Completadas'))
    expect(screen.getByText(/ReunionProgramada/)).toBeInTheDocument()
  })

  it('el filtro de modalidad oculta reuniones de la otra modalidad', async () => {
    mockMeetingsSelect([
      { id: 'm1', title: 'ReunionPresencial', company_id: 'co-1', starts_at: inMonth(5), status: 'programada', modality: 'presencial', attendee_ids: [] },
      { id: 'm2', title: 'ReunionVirtual', company_id: 'co-1', starts_at: inMonth(6), status: 'programada', modality: 'videollamada', attendee_ids: [] },
    ])
    const user = userEvent.setup()
    renderPage()
    await waitFor(() => expect(screen.getByText(/ReunionPresencial/)).toBeInTheDocument())
    await user.selectOptions(screen.getByRole('combobox', { name: 'Filtrar por modalidad' }), 'videollamada')
    expect(screen.queryByText(/ReunionPresencial/)).not.toBeInTheDocument()
    expect(screen.getByText(/ReunionVirtual/)).toBeInTheDocument()
  })

  it('el filtro "Solo las mías" oculta reuniones donde el usuario no es asistente', async () => {
    mockMeetingsSelect([
      { id: 'm1', title: 'ReunionPropia', company_id: 'co-1', starts_at: inMonth(5), status: 'programada', attendee_ids: ['u1'] },
      { id: 'm2', title: 'ReunionAjena', company_id: 'co-1', starts_at: inMonth(6), status: 'programada', attendee_ids: ['u2'] },
    ])
    const user = userEvent.setup()
    renderPage()
    await waitFor(() => expect(screen.getByText(/ReunionPropia/)).toBeInTheDocument())
    await user.selectOptions(screen.getByRole('combobox', { name: 'Filtrar por alcance' }), 'mias')
    expect(screen.queryByText(/ReunionAjena/)).not.toBeInTheDocument()
    expect(screen.getByText(/ReunionPropia/)).toBeInTheDocument()
  })

  it('las cards NO cambian sus números al activar modalidad/alcance (siempre cuentan todo el mes)', async () => {
    mockMeetingsSelect([
      { id: 'm1', title: 'A', company_id: 'co-1', starts_at: inMonth(5), status: 'programada', modality: 'presencial', attendee_ids: ['u2'] },
      { id: 'm2', title: 'B', company_id: 'co-1', starts_at: inMonth(6), status: 'programada', modality: 'videollamada', attendee_ids: ['u1'] },
    ])
    const user = userEvent.setup()
    renderPage()
    await waitFor(() => expect(screen.getByText('Pautadas').closest('button')).toHaveTextContent('2'))
    await user.selectOptions(screen.getByRole('combobox', { name: 'Filtrar por modalidad' }), 'videollamada')
    expect(screen.getByText('Pautadas').closest('button')).toHaveTextContent('2')
    await user.selectOptions(screen.getByRole('combobox', { name: 'Filtrar por alcance' }), 'mias')
    expect(screen.getByText('Pautadas').closest('button')).toHaveTextContent('2')
  })
})

describe('ReunionesPage — sin permiso de gestión', () => {
  beforeEach(() => {
    useAuth.mockReturnValue({
      userProfile: { user_id: 'u2', company_id: 'co-1' },
      can: () => false,
    })
  })

  it('no muestra el botón "Nueva reunión"', async () => {
    renderPage()
    await waitFor(() => expect(screen.getByText('Reuniones')).toBeInTheDocument())
    expect(screen.queryByRole('button', { name: /Nueva reunión/ })).not.toBeInTheDocument()
  })

  it('puede abrir el detalle de una reunión (ver es universal) pero no ve Editar/Eliminar ni acciones', async () => {
    mockMeetingsSelect([
      { id: 'm-1', title: 'Kickoff', company_id: 'co-1', starts_at: new Date().toISOString(), status: 'programada', attendee_ids: [] },
    ])
    const user = userEvent.setup()
    renderPage()
    const pill = await screen.findByText(/Kickoff/)
    await user.click(pill)
    expect(screen.getByRole('heading', { name: 'Kickoff' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Editar' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Eliminar' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /realizada/i })).not.toBeInTheDocument()
  })
})
