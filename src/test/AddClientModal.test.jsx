import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import { vi } from 'vitest'
import AddClientModal from '../components/chequeo/temporada/AddClientModal'

const LINES = [
  { id: 'l1', name: 'Team Sabrina' },
  { id: 'gen', name: 'Independientes', is_general: true },
]
const USERS = [
  { user_id: 'u-sab', first_name: 'Sabrina', last_name: 'B' },
  { user_id: 'u-ajeno', first_name: 'Pedro', last_name: 'P' },
]

function setup(props = {}) {
  const onCreate = vi.fn().mockResolvedValue({ error: null })
  const onClose = vi.fn()
  render(
    <AddClientModal
      lines={LINES}
      users={USERS}
      existingNames={['Flexmed', 'Da Vinci']}
      defaultLineId="l1"
      onCreate={onCreate}
      onClose={onClose}
      {...props}
    />,
  )
  return { onCreate, onClose }
}

const nameInput = () => screen.getByPlaceholderText('Nombre del cliente')
const submit = () => fireEvent.click(screen.getByRole('button', { name: 'Agregar cliente' }))

describe('AddClientModal', () => {
  it('pide el nombre antes de crear', () => {
    const { onCreate } = setup()
    submit()
    expect(screen.getByRole('alert')).toHaveTextContent('Escribe el nombre del cliente.')
    expect(onCreate).not.toHaveBeenCalled()
  })

  it('no deja crear un cliente que ya existe (sin importar mayúsculas ni espacios)', () => {
    const { onCreate } = setup()
    fireEvent.change(nameInput(), { target: { value: '  da   VINCI ' } })
    submit()
    expect(screen.getByRole('alert')).toHaveTextContent('Ya existe un cliente con ese nombre.')
    expect(onCreate).not.toHaveBeenCalled()
  })

  it('crea con el nombre limpio, la línea elegida y sin SM por defecto', async () => {
    const { onCreate } = setup()
    fireEvent.change(nameInput(), { target: { value: '  Hello   Fitness ' } })
    submit()
    await waitFor(() => expect(onCreate).toHaveBeenCalledTimes(1))
    expect(onCreate).toHaveBeenCalledWith({
      name: 'Hello Fitness',
      lineId: 'l1',
      socialManagerId: null,
    })
  })

  it('arranca en la línea que se está viendo y permite cambiarla', async () => {
    const { onCreate } = setup()
    const select = screen.getByRole('combobox')
    expect(select).toHaveValue('l1')
    fireEvent.change(select, { target: { value: 'gen' } })
    fireEvent.change(nameInput(), { target: { value: 'Cliente Suelto' } })
    submit()
    await waitFor(() => expect(onCreate).toHaveBeenCalled())
    expect(onCreate.mock.calls[0][0].lineId).toBe('gen')
  })

  it('el SM se elige entre las personas del desplegable de la hoja', async () => {
    const { onCreate } = setup()
    const picker = screen.getByText('SM (opcional)').parentElement
    fireEvent.click(within(picker).getAllByRole('button')[0])
    // Pedro no está en la lista de la hoja; Sabrina sí.
    expect(screen.queryByRole('button', { name: /Pedro P/ })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /Sabrina B/ }))
    fireEvent.change(nameInput(), { target: { value: 'Nuevo' } })
    submit()
    await waitFor(() => expect(onCreate).toHaveBeenCalled())
    expect(onCreate.mock.calls[0][0].socialManagerId).toBe('u-sab')
  })

  it('muestra el error del servidor (p. ej. sin permiso) y deja el modal abierto', async () => {
    const onCreate = vi.fn().mockResolvedValue({ error: { message: 'new row violates RLS' } })
    const { onClose } = setup({ onCreate })
    fireEvent.change(nameInput(), { target: { value: 'Nuevo' } })
    submit()
    expect(await screen.findByRole('alert')).toHaveTextContent('new row violates RLS')
    expect(onClose).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Agregar cliente' })).not.toBeDisabled()
  })

  it('Cancelar y Escape cierran el modal', () => {
    const { onClose } = setup()
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }))
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(2)
  })
})
