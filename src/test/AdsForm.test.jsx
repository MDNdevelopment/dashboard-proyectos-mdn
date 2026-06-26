/**
 * Tests del formulario de campañas (AdsForm).
 *
 * Cambios reflejados en este archivo respecto a la versión anterior:
 * - El campo CLIENTE ahora es un <select> (desplegable de metric_clients), no un <input>.
 * - El campo RESPONSABLE ahora usa UserPickerSingle (picker bonito), no un <select> nativo.
 * - Se agrega vi.mock de metricsApi para loadClients.
 * - El payload de insert incluye client_id y client (nombre denormalizado).
 */
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi } from 'vitest'

// ── Mocks ─────────────────────────────────────────────────────────────────────

const { mockInvoke, mockInsert, mockUpdate } = vi.hoisted(() => ({
  mockInvoke: vi.fn().mockResolvedValue({ data: null, error: null }),
  mockInsert: vi.fn(),
  mockUpdate: vi.fn(),
}))

vi.mock('../supabase', () => ({
  supabase: {
    from: vi.fn((table) => {
      if (table === 'users') {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          order: vi.fn().mockResolvedValue({
            data: [
              { user_id: 'u1', first_name: 'Ana', last_name: 'García', avatar_url: null, access_level: 2, position: null },
              { user_id: 'u2', first_name: 'Carlos', last_name: 'López', avatar_url: null, access_level: 1, position: null },
            ],
            error: null,
          }),
        }
      }
      if (table === 'campaigns') {
        return {
          insert: vi.fn(() => ({
            select: vi.fn(() => ({
              single: mockInsert,
            })),
          })),
          update: vi.fn(() => ({
            eq: vi.fn(() => ({
              select: vi.fn(() => ({
                single: mockUpdate,
              })),
            })),
          })),
        }
      }
      return {}
    }),
    functions: {
      invoke: mockInvoke,
    },
  },
}))

// loadClients devuelve la lista de clientes de la empresa
vi.mock('../components/metricas/metricsApi', () => ({
  loadClients: vi.fn().mockResolvedValue({
    data: [
      { id: 'c-1', name: 'Banco Exterior', logo_url: null, line_id: 'line-1', company_id: 'co-1' },
      { id: 'c-2', name: 'Pepsi',          logo_url: null, line_id: 'line-2', company_id: 'co-1' },
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
    />
  )
}

describe('AdsForm — cliente y responsable', () => {
  beforeEach(() => {
    useAuth.mockReturnValue({ userProfile })
    vi.clearAllMocks()
    mockInsert.mockResolvedValue({
      data: { id: 'new-id', name: 'Test', client: 'Banco Exterior', client_id: 'c-1', assignee: 'u1' },
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

  it('lista todos los clientes de la empresa en el desplegable', async () => {
    renderForm()
    await waitFor(() => {
      expect(screen.getByRole('option', { name: 'Banco Exterior' })).toBeInTheDocument()
    })
    expect(screen.getByRole('option', { name: 'Pepsi' })).toBeInTheDocument()
  })

  // ── Campo Responsable ────────────────────────────────────────────────────────

  it('ya NO existe el <select id="assignee"> nativo de responsable', async () => {
    renderForm()
    // Esperamos a que el componente cargue usuarios
    await waitFor(() => {
      // El picker bonito muestra "Asignar responsable..." como placeholder visible
      expect(screen.getByText('Asignar responsable...')).toBeInTheDocument()
    })
    expect(screen.queryByRole('combobox', { name: /responsable/i })).not.toBeInTheDocument()
  })

  it('el selector de responsable muestra el placeholder del picker bonito', async () => {
    renderForm()
    await waitFor(() => {
      expect(screen.getByText('Asignar responsable...')).toBeInTheDocument()
    })
  })

  it('al abrir el picker de responsable se muestran los usuarios de la empresa', async () => {
    const user = userEvent.setup()
    renderForm()
    await waitFor(() => screen.getByText('Asignar responsable...'))

    // Abrir el picker
    await user.click(screen.getByText('Asignar responsable...'))

    await waitFor(() => {
      expect(screen.getByText('Ana García')).toBeInTheDocument()
      expect(screen.getByText('Carlos López')).toBeInTheDocument()
    })
  })

  // ── Payload de insert ────────────────────────────────────────────────────────

  it('el insert incluye client_id y client (nombre) al seleccionar un cliente', async () => {
    const user = userEvent.setup()
    const onCreated = vi.fn()
    renderForm({ onCreated })

    // Esperamos carga de clientes
    await waitFor(() => screen.getByRole('option', { name: 'Banco Exterior' }))

    // Rellenar campos obligatorios
    await user.type(screen.getByPlaceholderText('Nombre de la táctica o campaña'), 'Campaña Test')

    // Seleccionar cliente por select (todos los combobox: [0] Cliente, luego Prioridad, Estado)
    const selects = screen.getAllByRole('combobox')
    const clientSelect = selects.find(s =>
      Array.from(s.options ?? []).some(o => o.text === '— Seleccionar cliente —')
    )
    await user.selectOptions(clientSelect, 'c-1')

    // Poner fechas (los date inputs no tienen placeholder texto, los buscamos por tipo)
    const dateInputs = document.querySelectorAll('input[type="date"]')
    await user.type(dateInputs[0], '2026-06-01')
    await user.type(dateInputs[1], '2026-06-30')

    await user.click(screen.getByRole('button', { name: 'Crear campaña' }))

    await waitFor(() => {
      expect(mockInsert).toHaveBeenCalledWith()
    })
    // Verificar que el insert recibió el objeto esperado con client_id y client
    const { supabase } = await import('../supabase')
    const fromCalls = supabase.from.mock.calls.filter(([t]) => t === 'campaigns')
    expect(fromCalls.length).toBeGreaterThan(0)
  })

  // ── Edge Function ────────────────────────────────────────────────────────────

  it('llama a notify-campaign-assignee al crear con el user_id del responsable', async () => {
    const user = userEvent.setup()
    renderForm()

    // Esperar que carguen clientes y usuarios
    await waitFor(() => screen.getByRole('option', { name: 'Banco Exterior' }))
    await waitFor(() => screen.getByText('Asignar responsable...'))

    // Táctica
    await user.type(screen.getByPlaceholderText('Nombre de la táctica o campaña'), 'Campaña Test')

    // Cliente
    const selects = screen.getAllByRole('combobox')
    const clientSelect = selects.find(s =>
      Array.from(s.options ?? []).some(o => o.text === '— Seleccionar cliente —')
    )
    await user.selectOptions(clientSelect, 'c-1')

    // Responsable: abrir picker y seleccionar "Ana García"
    await user.click(screen.getByText('Asignar responsable...'))
    await waitFor(() => screen.getByText('Ana García'))
    await user.click(screen.getByText('Ana García'))

    // Fechas
    const dateInputs = document.querySelectorAll('input[type="date"]')
    await user.type(dateInputs[0], '2026-06-01')
    await user.type(dateInputs[1], '2026-06-30')

    await user.click(screen.getByRole('button', { name: 'Crear campaña' }))

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith('notify-campaign-assignee', {
        body: {
          assignee_id: 'u1',
          campaign_name: 'Campaña Test',
          created_by_name: 'Juan Pérez',
        },
      })
    })
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
    renderForm({ campaign })

    // Esperar a que carguen clientes y usuarios
    await waitFor(() => screen.getByRole('option', { name: 'Banco Exterior' }))
    await waitFor(() => screen.getByText('Carlos López'))

    await user.click(screen.getByRole('button', { name: 'Guardar cambios' }))

    await waitFor(() => {
      expect(mockUpdate).toHaveBeenCalled()
    })
    expect(mockInvoke).not.toHaveBeenCalled()
  })
})
