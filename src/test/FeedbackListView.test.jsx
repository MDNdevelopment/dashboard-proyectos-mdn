import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi } from 'vitest'
import { makeQuery } from './helpers/supabaseMock'

const { updateSpy } = vi.hoisted(() => ({ updateSpy: vi.fn() }))

const ITEMS = [
  {
    id: 'f1',
    company_id: 'co-1',
    type: 'error',
    area: 'Proyectos',
    message: 'La pantalla se queda en blanco al filtrar.',
    status: 'nuevo',
    admin_note: null,
    created_at: '2026-09-01T10:00:00Z',
  },
  {
    id: 'f2',
    company_id: 'co-1',
    type: 'recomendacion',
    area: null,
    message: 'Sería bueno poder exportar los reportes a PDF.',
    status: 'resuelto',
    admin_note: 'Ya lo agregamos',
    created_at: '2026-08-20T10:00:00Z',
  },
]

vi.mock('../supabase', () => ({
  supabase: {
    from: vi.fn(() => {
      const q = makeQuery(ITEMS)
      q.update = (data) => {
        updateSpy(data)
        return q
      }
      return q
    }),
  },
}))

vi.mock('../context/AuthContext', () => ({
  useAuth: vi.fn(),
}))

import { useAuth } from '../context/AuthContext'
import FeedbackListView from '../components/feedback/FeedbackListView'

beforeEach(() => {
  updateSpy.mockClear()
  useAuth.mockReturnValue({ userProfile: { company_id: 'co-1' } })
})

describe('FeedbackListView', () => {
  it('carga y muestra los mensajes de feedback', async () => {
    render(<FeedbackListView />)
    expect(await screen.findByText(/pantalla se queda en blanco/i)).toBeInTheDocument()
    expect(screen.getByText(/exportar los reportes/i)).toBeInTheDocument()
  })

  it('filtra por tipo', async () => {
    const user = userEvent.setup()
    render(<FeedbackListView />)
    await screen.findByText(/pantalla se queda en blanco/i)

    await user.click(screen.getByRole('button', { name: 'Reporte de error' }))

    expect(screen.getByText(/pantalla se queda en blanco/i)).toBeInTheDocument()
    expect(screen.queryByText(/exportar los reportes/i)).not.toBeInTheDocument()
  })

  it('filtra por estado', async () => {
    const user = userEvent.setup()
    render(<FeedbackListView />)
    await screen.findByText(/pantalla se queda en blanco/i)

    // "Resuelto" aparece tanto en el filtro de estado como en el StatusPill de cada
    // tarjeta; el filtro es el primero en el DOM (se renderiza antes que la lista).
    await user.click(screen.getAllByRole('button', { name: 'Resuelto' })[0])

    expect(screen.queryByText(/pantalla se queda en blanco/i)).not.toBeInTheDocument()
    expect(screen.getByText(/exportar los reportes/i)).toBeInTheDocument()
  })

  it('muestra un mensaje cuando el filtro no tiene resultados', async () => {
    const user = userEvent.setup()
    render(<FeedbackListView />)
    await screen.findByText(/pantalla se queda en blanco/i)

    await user.click(screen.getByRole('button', { name: 'Descartado' }))

    expect(screen.getByText(/no hay mensajes con este filtro/i)).toBeInTheDocument()
  })
})
