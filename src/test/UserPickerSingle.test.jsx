import { render, screen, fireEvent } from '@testing-library/react'
import { vi } from 'vitest'
import UserPickerSingle from '../components/tareas/UserPickerSingle'

// ── Test data ─────────────────────────────────────────────────────────────────
const USERS = [
  { user_id: 'u1', first_name: 'Ana',   last_name: 'García',  avatar_url: null, access_level: 1, position: { position_name: 'Diseñadora' } },
  { user_id: 'u2', first_name: 'Beto',  last_name: 'López',   avatar_url: null, access_level: 2, position: { position_name: 'Redactor' } },
  { user_id: 'u3', first_name: 'Carla', last_name: 'Martín',  avatar_url: null, access_level: 3, position: { position_name: 'Gerente' } },
  { user_id: 'u4', first_name: 'Diego', last_name: 'Pérez',   avatar_url: null, access_level: 4, position: { position_name: 'Director' } },
  { user_id: 'u5', first_name: 'Elena', last_name: 'Ruiz',    avatar_url: null, access_level: null, position: null },
]

function renderPicker(props = {}) {
  return render(
    <UserPickerSingle
      users={USERS}
      selectedId={null}
      onChange={vi.fn()}
      {...props}
    />
  )
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('UserPickerSingle — sin filtro de nivel', () => {
  it('muestra todos los usuarios en el desplegable', () => {
    renderPicker()
    fireEvent.click(screen.getByRole('button'))
    expect(screen.getByText('Ana García')).toBeInTheDocument()
    expect(screen.getByText('Beto López')).toBeInTheDocument()
    expect(screen.getByText('Carla Martín')).toBeInTheDocument()
    expect(screen.getByText('Diego Pérez')).toBeInTheDocument()
    expect(screen.getByText('Elena Ruiz')).toBeInTheDocument()
  })

  it('muestra el cargo de cada usuario en el desplegable (sin nivel)', () => {
    renderPicker()
    fireEvent.click(screen.getByRole('button'))
    expect(screen.getByText('Diseñadora')).toBeInTheDocument()
    expect(screen.getByText('Redactor')).toBeInTheDocument()
    expect(screen.getByText('Gerente')).toBeInTheDocument()
    expect(screen.getByText('Director')).toBeInTheDocument()
    // El nivel ya no se muestra en la UI
    expect(screen.queryByText(/Nivel \d/)).not.toBeInTheDocument()
  })

  it('no muestra subtexto para usuario sin cargo ni nivel', () => {
    renderPicker()
    fireEvent.click(screen.getByRole('button'))
    // Elena Ruiz no tiene cargo ni nivel; su nombre debe existir pero no un subtexto vacío
    expect(screen.getByText('Elena Ruiz')).toBeInTheDocument()
    // No hay texto de subtexto para ese usuario
    expect(screen.queryByText('undefined')).not.toBeInTheDocument()
    expect(screen.queryByText('null')).not.toBeInTheDocument()
  })
})

describe('UserPickerSingle — con minLevel={3}', () => {
  it('oculta usuarios con nivel < 3', () => {
    renderPicker({ minLevel: 3 })
    fireEvent.click(screen.getByRole('button'))
    expect(screen.queryByText('Ana García')).not.toBeInTheDocument()
    expect(screen.queryByText('Beto López')).not.toBeInTheDocument()
    expect(screen.queryByText('Elena Ruiz')).not.toBeInTheDocument()
  })

  it('muestra usuarios con nivel >= 3', () => {
    renderPicker({ minLevel: 3 })
    fireEvent.click(screen.getByRole('button'))
    expect(screen.getByText('Carla Martín')).toBeInTheDocument()
    expect(screen.getByText('Diego Pérez')).toBeInTheDocument()
  })

  it('muestra el cargo de los usuarios filtrados (sin nivel)', () => {
    renderPicker({ minLevel: 3 })
    fireEvent.click(screen.getByRole('button'))
    expect(screen.getByText('Gerente')).toBeInTheDocument()
    expect(screen.getByText('Director')).toBeInTheDocument()
    expect(screen.queryByText(/Nivel \d/)).not.toBeInTheDocument()
  })
})

describe('UserPickerSingle — empleado seleccionado', () => {
  it('muestra cargo del empleado seleccionado en el trigger (sin nivel)', () => {
    renderPicker({ selectedId: 'u3' })
    // El trigger (campo cerrado) debe mostrar el nombre y subtexto
    expect(screen.getByText('Carla Martín')).toBeInTheDocument()
    expect(screen.getByText('Gerente')).toBeInTheDocument()
    expect(screen.queryByText(/Nivel \d/)).not.toBeInTheDocument()
  })

  it('muestra solo el nombre si el usuario seleccionado no tiene cargo ni nivel', () => {
    renderPicker({ selectedId: 'u5' })
    expect(screen.getByText('Elena Ruiz')).toBeInTheDocument()
    // Sin subtexto vacío o con texto residual
    expect(screen.queryByText('undefined')).not.toBeInTheDocument()
  })
})
