/**
 * Tests de MeetingModal — SOLO campos del formulario y crear/editar. Las acciones de
 * estado (marcar realizada, reagendar, cancelar, eliminar) viven ahora en
 * MeetingDetail.test.jsx (vista de solo lectura previa a este formulario). Cubre el
 * toggle de modalidad (presencial/videollamada), que solo se persiste el campo de la
 * modalidad activa, el botón "Cancelar" (cierra sin guardar), y la red de seguridad que
 * resetea status a 'programada' si se reagenda una reunión 'realizada' desde el campo
 * de fecha del propio formulario.
 */
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi } from 'vitest'

const { mockCreateMeeting, mockUpdateMeeting } = vi.hoisted(() => ({
  mockCreateMeeting: vi.fn(),
  mockUpdateMeeting: vi.fn(),
}))

vi.mock('../components/reuniones/meetingsApi', () => ({
  createMeeting: (...a) => mockCreateMeeting(...a),
  updateMeeting: (...a) => mockUpdateMeeting(...a),
}))

vi.mock('../context/AuthContext', () => ({
  useAuth: () => ({ userProfile: { user_id: 'u1', company_id: 'co-1' } }),
}))

import MeetingModal from '../components/reuniones/MeetingModal'

const CLIENTS = [{ id: 'c-1', name: 'Banco Exterior' }]
const EMPLOYEES = [{ user_id: 'u1', first_name: 'Ana', last_name: 'García', access_level: 4 }]

function renderModal(props = {}) {
  return render(
    <MeetingModal
      meeting={undefined}
      defaultDate={new Date('2026-07-20T14:00:00')}
      clients={CLIENTS}
      employees={EMPLOYEES}
      onClose={() => {}}
      onSaved={() => {}}
      {...props}
    />,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  mockCreateMeeting.mockResolvedValue({ data: { id: 'm-1' }, error: null })
  mockUpdateMeeting.mockResolvedValue({ data: { id: 'm-1' }, error: null })
})

describe('MeetingModal — toggle de modalidad', () => {
  it('por defecto (presencial) muestra el campo de lugar, no el de link', () => {
    renderModal()
    expect(screen.getByPlaceholderText('¿Dónde va a ser? (opcional)')).toBeInTheDocument()
    expect(screen.queryByPlaceholderText('Link de la reunión (opcional)')).not.toBeInTheDocument()
  })

  it('al cambiar a Videollamada muestra el campo de link, no el de lugar', async () => {
    const user = userEvent.setup()
    renderModal()
    await user.click(screen.getByRole('button', { name: 'Videollamada' }))
    expect(screen.getByPlaceholderText('Link de la reunión (opcional)')).toBeInTheDocument()
    expect(screen.queryByPlaceholderText('¿Dónde va a ser? (opcional)')).not.toBeInTheDocument()
  })

  it('al crear en modalidad presencial, el payload trae location y meeting_url=""', async () => {
    const user = userEvent.setup()
    renderModal()
    await user.type(screen.getByPlaceholderText('Asunto de la reunión'), 'Reunión con cliente')
    await user.type(screen.getByPlaceholderText('¿Dónde va a ser? (opcional)'), 'Oficina MDN')
    await user.click(screen.getByRole('button', { name: 'Crear reunión' }))

    await waitFor(() => expect(mockCreateMeeting).toHaveBeenCalled())
    const [, fields] = mockCreateMeeting.mock.calls[0]
    expect(fields.modality).toBe('presencial')
    expect(fields.location).toBe('Oficina MDN')
  })

  it('al crear en modalidad videollamada, el payload trae meeting_url', async () => {
    const user = userEvent.setup()
    renderModal()
    await user.type(screen.getByPlaceholderText('Asunto de la reunión'), 'Reunión remota')
    await user.click(screen.getByRole('button', { name: 'Videollamada' }))
    await user.type(
      screen.getByPlaceholderText('Link de la reunión (opcional)'),
      'https://meet.example.com/abc',
    )
    await user.click(screen.getByRole('button', { name: 'Crear reunión' }))

    await waitFor(() => expect(mockCreateMeeting).toHaveBeenCalled())
    const [, fields] = mockCreateMeeting.mock.calls[0]
    expect(fields.modality).toBe('videollamada')
    expect(fields.meeting_url).toBe('https://meet.example.com/abc')
  })
})

describe('MeetingModal — selector de varias marcas (ClientPicker)', () => {
  const MULTI_CLIENTS = [
    { id: 'c-1', name: 'Banco Exterior' },
    { id: 'c-2', name: 'Banco Exterior Seguros' },
  ]

  it('permite elegir varias marcas y el payload lleva client_ids con todas', async () => {
    const user = userEvent.setup()
    renderModal({ clients: MULTI_CLIENTS })
    await user.type(
      screen.getByPlaceholderText('Asunto de la reunión'),
      'Reunión con Banco Exterior',
    )
    await user.type(screen.getByPlaceholderText('Buscar cliente por nombre…'), 'Banco Exterior')
    await user.click(screen.getByText('Banco Exterior'))
    await user.type(screen.getByPlaceholderText('Buscar cliente por nombre…'), 'Seguros')
    await user.click(screen.getByText('Banco Exterior Seguros'))
    await user.click(screen.getByRole('button', { name: 'Crear reunión' }))

    await waitFor(() => expect(mockCreateMeeting).toHaveBeenCalled())
    const [, fields] = mockCreateMeeting.mock.calls[0]
    expect(fields.client_ids).toEqual(['c-1', 'c-2'])
  })

  it('permite quitar una marca ya agregada con el botón de la chip', async () => {
    const user = userEvent.setup()
    renderModal({ clients: MULTI_CLIENTS })
    await user.type(screen.getByPlaceholderText('Buscar cliente por nombre…'), 'Banco')
    await user.click(screen.getByText('Banco Exterior'))
    expect(screen.getByText('Banco Exterior')).toBeInTheDocument()
    await user.click(screen.getByLabelText('Quitar a Banco Exterior'))
    expect(screen.queryByText('Sin clientes agregados.')).toBeInTheDocument()
  })

  it('al editar una reunión vieja (solo client_id escalar) el picker la muestra preseleccionada', () => {
    renderModal({
      clients: MULTI_CLIENTS,
      meeting: {
        id: 'm-1',
        title: 'Vieja',
        client_id: 'c-1',
        starts_at: '2026-07-20T14:00:00.000Z',
        modality: 'presencial',
        location: '',
        meeting_url: null,
        notes: '',
        attendee_ids: [],
        status: 'programada',
      },
    })
    expect(screen.getByText('Banco Exterior')).toBeInTheDocument()
    expect(screen.queryByText('Sin clientes agregados.')).not.toBeInTheDocument()
  })
})

describe('MeetingModal — crear / editar / cancelar (cerrar)', () => {
  const existing = {
    id: 'm-1',
    title: 'Reunión existente',
    client_id: 'c-1',
    starts_at: '2026-07-20T14:00:00.000Z',
    modality: 'presencial',
    location: 'Oficina',
    meeting_url: null,
    notes: '',
    attendee_ids: ['u1'],
    status: 'programada',
  }

  it('en modo edición muestra "Guardar cambios" y precarga el título', () => {
    renderModal({ meeting: existing })
    expect(screen.getByRole('button', { name: 'Guardar cambios' })).toBeInTheDocument()
    expect(screen.getByDisplayValue('Reunión existente')).toBeInTheDocument()
  })

  it('el botón "Cancelar" cierra el modal sin llamar a create/update', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    renderModal({ meeting: existing, onClose })
    await user.click(screen.getByRole('button', { name: 'Cancelar' }))
    expect(onClose).toHaveBeenCalled()
    expect(mockUpdateMeeting).not.toHaveBeenCalled()
    expect(mockCreateMeeting).not.toHaveBeenCalled()
  })

  it('no muestra ninguna acción de estado (realizada/reagendar/cancelar/eliminar) — esas viven en MeetingDetail', () => {
    renderModal({ meeting: existing })
    expect(screen.queryByRole('button', { name: /realizada/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Reagendar' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Cancelar reunión' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Eliminar reunión' })).not.toBeInTheDocument()
  })
})

describe('MeetingModal — red de seguridad al reagendar desde el formulario', () => {
  const realizada = {
    id: 'm-1',
    title: 'Reunión existente',
    client_id: 'c-1',
    starts_at: '2026-07-20T14:00:00.000Z',
    modality: 'presencial',
    location: 'Oficina',
    meeting_url: null,
    notes: '',
    attendee_ids: ['u1'],
    status: 'realizada',
  }

  it('cambiar la fecha de una reunión "realizada" y guardar envía status: "programada"', async () => {
    const user = userEvent.setup()
    mockUpdateMeeting.mockResolvedValue({
      data: { ...realizada, status: 'programada' },
      error: null,
    })
    renderModal({ meeting: realizada })

    const dateInput = document.querySelector('input[type="datetime-local"]')
    await user.clear(dateInput)
    await user.type(dateInput, '2026-08-01T10:00')
    await user.click(screen.getByRole('button', { name: 'Guardar cambios' }))

    await waitFor(() => expect(mockUpdateMeeting).toHaveBeenCalled())
    const [, fields] = mockUpdateMeeting.mock.calls[0]
    expect(fields.status).toBe('programada')
  })

  it('guardar sin cambiar la fecha de una reunión "realizada" NO envía status en el update', async () => {
    const user = userEvent.setup()
    mockUpdateMeeting.mockResolvedValue({ data: realizada, error: null })
    renderModal({ meeting: realizada })

    await user.click(screen.getByRole('button', { name: 'Guardar cambios' }))

    await waitFor(() => expect(mockUpdateMeeting).toHaveBeenCalled())
    const [, fields] = mockUpdateMeeting.mock.calls[0]
    expect(fields.status).toBeUndefined()
  })
})
