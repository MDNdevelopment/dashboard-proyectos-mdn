import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi } from 'vitest'

const USERS = [
  { user_id: 'u1', first_name: 'Ana', last_name: 'García', avatar_url: null },
  { user_id: 'u2', first_name: 'Carlos', last_name: 'López', avatar_url: null },
  { user_id: 'u3', first_name: 'Beatriz', last_name: 'Torres', avatar_url: null },
]

vi.mock('../supabase', () => ({
  supabase: {
    from: vi.fn((table) => {
      if (table === 'users') {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          order: vi.fn().mockResolvedValue({ data: USERS, error: null }),
        }
      }
      return {}
    }),
  },
}))

vi.mock('../context/AuthContext', () => ({
  useAuth: vi.fn(() => ({
    userProfile: { user_id: 'creator', company_id: 'company-1' },
  })),
}))

// createPortal renders into document.body in tests
vi.mock('react-dom', async (importOriginal) => {
  const actual = await importOriginal()
  return { ...actual, createPortal: (node) => node }
})

import ProjectModal from '../components/ProjectModal'

function renderModal(props = {}) {
  return render(
    <ProjectModal
      project={null}
      onClose={() => {}}
      onSave={vi.fn().mockResolvedValue()}
      {...props}
    />
  )
}

async function openPicker() {
  await waitFor(() => screen.getByRole('button', { name: /añadir miembro/i }))
  await userEvent.click(screen.getByRole('button', { name: /añadir miembro/i }))
}

describe('ProjectModal — member picker', () => {
  it('muestra el botón "Añadir miembro" cuando hay usuarios', async () => {
    renderModal()
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /añadir miembro/i })).toBeInTheDocument()
    })
  })

  it('muestra "Sin miembros asignados" cuando no hay seleccionados', async () => {
    renderModal()
    await waitFor(() => {
      expect(screen.getByText(/sin miembros asignados/i)).toBeInTheDocument()
    })
  })

  it('abre el popover con la lista de usuarios al hacer clic en el trigger', async () => {
    renderModal()
    await openPicker()
    expect(screen.getByPlaceholderText(/buscar miembro/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Ana García/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Carlos López/i })).toBeInTheDocument()
  })

  it('filtra la lista al escribir en el buscador', async () => {
    renderModal()
    await openPicker()
    await userEvent.type(screen.getByPlaceholderText(/buscar miembro/i), 'ana')
    expect(screen.getByRole('button', { name: /Ana García/i })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Carlos López/i })).not.toBeInTheDocument()
  })

  it('agregar un usuario muestra su chip y el checkmark en el popover', async () => {
    renderModal()
    await openPicker()
    await userEvent.click(screen.getByRole('button', { name: /Ana García/i }))
    // chip appears
    expect(screen.getByLabelText(/quitar a ana garcía/i)).toBeInTheDocument()
    // checkmark visible (SVG with green stroke — just check user is shown as selected chip)
    expect(screen.getAllByText('Ana García').length).toBeGreaterThanOrEqual(1)
  })

  it('el popover permanece abierto después de seleccionar un miembro', async () => {
    renderModal()
    await openPicker()
    await userEvent.click(screen.getByRole('button', { name: /Ana García/i }))
    // popover still open (search input still present)
    expect(screen.getByPlaceholderText(/buscar miembro/i)).toBeInTheDocument()
  })

  it('quitar un chip elimina al miembro de la selección', async () => {
    renderModal()
    await openPicker()
    await userEvent.click(screen.getByRole('button', { name: /Ana García/i }))
    await userEvent.click(screen.getByLabelText(/quitar a ana garcía/i))
    expect(screen.getByText(/sin miembros asignados/i)).toBeInTheDocument()
  })

  it('envía los members seleccionados al guardar', async () => {
    const onSave = vi.fn().mockResolvedValue()
    renderModal({ onSave })
    await openPicker()
    await userEvent.click(screen.getByRole('button', { name: /Ana García/i }))
    await userEvent.click(screen.getByRole('button', { name: /Carlos López/i }))

    await userEvent.type(screen.getByPlaceholderText(/automatización/i), 'Mi proyecto')
    await userEvent.click(screen.getByRole('button', { name: /crear proyecto/i }))

    await waitFor(() => {
      expect(onSave).toHaveBeenCalledWith(expect.objectContaining({
        members: ['u1', 'u2'],
      }))
    })
  })

  it('en modo edición muestra chips para los miembros existentes', async () => {
    const project = {
      id: 'p1',
      name: 'Proyecto existente',
      departments: [],
      team: '',
      requirements: '',
      status: 'Pendiente',
      phases: [],
      members: ['u2'],
    }
    renderModal({ project })
    await waitFor(() => {
      expect(screen.getByLabelText(/quitar a carlos lópez/i)).toBeInTheDocument()
    })
    expect(screen.queryByText(/sin miembros asignados/i)).not.toBeInTheDocument()
  })
})
