import { render, screen, fireEvent } from '@testing-library/react'
import { vi } from 'vitest'
import UserPickerMulti from '../components/tareas/UserPickerMulti'

// ── Test data ─────────────────────────────────────────────────────────────────
const USERS = [
  { user_id: 'u1', first_name: 'Ana',   last_name: 'García',  avatar_url: null, position: { position_name: 'Diseñadora' } },
  { user_id: 'u2', first_name: 'Beto',  last_name: 'López',   avatar_url: null, position: { position_name: 'Redactor' } },
  { user_id: 'u3', first_name: 'Carla', last_name: 'Martín',  avatar_url: null, position: { position_name: 'Gerente' } },
]

function renderPicker(props = {}) {
  return render(
    <UserPickerMulti
      users={USERS}
      selectedIds={[]}
      onChange={vi.fn()}
      {...props}
    />
  )
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('UserPickerMulti — desplegable', () => {
  it('muestra el placeholder cuando no hay seleccionados', () => {
    renderPicker({ placeholder: 'Asignar responsable...' })
    expect(screen.getByText('Asignar responsable...')).toBeInTheDocument()
  })

  it('muestra todos los usuarios en el desplegable al abrir', () => {
    renderPicker()
    fireEvent.click(screen.getByRole('button'))
    expect(screen.getByText('Ana García')).toBeInTheDocument()
    expect(screen.getByText('Beto López')).toBeInTheDocument()
    expect(screen.getByText('Carla Martín')).toBeInTheDocument()
  })

  it('llama a onChange con el id agregado al hacer click en un usuario', () => {
    const onChange = vi.fn()
    renderPicker({ onChange })
    fireEvent.click(screen.getByRole('button'))
    fireEvent.click(screen.getByText('Ana García'))
    expect(onChange).toHaveBeenCalledWith(['u1'])
  })

  it('llama a onChange quitando el id al deseleccionar un usuario', () => {
    const onChange = vi.fn()
    renderPicker({ selectedIds: ['u1', 'u2'], onChange })
    // Abrir el picker usando el aria-label del trigger
    fireEvent.click(screen.getByRole('button', { name: 'Seleccionar responsables' }))
    // Click en Beto López (ya seleccionado) lo quita
    const beto = screen.getAllByText('Beto López')[0]
    fireEvent.click(beto)
    expect(onChange).toHaveBeenCalledWith(['u1'])
  })
})

describe('UserPickerMulti — chips en trigger', () => {
  it('muestra chips con los nombres de los usuarios seleccionados', () => {
    renderPicker({ selectedIds: ['u1', 'u2'] })
    // Los chips muestran el first_name dentro del trigger
    expect(screen.getByText('Ana')).toBeInTheDocument()
    expect(screen.getByText('Beto')).toBeInTheDocument()
  })

  it('el botón × en un chip no bloqueado llama a onChange para quitarlo', () => {
    const onChange = vi.fn()
    renderPicker({ selectedIds: ['u1', 'u2'], onChange })
    // El chip de Ana tiene un botón ×
    const removeButtons = screen.getAllByLabelText(/Quitar/)
    // Quitar Ana (u1)
    fireEvent.click(removeButtons[0])
    expect(onChange).toHaveBeenCalledWith(['u2'])
  })
})

describe('UserPickerMulti — lockedIds', () => {
  it('no muestra × en chips bloqueados', () => {
    renderPicker({ selectedIds: ['u1', 'u2'], lockedIds: ['u1'] })
    // Solo el chip de Beto (u2) debe tener el botón ×
    const removeButtons = screen.queryAllByLabelText(/Quitar/)
    expect(removeButtons).toHaveLength(1)
    expect(removeButtons[0]).toHaveAccessibleName('Quitar Beto')
  })

  it('no llama a onChange al intentar quitar un id bloqueado del dropdown', () => {
    const onChange = vi.fn()
    renderPicker({ selectedIds: ['u1'], lockedIds: ['u1'], onChange })
    fireEvent.click(screen.getByRole('button'))
    // Click en Ana (bloqueada)
    fireEvent.click(screen.getByText('Ana García'))
    expect(onChange).not.toHaveBeenCalled()
  })

  it('muestra icono de candado en el dropdown para usuarios bloqueados', () => {
    renderPicker({ selectedIds: ['u1'], lockedIds: ['u1'] })
    fireEvent.click(screen.getByRole('button'))
    // El botón de Ana García debe tener cursor-not-allowed (class) y estar disabled
    const anaButton = screen.getByText('Ana García').closest('button')
    expect(anaButton).toHaveClass('cursor-not-allowed')
  })
})

describe('UserPickerMulti — búsqueda', () => {
  it('filtra usuarios por nombre al buscar', () => {
    renderPicker()
    fireEvent.click(screen.getByRole('button'))
    const searchInput = screen.getByPlaceholderText('Buscar...')
    fireEvent.change(searchInput, { target: { value: 'car' } })
    expect(screen.getByText('Carla Martín')).toBeInTheDocument()
    expect(screen.queryByText('Ana García')).not.toBeInTheDocument()
    expect(screen.queryByText('Beto López')).not.toBeInTheDocument()
  })
})
