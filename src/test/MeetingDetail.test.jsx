/**
 * Tests de MeetingDetail — vista de solo lectura previa a la edición (patrón AdsDetail).
 * Cubre: renderizado de la info (cliente, fecha, modalidad, participantes, notas),
 * las acciones rápidas de estado (marcar/desmarcar realizada, reagendar, cancelar),
 * Editar (delega a onEdit), Eliminar con confirmación de dos pasos, y el gating completo
 * por `canManage` (sin permiso no se ven acciones ni Editar/Eliminar).
 */
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi } from 'vitest'

const {
  mockMarkMeetingHeld, mockUnmarkMeetingHeld, mockCancelMeeting, mockUpdateMeeting, mockDeleteMeeting,
} = vi.hoisted(() => ({
  mockMarkMeetingHeld: vi.fn(),
  mockUnmarkMeetingHeld: vi.fn(),
  mockCancelMeeting: vi.fn(),
  mockUpdateMeeting: vi.fn(),
  mockDeleteMeeting: vi.fn(),
}))

vi.mock('../components/reuniones/meetingsApi', () => ({
  markMeetingHeld: (...a) => mockMarkMeetingHeld(...a),
  unmarkMeetingHeld: (...a) => mockUnmarkMeetingHeld(...a),
  cancelMeeting: (...a) => mockCancelMeeting(...a),
  updateMeeting: (...a) => mockUpdateMeeting(...a),
  deleteMeeting: (...a) => mockDeleteMeeting(...a),
}))

import MeetingDetail from '../components/reuniones/MeetingDetail'

const EMPLOYEES = [
  { user_id: 'u1', first_name: 'Ana', last_name: 'García', avatar_url: null, access_level: 4 },
  { user_id: 'u2', first_name: 'Beto', last_name: 'López', avatar_url: null, access_level: 2 },
]

// Fecha futura fija — no depende del reloj real ni cae en "vencida".
const MEETING = {
  id: 'm-1', title: 'Reunión con Pepsi', client_name: 'Pepsi', starts_at: '2099-01-15T14:00:00',
  modality: 'presencial', location: 'Oficina MDN', meeting_url: null,
  notes: 'Llevar la propuesta', attendee_ids: ['u1'], status: 'programada',
}

function renderDetail(props = {}) {
  return render(
    <MeetingDetail
      meeting={MEETING}
      employees={EMPLOYEES}
      canManage={true}
      onClose={() => {}}
      onSaved={() => {}}
      onDeleted={() => {}}
      onEdit={() => {}}
      {...props}
    />
  )
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('MeetingDetail — info de solo lectura', () => {
  it('muestra título, cliente, modalidad/lugar y notas', () => {
    renderDetail()
    expect(screen.getByRole('heading', { name: 'Reunión con Pepsi' })).toBeInTheDocument()
    expect(screen.getByText('Pepsi')).toBeInTheDocument()
    expect(screen.getByText('Presencial')).toBeInTheDocument()
    expect(screen.getByText('Oficina MDN')).toBeInTheDocument()
    expect(screen.getByText('Llevar la propuesta')).toBeInTheDocument()
  })

  it('muestra a los participantes resueltos desde employees', () => {
    renderDetail()
    expect(screen.getByText('Ana García')).toBeInTheDocument()
    expect(screen.queryByText('Beto López')).not.toBeInTheDocument()
  })

  it('videollamada muestra el link como <a> en vez de "lugar"', () => {
    renderDetail({ meeting: { ...MEETING, modality: 'videollamada', meeting_url: 'https://meet.example.com/x', location: null } })
    const link = screen.getByRole('link', { name: 'https://meet.example.com/x' })
    expect(link).toHaveAttribute('href', 'https://meet.example.com/x')
  })

  it('muestra el badge de estado correspondiente', () => {
    renderDetail({ meeting: { ...MEETING, status: 'realizada' } })
    expect(screen.getByText('Realizada')).toBeInTheDocument()
  })
})

describe('MeetingDetail — acciones rápidas (con canManage)', () => {
  it('"Marcar realizada" marca al instante (un solo click, sin esperar ningún link)', async () => {
    const user = userEvent.setup()
    mockMarkMeetingHeld.mockResolvedValue({ data: { ...MEETING, status: 'realizada' }, error: null })
    const onSaved = vi.fn()
    const onClose = vi.fn()
    renderDetail({ onSaved, onClose })
    expect(screen.queryByLabelText('Link de la minuta (Google Drive)')).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Marcar realizada' }))
    await waitFor(() => expect(mockMarkMeetingHeld).toHaveBeenCalledWith('m-1'))
    expect(onSaved).toHaveBeenCalledWith({ ...MEETING, status: 'realizada' })
    expect(onClose).not.toHaveBeenCalled()
    // Ya marcada, se abre el panel para agregar el link como algo opcional aparte
    expect(screen.getByLabelText('Link de la minuta (Google Drive)')).toBeInTheDocument()
  })

  it('el panel de minuta que aparece tras marcar guarda el link vía updateMeeting, sin haber bloqueado el marcado', async () => {
    const user = userEvent.setup()
    mockMarkMeetingHeld.mockResolvedValue({ data: { ...MEETING, status: 'realizada' }, error: null })
    mockUpdateMeeting.mockResolvedValue({ data: { ...MEETING, status: 'realizada', minuta_url: 'https://drive.google.com/x' }, error: null })
    const onSaved = vi.fn()
    renderDetail({ onSaved })
    await user.click(screen.getByRole('button', { name: 'Marcar realizada' }))
    await waitFor(() => expect(screen.getByLabelText('Link de la minuta (Google Drive)')).toBeInTheDocument())
    await user.type(screen.getByLabelText('Link de la minuta (Google Drive)'), 'https://drive.google.com/x')
    await user.click(screen.getByRole('button', { name: 'Confirmar' }))
    await waitFor(() => expect(mockUpdateMeeting).toHaveBeenCalledWith('m-1', { minuta_url: 'https://drive.google.com/x' }))
    expect(onSaved).toHaveBeenLastCalledWith({ ...MEETING, status: 'realizada', minuta_url: 'https://drive.google.com/x' })
  })

  it('una reunión "realizada" muestra "Desmarcar realizada" y desmarca directo, sin pedir nada', async () => {
    const user = userEvent.setup()
    mockUnmarkMeetingHeld.mockResolvedValue({ data: { ...MEETING, status: 'programada' }, error: null })
    renderDetail({ meeting: { ...MEETING, status: 'realizada' } })
    await user.click(screen.getByRole('button', { name: 'Desmarcar realizada' }))
    await waitFor(() => expect(mockUnmarkMeetingHeld).toHaveBeenCalledWith('m-1'))
    expect(mockMarkMeetingHeld).not.toHaveBeenCalled()
  })

  it('una reunión "realizada" muestra el link de la minuta, o "Sin minuta" si no tiene', () => {
    renderDetail({ meeting: { ...MEETING, status: 'realizada', minuta_url: 'https://drive.google.com/abc' } })
    expect(screen.getByRole('link', { name: 'https://drive.google.com/abc' })).toHaveAttribute('href', 'https://drive.google.com/abc')

    const { unmount } = renderDetail({ meeting: { ...MEETING, status: 'realizada', minuta_url: null } })
    expect(screen.getByText('Sin minuta')).toBeInTheDocument()
    unmount()
  })

  it('"Editar link"/"Agregar link" de la minuta abre el panel pre-cargado con el link existente', async () => {
    const user = userEvent.setup()
    mockUpdateMeeting.mockResolvedValue({ data: { ...MEETING, status: 'realizada', minuta_url: 'https://drive.google.com/nuevo' }, error: null })
    renderDetail({ meeting: { ...MEETING, status: 'realizada', minuta_url: 'https://drive.google.com/viejo' } })
    await user.click(screen.getByRole('button', { name: 'Editar link' }))
    const input = screen.getByLabelText('Link de la minuta (Google Drive)')
    expect(input).toHaveValue('https://drive.google.com/viejo')
    await user.clear(input)
    await user.type(input, 'https://drive.google.com/nuevo')
    await user.click(screen.getByRole('button', { name: 'Confirmar' }))
    await waitFor(() => expect(mockUpdateMeeting).toHaveBeenCalledWith('m-1', { minuta_url: 'https://drive.google.com/nuevo' }))
  })

  it('"Reagendar" abre el panel de fecha; "Confirmar" envía starts_at + status: programada', async () => {
    const user = userEvent.setup()
    mockUpdateMeeting.mockResolvedValue({ data: { ...MEETING, starts_at: '2099-02-01T10:00:00.000Z' }, error: null })
    renderDetail()
    expect(screen.queryByLabelText('Nueva fecha y hora')).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Reagendar' }))
    const dateInput = screen.getByLabelText('Nueva fecha y hora')
    await user.clear(dateInput)
    await user.type(dateInput, '2099-02-01T10:00')
    await user.click(screen.getByRole('button', { name: 'Confirmar' }))

    await waitFor(() => expect(mockUpdateMeeting).toHaveBeenCalled())
    const [id, fields] = mockUpdateMeeting.mock.calls[0]
    expect(id).toBe('m-1')
    expect(fields.status).toBe('programada')
  })

  it('"Cancelar reunión" llama a cancelMeeting sin pedir fecha', async () => {
    const user = userEvent.setup()
    mockCancelMeeting.mockResolvedValue({ data: { ...MEETING, status: 'cancelada' }, error: null })
    renderDetail()
    await user.click(screen.getByRole('button', { name: 'Cancelar reunión' }))
    await waitFor(() => expect(mockCancelMeeting).toHaveBeenCalledWith('m-1'))
  })

  it('una reunión cancelada no ofrece marcar-realizada ni cancelar de nuevo', () => {
    renderDetail({ meeting: { ...MEETING, status: 'cancelada' } })
    expect(screen.queryByRole('button', { name: 'Marcar realizada' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Cancelar reunión' })).not.toBeInTheDocument()
    // Reagendar sigue disponible para reactivarla
    expect(screen.getByRole('button', { name: 'Reagendar' })).toBeInTheDocument()
  })
})

describe('MeetingDetail — Editar / Eliminar', () => {
  it('"Editar" llama a onEdit con la reunión', async () => {
    const user = userEvent.setup()
    const onEdit = vi.fn()
    renderDetail({ onEdit })
    await user.click(screen.getByRole('button', { name: 'Editar' }))
    expect(onEdit).toHaveBeenCalledWith(MEETING)
  })

  it('"Eliminar" exige confirmación de dos pasos antes de borrar', async () => {
    const user = userEvent.setup()
    mockDeleteMeeting.mockResolvedValue({ error: null })
    const onDeleted = vi.fn()
    const onClose = vi.fn()
    renderDetail({ onDeleted, onClose })

    await user.click(screen.getByRole('button', { name: 'Eliminar' }))
    expect(mockDeleteMeeting).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: '¿Confirmar?' })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '¿Confirmar?' }))
    await waitFor(() => expect(mockDeleteMeeting).toHaveBeenCalledWith('m-1'))
    expect(onDeleted).toHaveBeenCalledWith('m-1')
    expect(onClose).toHaveBeenCalled()
  })
})

describe('MeetingDetail — sin canManage', () => {
  it('no muestra acciones rápidas ni Editar/Eliminar', () => {
    renderDetail({ canManage: false })
    expect(screen.queryByRole('button', { name: /realizada/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Reagendar' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Cancelar reunión' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Editar' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Eliminar' })).not.toBeInTheDocument()
    // La info sigue visible
    expect(screen.getByText('Pepsi')).toBeInTheDocument()
  })
})
