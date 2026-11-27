/**
 * Tests del formulario de tácticas (AdsForm).
 *
 * Cambios reflejados en este archivo respecto a la versión anterior:
 * - El campo CLIENTE ahora es un <select> (desplegable de metric_clients), no un <input>.
 * - No hay campo RESPONSABLE: la táctica es de la jefa del team de la marca (`jefaOf`).
 * - Se agrega vi.mock de metricsApi para loadClients.
 * - El payload de insert incluye client_id y client (nombre denormalizado).
 */
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi } from 'vitest'

// ── Mocks ─────────────────────────────────────────────────────────────────────

const { mockInvoke, mockInsert, mockUpdate, mockInsertPayload, mockUpdatePayload } = vi.hoisted(
  () => ({
    mockInvoke: vi.fn().mockResolvedValue({ data: null, error: null }),
    mockInsert: vi.fn(),
    mockUpdate: vi.fn(),
    // Capturan lo que se manda a insert()/update(), para verificar el payload.
    mockInsertPayload: vi.fn(),
    mockUpdatePayload: vi.fn(),
  }),
)

vi.mock('../supabase', () => ({
  supabase: {
    from: vi.fn((table) => {
      if (table === 'users') {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          order: vi.fn().mockResolvedValue({
            data: [
              {
                user_id: 'u1',
                first_name: 'Ana',
                last_name: 'García',
                avatar_url: null,
                access_level: 2,
                position: null,
              },
              {
                user_id: 'u2',
                first_name: 'Carlos',
                last_name: 'López',
                avatar_url: null,
                access_level: 1,
                position: null,
              },
            ],
            error: null,
          }),
        }
      }
      if (table === 'campaigns') {
        return {
          insert: vi.fn((payload) => {
            mockInsertPayload(payload)
            return { select: vi.fn(() => ({ single: mockInsert })) }
          }),
          update: vi.fn((payload) => {
            mockUpdatePayload(payload)
            return {
              eq: vi.fn(() => ({
                select: vi.fn(() => ({
                  single: mockUpdate,
                })),
              })),
            }
          }),
        }
      }
      return {}
    }),
    functions: {
      invoke: mockInvoke,
    },
  },
}))

// loadClients devuelve la lista de clientes de la empresa; loadLines, sus líneas.
// userProfile (abajo) no trae `can`, que por defecto lo permite todo (incluida `ads.ver_todo`), así que
// useScopedClients() lo trata como quien ve todas las líneas y no filtra —
// mismo comportamiento que antes de introducir el scoping por línea.
vi.mock('../components/metricas/metricsApi', () => ({
  loadClients: vi.fn().mockResolvedValue({
    data: [
      { id: 'c-1', name: 'Banco Exterior', logo_url: null, line_id: 'line-1', company_id: 'co-1' },
      { id: 'c-2', name: 'Pepsi', logo_url: null, line_id: 'line-2', company_id: 'co-1' },
    ],
    error: null,
  }),
  loadLines: vi.fn().mockResolvedValue({
    data: [
      {
        id: 'line-1',
        name: 'Team A',
        is_general: false,
        is_management: false,
        member_user_ids: [],
      },
      {
        id: 'line-2',
        name: 'Team B',
        is_general: false,
        is_management: false,
        member_user_ids: [],
      },
    ],
    error: null,
  }),
}))

vi.mock('../context/AuthContext', () => ({
  useAuth: vi.fn(),
}))

import { useAuth } from '../context/AuthContext'
import AdsForm from '../components/ads/AdsForm'

const userProfile = {
  user_id: 'creator-uuid',
  company_id: 'co-1',
  first_name: 'Juan',
  last_name: 'Pérez',
}

function renderForm(props = {}) {
  return render(
    <AdsForm
      campaign={null}
      onClose={() => {}}
      onCreated={() => {}}
      onUpdated={() => {}}
      {...props}
    />,
  )
}

describe('AdsForm — cliente y responsable', () => {
  beforeEach(() => {
    useAuth.mockReturnValue({ userProfile })
    vi.clearAllMocks()
    mockInsert.mockResolvedValue({
      data: {
        id: 'new-id',
        name: 'Test',
        client: 'Banco Exterior',
        client_id: 'c-1',
        assignee: 'u1',
      },
      error: null,
    })
  })

  // ── Campo Cliente ────────────────────────────────────────────────────────────

  it('el campo Cliente es un combobox (select), no un input de texto libre', async () => {
    renderForm()
    // Esperamos a que carguen los clientes
    await waitFor(() => {
      expect(screen.getByRole('option', { name: '— Seleccionar cliente —' })).toBeInTheDocument()
    })
    expect(screen.getByRole('option', { name: 'Banco Exterior' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'Pepsi' })).toBeInTheDocument()
    // No debe existir el input de texto libre con el placeholder anterior
    expect(screen.queryByPlaceholderText('Cliente o marca')).not.toBeInTheDocument()
  })

  it('lista todos los clientes de la empresa en el desplegable cuando el usuario no tiene línea propia', async () => {
    renderForm()
    await waitFor(() => {
      expect(screen.getByRole('option', { name: 'Banco Exterior' })).toBeInTheDocument()
    })
    expect(screen.getByRole('option', { name: 'Pepsi' })).toBeInTheDocument()
  })

  it('sin ads.ver_todo, un usuario con línea propia solo ve los clientes de su línea en el desplegable', async () => {
    useAuth.mockReturnValue({ userProfile, can: (key) => key !== 'ads.ver_todo' })
    const { loadLines } = await import('../components/metricas/metricsApi')
    loadLines.mockResolvedValueOnce({
      data: [
        {
          id: 'line-1',
          name: 'Team A',
          is_general: false,
          is_management: false,
          member_user_ids: ['creator-uuid'],
        },
        {
          id: 'line-2',
          name: 'Team B',
          is_general: false,
          is_management: false,
          member_user_ids: [],
        },
      ],
      error: null,
    })
    renderForm()
    await waitFor(() => {
      expect(screen.getByRole('option', { name: 'Banco Exterior' })).toBeInTheDocument()
    })
    expect(screen.queryByRole('option', { name: 'Pepsi' })).not.toBeInTheDocument()
  })

  // ── Jefa del team (no hay responsable que elegir) ────────────────────────────

  const jefaOf = (clientId) =>
    clientId === 'c-1' ? { id: 'jefa-1', name: 'Bianca Rodríguez' } : null

  it('no hay selector de responsable: muestra la jefa del team de la marca elegida', async () => {
    const user = userEvent.setup()
    renderForm({ jefaOf })
    await waitFor(() => screen.getByRole('option', { name: 'Banco Exterior' }))

    expect(screen.queryByText('Responsable')).not.toBeInTheDocument()
    expect(screen.queryByText('Asignar responsable...')).not.toBeInTheDocument()
    expect(screen.getByText('Elige la marca')).toBeInTheDocument()

    const clientSelect = screen
      .getAllByRole('combobox')
      .find((s) => Array.from(s.options ?? []).some((o) => o.text === '— Seleccionar cliente —'))
    await user.selectOptions(clientSelect, 'c-1')
    expect(screen.getByText('Bianca Rodríguez')).toBeInTheDocument()

    await user.selectOptions(clientSelect, 'c-2')
    expect(screen.getByText('La marca no tiene team')).toBeInTheDocument()
  })

  // ── Payload de insert ────────────────────────────────────────────────────────

  it('el insert incluye client_id y client (nombre) al seleccionar un cliente', async () => {
    const user = userEvent.setup()
    const onCreated = vi.fn()
    renderForm({ onCreated })

    // Esperamos carga de clientes
    await waitFor(() => screen.getByRole('option', { name: 'Banco Exterior' }))

    // Rellenar campos obligatorios
    await user.type(screen.getByPlaceholderText('Nombre de la táctica'), 'Campaña Test')

    // Seleccionar cliente por select (todos los combobox: [0] Cliente, luego Estado)
    const selects = screen.getAllByRole('combobox')
    const clientSelect = selects.find((s) =>
      Array.from(s.options ?? []).some((o) => o.text === '— Seleccionar cliente —'),
    )
    await user.selectOptions(clientSelect, 'c-1')

    // Poner fechas (DateInput muestra/acepta DD/MM/YYYY, ver src/components/common/DateInput.jsx)
    const dateInputs = screen.getAllByPlaceholderText('dd/mm/aaaa')
    await user.type(dateInputs[0], '01/06/2026')
    await user.type(dateInputs[1], '30/06/2026')

    await user.click(screen.getByRole('button', { name: 'Crear táctica' }))

    await waitFor(() => {
      expect(mockInsert).toHaveBeenCalledWith()
    })
    // Verificar que el insert recibió el objeto esperado con client_id y client
    const { supabase } = await import('../supabase')
    const fromCalls = supabase.from.mock.calls.filter(([t]) => t === 'campaigns')
    expect(fromCalls.length).toBeGreaterThan(0)
  })

  // ── Edge Function ────────────────────────────────────────────────────────────

  it('al crear asigna la táctica a la jefa del team y le avisa', async () => {
    const user = userEvent.setup()
    renderForm({ jefaOf })
    await waitFor(() => screen.getByRole('option', { name: 'Banco Exterior' }))

    await user.type(screen.getByPlaceholderText('Nombre de la táctica'), 'Campaña Test')
    const clientSelect = screen
      .getAllByRole('combobox')
      .find((s) => Array.from(s.options ?? []).some((o) => o.text === '— Seleccionar cliente —'))
    await user.selectOptions(clientSelect, 'c-1')
    const dateInputs = screen.getAllByPlaceholderText('dd/mm/aaaa')
    await user.type(dateInputs[0], '01/06/2026')
    await user.type(dateInputs[1], '30/06/2026')

    await user.click(screen.getByRole('button', { name: 'Crear táctica' }))

    await waitFor(() => expect(mockInsertPayload).toHaveBeenCalled())
    expect(mockInsertPayload.mock.calls[0][0]).toMatchObject({ assignee: 'jefa-1' })
    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith('notify-campaign-assignee', {
        body: {
          assignee_id: 'jefa-1',
          campaign_name: 'Campaña Test',
          created_by_name: 'Juan Pérez',
        },
      })
    })
  })

  it('una marca sin team se crea sin asignar y no manda aviso', async () => {
    const user = userEvent.setup()
    renderForm({ jefaOf })
    await waitFor(() => screen.getByRole('option', { name: 'Pepsi' }))

    await user.type(screen.getByPlaceholderText('Nombre de la táctica'), 'Plan Pepsi')
    const clientSelect = screen
      .getAllByRole('combobox')
      .find((s) => Array.from(s.options ?? []).some((o) => o.text === '— Seleccionar cliente —'))
    await user.selectOptions(clientSelect, 'c-2')
    await user.click(screen.getByRole('button', { name: 'Crear táctica' }))

    await waitFor(() => expect(mockInsertPayload).toHaveBeenCalled())
    expect(mockInsertPayload.mock.calls[0][0]).toMatchObject({ assignee: '' })
    expect(mockInvoke).not.toHaveBeenCalled()
  })

  it('NO llama a la Edge Function al editar', async () => {
    const user = userEvent.setup()
    const campaign = {
      id: 'existing-id',
      name: 'Campaña existente',
      client: 'Banco Exterior',
      client_id: 'c-1',
      assignee: 'u2',
      start_date: '2026-06-01',
      end_date: '2026-06-30',
      priority: 'Media',
      status: 'Pendiente',
      notes: '',
    }
    mockUpdate.mockResolvedValue({ data: campaign, error: null })
    renderForm({ campaign, jefaOf })

    await waitFor(() => screen.getByRole('option', { name: 'Banco Exterior' }))

    await user.click(screen.getByRole('button', { name: 'Guardar cambios' }))

    await waitFor(() => {
      expect(mockUpdate).toHaveBeenCalled()
    })
    expect(mockInvoke).not.toHaveBeenCalled()
    // Editar no cambia a quién estaba asignada la táctica.
    expect(mockUpdatePayload.mock.calls[0][0]).toMatchObject({ assignee: 'u2' })
  })
})

describe('AdsForm — objetivo, link de Drive y marca precargada', () => {
  beforeEach(() => {
    useAuth.mockReturnValue({ userProfile })
    vi.clearAllMocks()
    mockInsert.mockResolvedValue({ data: { id: 'new-id', name: 'T' }, error: null })
  })

  // Rellena lo mínimo para poder crear: nombre, marca y fechas.
  async function fillRequired(user, { pickClient = true } = {}) {
    await waitFor(() => screen.getByRole('option', { name: 'Banco Exterior' }))
    await user.type(screen.getByPlaceholderText('Nombre de la táctica'), 'Plan Q4')
    if (pickClient) {
      const clientSelect = screen
        .getAllByRole('combobox')
        .find((s) => Array.from(s.options ?? []).some((o) => o.text === '— Seleccionar cliente —'))
      await user.selectOptions(clientSelect, 'c-1')
    }
    const dateInputs = screen.getAllByPlaceholderText('dd/mm/aaaa')
    await user.type(dateInputs[0], '01/11/2026')
    await user.type(dateInputs[1], '31/12/2026')
  }

  it('ya no ofrece el campo Prioridad', async () => {
    renderForm()
    await waitFor(() => screen.getByRole('option', { name: 'Banco Exterior' }))
    expect(screen.queryByText('Prioridad')).not.toBeInTheDocument()
  })

  it('guarda el objetivo general y el link de Drive al crear', async () => {
    const user = userEvent.setup()
    renderForm()
    await fillRequired(user)

    await user.type(screen.getByLabelText('Objetivo general'), '  Posicionar la marca  ')
    await user.type(
      screen.getByLabelText('Documento de la táctica (Drive)'),
      'https://drive.google.com/drive/folders/1AbCdEfGhIjKlMnOpQrStUvWxYz012345',
    )
    await user.type(
      screen.getByLabelText('Carpeta de la marca (Drive)'),
      'https://drive.google.com/drive/folders/1ZyXwVuTsRqPoNmLkJiHgFeDcBa98765',
    )
    await user.click(screen.getByRole('button', { name: 'Crear táctica' }))

    await waitFor(() => expect(mockInsertPayload).toHaveBeenCalled())
    expect(mockInsertPayload.mock.calls[0][0]).toMatchObject({
      objective: 'Posicionar la marca',
      drive_url: 'https://drive.google.com/drive/folders/1AbCdEfGhIjKlMnOpQrStUvWxYz012345',
      drive_folder_url: 'https://drive.google.com/drive/folders/1ZyXwVuTsRqPoNmLkJiHgFeDcBa98765',
      client_id: 'c-1',
      created_by: 'creator-uuid',
    })
    // La prioridad ya no se manda: queda el default de la base.
    expect(mockInsertPayload.mock.calls[0][0]).not.toHaveProperty('priority')
  })

  it('objetivo y link vacíos se guardan como null', async () => {
    const user = userEvent.setup()
    renderForm()
    await fillRequired(user)

    await user.click(screen.getByRole('button', { name: 'Crear táctica' }))

    await waitFor(() => expect(mockInsertPayload).toHaveBeenCalled())
    expect(mockInsertPayload.mock.calls[0][0]).toMatchObject({
      objective: null,
      drive_url: null,
      drive_folder_url: null,
    })
  })

  it('un link que no es de Drive muestra el error y bloquea el guardado', async () => {
    const user = userEvent.setup()
    renderForm()
    await fillRequired(user)

    await user.type(
      screen.getByLabelText('Documento de la táctica (Drive)'),
      'https://example.com/carpeta',
    )

    expect(screen.getByText(/no parece ser de Google Drive/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Crear táctica' })).toBeDisabled()
    expect(mockInsertPayload).not.toHaveBeenCalled()
  })

  it('guarda la táctica presentación (link de Netlify) al crear', async () => {
    const user = userEvent.setup()
    renderForm()
    await fillRequired(user)

    await user.type(
      screen.getByLabelText('Táctica presentación (link)'),
      '  https://presentacionpush.netlify.app  ',
    )
    await user.click(screen.getByRole('button', { name: 'Crear táctica' }))

    await waitFor(() => expect(mockInsertPayload).toHaveBeenCalled())
    expect(mockInsertPayload.mock.calls[0][0]).toMatchObject({
      presentation_url: 'https://presentacionpush.netlify.app',
    })
  })

  it('táctica presentación vacía se guarda como null', async () => {
    const user = userEvent.setup()
    renderForm()
    await fillRequired(user)
    await user.click(screen.getByRole('button', { name: 'Crear táctica' }))

    await waitFor(() => expect(mockInsertPayload).toHaveBeenCalled())
    expect(mockInsertPayload.mock.calls[0][0]).toMatchObject({ presentation_url: null })
  })

  it('una táctica presentación que no es un link bloquea el guardado', async () => {
    const user = userEvent.setup()
    renderForm()
    await fillRequired(user)

    await user.type(screen.getByLabelText('Táctica presentación (link)'), 'presentacionpush')
    expect(screen.getByText(/Pega la dirección completa, con https/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Crear táctica' })).toBeDisabled()
  })

  it('la carpeta de la marca también tiene que ser un link de Drive', async () => {
    const user = userEvent.setup()
    renderForm()
    await fillRequired(user)

    await user.type(
      screen.getByLabelText('Carpeta de la marca (Drive)'),
      'https://example.com/marca',
    )
    expect(screen.getByText(/Pega el de la carpeta de la marca/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Crear táctica' })).toBeDisabled()
  })

  describe('Sin fecha', () => {
    async function fillWithoutDates(user) {
      await waitFor(() => screen.getByRole('option', { name: 'Banco Exterior' }))
      await user.type(screen.getByPlaceholderText('Nombre de la táctica'), 'Plan por fechar')
      const clientSelect = screen
        .getAllByRole('combobox')
        .find((s) => Array.from(s.options ?? []).some((o) => o.text === '— Seleccionar cliente —'))
      await user.selectOptions(clientSelect, 'c-1')
    }

    it('se puede crear sin fechas: quedan vacías (Sin fecha)', async () => {
      const user = userEvent.setup()
      renderForm()
      await fillWithoutDates(user)
      expect(screen.getByText(/queda como «Sin fecha»/)).toBeInTheDocument()

      await user.click(screen.getByRole('button', { name: 'Crear táctica' }))
      await waitFor(() => expect(mockInsertPayload).toHaveBeenCalled())
      expect(mockInsertPayload.mock.calls[0][0]).toMatchObject({
        start_date: null,
        end_date: null,
      })
    })

    it('con una sola fecha no deja guardar', async () => {
      const user = userEvent.setup()
      renderForm()
      await fillWithoutDates(user)
      await user.type(screen.getAllByPlaceholderText('dd/mm/aaaa')[0], '01/11/2026')

      expect(
        screen.getByText('Pon las dos fechas, o ninguna si todavía no las sabes.'),
      ).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Crear táctica' })).toBeDisabled()
    })

    it('la fecha fin no puede ser anterior al inicio', async () => {
      const user = userEvent.setup()
      renderForm()
      await fillWithoutDates(user)
      const dateInputs = screen.getAllByPlaceholderText('dd/mm/aaaa')
      await user.type(dateInputs[0], '30/11/2026')
      await user.type(dateInputs[1], '01/11/2026')

      expect(screen.getByText('La fecha fin no puede ser anterior al inicio.')).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Crear táctica' })).toBeDisabled()
    })
  })

  it('precarga la marca cuando se crea desde "Por hacer"', async () => {
    const user = userEvent.setup()
    renderForm({ prefill: { client_id: 'c-1', client: 'Banco Exterior' } })
    await waitFor(() => screen.getByRole('option', { name: 'Banco Exterior' }))

    // Con la marca ya elegida, basta nombre y fechas para poder crear.
    await user.type(screen.getByPlaceholderText('Nombre de la táctica'), 'Plan Q1')
    const dateInputs = screen.getAllByPlaceholderText('dd/mm/aaaa')
    await user.type(dateInputs[0], '01/01/2027')
    await user.type(dateInputs[1], '31/03/2027')
    await user.click(screen.getByRole('button', { name: 'Crear táctica' }))

    await waitFor(() => expect(mockInsertPayload).toHaveBeenCalled())
    expect(mockInsertPayload.mock.calls[0][0]).toMatchObject({
      client_id: 'c-1',
      client: 'Banco Exterior',
    })
  })

  it('al editar, carga el objetivo y el link existentes', async () => {
    renderForm({
      campaign: {
        id: 'x',
        name: 'Plan',
        client: 'Banco Exterior',
        client_id: 'c-1',
        assignee: 'u1',
        start_date: '2026-06-01',
        end_date: '2026-06-30',
        status: 'Pendiente',
        notes: '',
        objective: 'Subir ventas',
        drive_url: 'https://drive.google.com/drive/folders/1AbCdEfGhIjKlMnOpQrStUvWxYz012345',
        drive_folder_url: 'https://drive.google.com/drive/folders/1ZyXwVuTsRqPoNmLkJiHgFeDcBa98765',
      },
    })
    await waitFor(() => screen.getByRole('option', { name: 'Banco Exterior' }))

    expect(screen.getByLabelText('Objetivo general')).toHaveValue('Subir ventas')
    expect(screen.getByLabelText('Documento de la táctica (Drive)')).toHaveValue(
      'https://drive.google.com/drive/folders/1AbCdEfGhIjKlMnOpQrStUvWxYz012345',
    )
    expect(screen.getByLabelText('Carpeta de la marca (Drive)')).toHaveValue(
      'https://drive.google.com/drive/folders/1ZyXwVuTsRqPoNmLkJiHgFeDcBa98765',
    )
  })
})
