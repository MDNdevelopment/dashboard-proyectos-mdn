/**
 * El diálogo confirma con UN botón. Antes exigía teclear el nombre exacto del
 * elemento; se quitó en todo el sistema (no protegía de nada real y cobraba fricción
 * en cada borrado), así que lo que se cubre acá es que el diálogo diga claramente
 * QUÉ se elimina y que no haya quedado ningún campo que escribir.
 */
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi } from 'vitest'

import ConfirmDeleteDialog from '../components/common/ConfirmDeleteDialog'

function setup(extraProps) {
  const onConfirm = vi.fn()
  const onCancel = vi.fn()
  render(
    <ConfirmDeleteDialog
      itemName="Juan Pérez"
      itemLabel="empleado"
      onConfirm={onConfirm}
      onCancel={onCancel}
      {...extraProps}
    />,
  )
  return { onConfirm, onCancel }
}

describe('ConfirmDeleteDialog', () => {
  it('no pide escribir nada: no hay input de confirmación', () => {
    setup()
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
  })

  it('el botón Eliminar está habilitado desde el arranque y dispara onConfirm', async () => {
    const user = userEvent.setup()
    const { onConfirm } = setup()

    const boton = screen.getByRole('button', { name: 'Eliminar' })
    expect(boton).toBeEnabled()

    await user.click(boton)
    expect(onConfirm).toHaveBeenCalledTimes(1)
  })

  it('el mensaje por defecto nombra el elemento y avisa que no se puede deshacer', () => {
    setup()
    expect(screen.getByText(/Se eliminará/)).toBeInTheDocument()
    expect(screen.getByText('Juan Pérez')).toBeInTheDocument()
    expect(screen.getByText('no se puede deshacer')).toBeInTheDocument()
  })

  it('el título usa itemLabel', () => {
    setup()
    expect(screen.getByRole('heading', { name: 'Eliminar empleado' })).toBeInTheDocument()
  })

  it('un message propio reemplaza el texto por defecto', () => {
    setup({ message: 'La pregunta será ocultada del banco.' })
    expect(screen.getByText('La pregunta será ocultada del banco.')).toBeInTheDocument()
    expect(screen.queryByText(/Se eliminará/)).not.toBeInTheDocument()
  })

  it('con confirming deshabilita los botones y muestra "Eliminando…"', () => {
    setup({ confirming: true })
    expect(screen.getByRole('button', { name: 'Eliminando…' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Cancelar' })).toBeDisabled()
  })

  it('renderiza children (las opciones extra de cada llamador siguen ahí)', () => {
    setup({ children: <label>Opción extra</label> })
    expect(screen.getByText('Opción extra')).toBeInTheDocument()
  })

  it('llama a onCancel al hacer click en Cancelar', async () => {
    const user = userEvent.setup()
    const { onCancel } = setup()
    await user.click(screen.getByRole('button', { name: 'Cancelar' }))
    expect(onCancel).toHaveBeenCalledTimes(1)
  })

  it('llama a onCancel con Escape', async () => {
    const user = userEvent.setup()
    const { onCancel } = setup()
    await user.keyboard('{Escape}')
    expect(onCancel).toHaveBeenCalledTimes(1)
  })
})
