import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi } from 'vitest'

import ConfirmDeleteDialog from '../components/common/ConfirmDeleteDialog'

function setup(itemName) {
  const onConfirm = vi.fn()
  const onCancel = vi.fn()
  render(
    <ConfirmDeleteDialog
      itemName={itemName}
      itemLabel="empleado"
      onConfirm={onConfirm}
      onCancel={onCancel}
    />,
  )
  return { onConfirm, onCancel }
}

describe('ConfirmDeleteDialog', () => {
  it('habilita el botón de eliminar aunque el nombre tenga un espacio al final', async () => {
    const user = userEvent.setup()
    const { onConfirm } = setup('Juan Pérez ')

    const input = screen.getByRole('textbox')
    const boton = screen.getByRole('button', { name: 'Eliminar' })
    expect(boton).toBeDisabled()

    await user.type(input, 'Juan Pérez')
    expect(boton).toBeEnabled()

    await user.click(boton)
    expect(onConfirm).toHaveBeenCalled()
  })

  it('habilita el botón de eliminar aunque el nombre tenga un espacio doble en medio', async () => {
    const user = userEvent.setup()
    setup('Juan  Pérez')

    const input = screen.getByRole('textbox')
    const boton = screen.getByRole('button', { name: 'Eliminar' })

    await user.type(input, 'Juan Pérez')
    expect(boton).toBeEnabled()
  })

  it('mantiene el botón deshabilitado si el nombre escrito no coincide', async () => {
    const user = userEvent.setup()
    setup('Juan Pérez')

    const input = screen.getByRole('textbox')
    const boton = screen.getByRole('button', { name: 'Eliminar' })

    await user.type(input, 'Otro Nombre')
    expect(boton).toBeDisabled()
  })
})
