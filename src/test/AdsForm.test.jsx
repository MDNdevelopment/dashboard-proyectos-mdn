import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi } from 'vitest'

// --- Mocks ---

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
              { user_id: 'u1', first_name: 'Ana', last_name: 'García', email: 'ana@mdn.com' },
              { user_id: 'u2', first_name: 'Carlos', last_name: 'López', email: 'carlos@mdn.com' },
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

vi.mock('../context/AuthContext', () => ({
  useAuth: vi.fn(),
}))

import { useAuth } from '../context/AuthContext'
import { supabase } from '../supabase'
import AdsForm from '../components/ads/AdsForm'

const userProfile = {
  user_id: 'creator-uuid',
  company_id: 'company-uuid',
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

describe('AdsForm — Assignee dropdown', () => {
  beforeEach(() => {
    useAuth.mockReturnValue({ userProfile })
    vi.clearAllMocks()
    mockInsert.mockResolvedValue({
      data: { id: 'new-id', name: 'Test', assignee: 'u1' },
      error: null,
    })
  })

  it('renderiza el select de responsable', async () => {
    renderForm()
    await waitFor(() => {
      expect(screen.getByLabelText('Responsable')).toBeInTheDocument()
    })
  })

  it('muestra las opciones de usuarios de la compañía', async () => {
    renderForm()
    await waitFor(() => {
      expect(screen.getByRole('option', { name: 'Ana García' })).toBeInTheDocument()
      expect(screen.getByRole('option', { name: 'Carlos López' })).toBeInTheDocument()
    })
  })

  it('muestra la opción placeholder vacía', async () => {
    renderForm()
    await waitFor(() => {
      expect(screen.getByRole('option', { name: /seleccionar responsable/i })).toBeInTheDocument()
    })
  })

  it('almacena el user_id al seleccionar un responsable', async () => {
    renderForm()
    await waitFor(() => screen.getByRole('option', { name: 'Ana García' }))

    await userEvent.selectOptions(screen.getByLabelText('Responsable'), 'u1')

    expect(screen.getByLabelText('Responsable')).toHaveValue('u1')
  })

  it('llama a la Edge Function notify-campaign-assignee al crear', async () => {
    renderForm()
    await waitFor(() => screen.getByRole('option', { name: 'Ana García' }))

    await userEvent.type(screen.getByPlaceholderText('Nombre de la táctica o campaña'), 'Campaña Test')
    await userEvent.type(screen.getByPlaceholderText('Cliente o marca'), 'Cliente SA')
    await userEvent.selectOptions(screen.getByLabelText('Responsable'), 'u1')

    const [startDate, endDate] = screen.getAllByDisplayValue('')
    await userEvent.type(startDate, '2026-06-01')
    await userEvent.type(endDate, '2026-06-30')

    await userEvent.click(screen.getByRole('button', { name: 'Crear campaña' }))

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
    const campaign = {
      id: 'existing-id',
      name: 'Campaña existente',
      client: 'Cliente',
      assignee: 'u2',
      start_date: '2026-06-01',
      end_date: '2026-06-30',
      priority: 'Media',
      status: 'Pendiente',
      notes: '',
    }
    mockUpdate.mockResolvedValue({ data: campaign, error: null })
    renderForm({ campaign })

    await waitFor(() => screen.getByRole('option', { name: 'Carlos López' }))

    await userEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }))

    await waitFor(() => {
      expect(mockUpdate).toHaveBeenCalled()
    })
    expect(mockInvoke).not.toHaveBeenCalled()
  })
})
