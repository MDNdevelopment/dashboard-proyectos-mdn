import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { vi } from 'vitest'
import CampaignChecklist from '../components/ads/CampaignChecklist'

// Wrapper controlado: refleja el patrón real (padre dueño del array).
function Harness({ initial = [], editable = true, canManage = true, onChangeSpy }) {
  const [value, setValue] = useState(initial)
  return (
    <CampaignChecklist
      value={value}
      onChange={(next) => {
        setValue(next)
        onChangeSpy?.(next)
      }}
      editable={editable}
      canManage={canManage}
    />
  )
}

describe('CampaignChecklist', () => {
  it('agrega una acción con "+ Agregar acción" y permite escribir su texto', async () => {
    const user = userEvent.setup()
    render(<Harness />)

    await user.click(screen.getByRole('button', { name: '+ Agregar acción' }))
    const input = screen.getByPlaceholderText('Descripción de la acción')
    await user.type(input, 'Diseñar pieza')
    expect(input).toHaveValue('Diseñar pieza')
  })

  it('el progreso X/N y el % avanza al tildar acciones', async () => {
    const user = userEvent.setup()
    render(
      <Harness
        initial={[
          { id: 'a', title: 'Uno', done: false },
          { id: 'b', title: 'Dos', done: false },
        ]}
      />,
    )
    // 0 de 2 → 0%
    expect(screen.getByText('Acciones (0/2)')).toBeInTheDocument()
    expect(screen.getByText('0%')).toBeInTheDocument()

    await user.click(screen.getByRole('checkbox', { name: 'Completar Uno' }))
    expect(screen.getByText('Acciones (1/2)')).toBeInTheDocument()
    expect(screen.getByText('50%')).toBeInTheDocument()
  })

  it('elimina una acción con el botón de borrar', async () => {
    const user = userEvent.setup()
    render(<Harness initial={[{ id: 'a', title: 'Borrable', done: false }]} />)
    expect(screen.getByDisplayValue('Borrable')).toBeInTheDocument()
    await user.click(screen.getByTitle('Eliminar acción'))
    expect(screen.queryByDisplayValue('Borrable')).not.toBeInTheDocument()
  })

  it('modo editable=false (detalle): permite tildar pero no editar texto ni agregar/eliminar', async () => {
    const user = userEvent.setup()
    const onChangeSpy = vi.fn()
    render(
      <Harness
        initial={[{ id: 'a', title: 'Solo tildar', done: false }]}
        editable={false}
        onChangeSpy={onChangeSpy}
      />,
    )
    // Sin input de texto ni botones de estructura.
    expect(screen.queryByPlaceholderText('Descripción de la acción')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '+ Agregar acción' })).not.toBeInTheDocument()
    expect(screen.queryByTitle('Eliminar acción')).not.toBeInTheDocument()
    // Pero sí se puede tildar.
    await user.click(screen.getByRole('checkbox', { name: 'Completar Solo tildar' }))
    expect(onChangeSpy).toHaveBeenCalledWith([{ id: 'a', title: 'Solo tildar', done: true }])
  })
})
