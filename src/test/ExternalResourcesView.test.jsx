import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi } from 'vitest'
import { createSupabaseMock, makeQuery } from './helpers/supabaseMock'
import ExternalResourcesView from '../components/empresa/ExternalResourcesView'

// ── Mock supabase ─────────────────────────────────────────────────────────────
let MOCK_RESOURCES = []

vi.mock('../supabase', () => ({
  supabase: createSupabaseMock({
    tables: {
      external_resources: () => makeQuery(MOCK_RESOURCES),
    },
  }),
}))

beforeEach(() => {
  MOCK_RESOURCES = [
    {
      id: 'r1',
      full_name: 'Alan Puentes',
      roles: ['grabacion'],
      deleted_at: null,
      company_id: 'co-1',
    },
    {
      id: 'r2',
      full_name: 'David Martinez',
      roles: ['ads'],
      deleted_at: null,
      company_id: 'co-1',
    },
  ]
})

describe('ExternalResourcesView', () => {
  it('lista los recursos externos activos con sus roles', async () => {
    render(<ExternalResourcesView companyId="co-1" />)
    await waitFor(() => {
      expect(screen.getByText('Alan Puentes')).toBeInTheDocument()
    })
    expect(screen.getByText('David Martinez')).toBeInTheDocument()
    expect(screen.getByText('Grabación (foto/video)')).toBeInTheDocument()
    expect(screen.getByText('Ads')).toBeInTheDocument()
  })

  it('crea un recurso externo nuevo con los roles seleccionados', async () => {
    const user = userEvent.setup()
    const created = {
      id: 'r3',
      full_name: 'Jeremy Gando',
      roles: ['grabacion', 'edicion'],
      deleted_at: null,
      company_id: 'co-1',
    }
    const { supabase } = await import('../supabase')
    supabase.from.mockImplementation((table) => {
      if (table !== 'external_resources') return makeQuery([])
      const q = makeQuery(MOCK_RESOURCES)
      q.insert = vi.fn(() => ({
        select: () => ({ single: () => Promise.resolve({ data: created, error: null }) }),
      }))
      return q
    })

    render(<ExternalResourcesView companyId="co-1" />)
    await waitFor(() => expect(screen.getByText('Alan Puentes')).toBeInTheDocument())

    await user.click(screen.getByRole('button', { name: '+ Agregar recurso externo' }))
    await user.type(screen.getByPlaceholderText('Ej. Alan Puentes'), 'Jeremy Gando')
    await user.click(screen.getByLabelText('Grabación (foto/video)'))
    await user.click(screen.getByLabelText('Edición'))
    await user.click(screen.getByRole('button', { name: 'Guardar' }))

    await waitFor(() => {
      expect(screen.getByText('Jeremy Gando')).toBeInTheDocument()
    })
  })

  it('archiva un recurso externo (soft delete) y lo saca de la lista activa', async () => {
    const user = userEvent.setup()
    const archived = { ...MOCK_RESOURCES[0], deleted_at: '2026-08-21T00:00:00.000Z' }
    const { supabase } = await import('../supabase')
    supabase.from.mockImplementation((table) => {
      if (table !== 'external_resources') return makeQuery([])
      const q = makeQuery(MOCK_RESOURCES)
      q.update = vi.fn(() => ({
        eq: () => ({
          select: () => ({ single: () => Promise.resolve({ data: archived, error: null }) }),
        }),
      }))
      return q
    })

    render(<ExternalResourcesView companyId="co-1" />)
    await waitFor(() => expect(screen.getByText('Alan Puentes')).toBeInTheDocument())

    await user.click(screen.getByRole('button', { name: 'Eliminar Alan Puentes' }))
    await user.type(screen.getByPlaceholderText('Alan Puentes'), 'Alan Puentes')
    await user.click(screen.getByRole('button', { name: 'Eliminar' }))

    await waitFor(() => {
      expect(screen.queryByText('Alan Puentes')).not.toBeInTheDocument()
    })
  })
})
