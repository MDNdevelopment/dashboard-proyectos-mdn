import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { vi } from 'vitest'

// ── Mock supabase ─────────────────────────────────────────────────────────────
vi.mock('../supabase', () => {
  const channel = { on: vi.fn().mockReturnThis(), subscribe: vi.fn().mockReturnThis() }

  const mockFrom = vi.fn()
  const makeQuery = (result = []) => ({
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    order: vi.fn().mockResolvedValue({ data: result, error: null }),
    insert: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    delete: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({ data: result[0] ?? null, error: null }),
  })

  mockFrom.mockImplementation(table => {
    if (table === 'questions')          return makeQuery(MOCK_QUESTIONS)
    if (table === 'departments')        return makeQuery(MOCK_DEPARTMENTS)
    if (table === 'positions')          return makeQuery(MOCK_POSITIONS)
    if (table === 'question_positions') return makeQuery([])
    if (table === 'question_tags')      return makeQuery([])
    return makeQuery([])
  })

  return {
    supabase: {
      from: mockFrom,
      channel: vi.fn(() => channel),
      removeChannel: vi.fn(),
    },
  }
})

// ── Mock AuthContext ──────────────────────────────────────────────────────────
vi.mock('../context/AuthContext', () => ({
  useAuth: vi.fn(),
}))

// ── Datos de prueba ───────────────────────────────────────────────────────────
const MOCK_DEPARTMENTS = [
  { department_id: 'd1', department_name: 'Diseño',     company_id: 'co-1', dashboard_visible: true },
  { department_id: 'd2', department_name: 'Tecnología', company_id: 'co-1', dashboard_visible: true },
]
const MOCK_POSITIONS = [
  { position_id: 'p1', position_name: 'Diseñador Gráfico', department_id: 'd1', company_id: 'co-1' },
  { position_id: 'p2', position_name: 'Desarrollador Web',  department_id: 'd2', company_id: 'co-1' },
]
const MOCK_QUESTIONS = [
  {
    id: 'q1',
    text: '¿Cumple con los plazos de entrega?',
    company_id: 'co-1',
    removed: false,
    question_positions: [{ position_id: 'p1' }],
    question_tags: [{ tag: 'puntualidad' }],
  },
  {
    id: 'q2',
    text: '¿Trabaja bien en equipo?',
    company_id: 'co-1',
    removed: false,
    question_positions: [{ position_id: 'p1' }, { position_id: 'p2' }],
    question_tags: [],
  },
]

import { useAuth } from '../context/AuthContext'
import EmpresaPage from '../pages/EmpresaPage'

// ── Helpers ───────────────────────────────────────────────────────────────────
function renderAsAdmin(path = '/empresa/preguntas') {
  useAuth.mockReturnValue({
    userProfile: {
      user_id: 'u-admin',
      company_id: 'co-1',
      access_level: 3,
      admin: true,
      first_name: 'Admin',
      last_name: 'User',
    },
  })
  return render(
    <MemoryRouter initialEntries={[path]}>
      <EmpresaPage />
    </MemoryRouter>
  )
}

function renderAsNonAdmin() {
  useAuth.mockReturnValue({
    userProfile: {
      user_id: 'u-regular',
      company_id: 'co-1',
      access_level: 1,
      admin: false,
      first_name: 'Regular',
      last_name: 'User',
    },
  })
  return render(
    <MemoryRouter initialEntries={['/empresa']}>
      <EmpresaPage />
    </MemoryRouter>
  )
}

// ── Tests ─────────────────────────────────────────────────────────────────────
describe('QuestionsView', () => {
  it('renderiza la lista de preguntas tras cargar', async () => {
    renderAsAdmin()
    await waitFor(() => {
      expect(screen.getByText('¿Cumple con los plazos de entrega?')).toBeInTheDocument()
    })
    expect(screen.getByText('¿Trabaja bien en equipo?')).toBeInTheDocument()
  })

  it('muestra el chip de cargo asignado a cada pregunta', async () => {
    renderAsAdmin()
    await waitFor(() => {
      expect(screen.getByText('¿Cumple con los plazos de entrega?')).toBeInTheDocument()
    })
    expect(screen.getAllByText('Diseñador Gráfico').length).toBeGreaterThan(0)
  })

  it('muestra el chip de tag de la pregunta', async () => {
    renderAsAdmin()
    await waitFor(() => {
      expect(screen.getByText('puntualidad')).toBeInTheDocument()
    })
  })

  it('el botón "+ Nueva pregunta" abre el modal', async () => {
    const user = userEvent.setup()
    renderAsAdmin()
    await waitFor(() => {
      expect(screen.getByText('¿Cumple con los plazos de entrega?')).toBeInTheDocument()
    })

    await user.click(screen.getByRole('button', { name: '+ Nueva pregunta' }))

    expect(screen.getByText('Nueva pregunta')).toBeInTheDocument()
    expect(screen.getByPlaceholderText(/Ej: ¿Cumple/)).toBeInTheDocument()
  })

  it('el modal muestra los cargos agrupados por departamento', async () => {
    const user = userEvent.setup()
    renderAsAdmin()
    await waitFor(() => {
      expect(screen.getByText('¿Cumple con los plazos de entrega?')).toBeInTheDocument()
    })

    await user.click(screen.getByRole('button', { name: '+ Nueva pregunta' }))

    // Grupos de departamentos en el modal
    expect(screen.getByText('Diseño')).toBeInTheDocument()
    expect(screen.getByText('Tecnología')).toBeInTheDocument()
    // Cargos como botones toggleables
    expect(screen.getByRole('button', { name: 'Diseñador Gráfico' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Desarrollador Web' })).toBeInTheDocument()
  })

  it('el botón Editar abre el modal pre-rellenado con el texto de la pregunta', async () => {
    const user = userEvent.setup()
    renderAsAdmin()
    await waitFor(() => {
      expect(screen.getByText('¿Cumple con los plazos de entrega?')).toBeInTheDocument()
    })

    const editButtons = screen.getAllByRole('button', { name: 'Editar pregunta' })
    await user.click(editButtons[0])

    expect(screen.getByText('Editar pregunta')).toBeInTheDocument()
    expect(screen.getByDisplayValue('¿Cumple con los plazos de entrega?')).toBeInTheDocument()
  })

  it('el modal se cierra con el botón Cancelar', async () => {
    const user = userEvent.setup()
    renderAsAdmin()
    await waitFor(() => {
      expect(screen.getByText('¿Cumple con los plazos de entrega?')).toBeInTheDocument()
    })

    await user.click(screen.getByRole('button', { name: '+ Nueva pregunta' }))
    expect(screen.getByText('Nueva pregunta')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Cancelar' }))
    expect(screen.queryByText('Nueva pregunta')).not.toBeInTheDocument()
  })

  it('el filtro por cargo filtra las preguntas de la lista', async () => {
    const user = userEvent.setup()
    renderAsAdmin()
    await waitFor(() => {
      expect(screen.getByText('¿Cumple con los plazos de entrega?')).toBeInTheDocument()
    })

    // Seleccionar el cargo "Desarrollador Web" (solo tiene la pregunta 2)
    const select = screen.getByRole('combobox')
    await user.selectOptions(select, 'p2')

    // q2 tiene p2, q1 solo tiene p1 → q1 desaparece
    await waitFor(() => {
      expect(screen.queryByText('¿Cumple con los plazos de entrega?')).not.toBeInTheDocument()
      expect(screen.getByText('¿Trabaja bien en equipo?')).toBeInTheDocument()
    })
  })

  it('el botón Eliminar abre el diálogo de confirmación', async () => {
    const user = userEvent.setup()
    renderAsAdmin()
    await waitFor(() => {
      expect(screen.getByText('¿Cumple con los plazos de entrega?')).toBeInTheDocument()
    })

    const deleteButtons = screen.getAllByRole('button', { name: 'Eliminar pregunta' })
    await user.click(deleteButtons[0])

    // ConfirmDeleteDialog muestra el heading "Eliminar pregunta" y el input de confirmación
    expect(screen.getByRole('heading', { name: 'Eliminar pregunta' })).toBeInTheDocument()
    // El input tiene el texto de la pregunta como placeholder
    expect(screen.getByPlaceholderText('¿Cumple con los plazos de entrega?')).toBeInTheDocument()
  })

  it('no-admin no ve el tab Preguntas', () => {
    renderAsNonAdmin()
    expect(screen.queryByRole('button', { name: 'Preguntas' })).not.toBeInTheDocument()
  })

  it('no-admin que navega directamente a /empresa/preguntas no ve la gestión de preguntas', () => {
    useAuth.mockReturnValue({
      userProfile: {
        user_id: 'u-regular',
        company_id: 'co-1',
        access_level: 1,
        admin: false,
        first_name: 'Regular',
        last_name: 'User',
      },
    })
    render(
      <MemoryRouter initialEntries={['/empresa/preguntas']}>
        <EmpresaPage />
      </MemoryRouter>
    )
    expect(screen.getByRole('button', { name: 'Inicio' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '+ Nueva pregunta' })).not.toBeInTheDocument()
  })
})
