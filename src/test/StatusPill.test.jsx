/**
 * Tests del componente compartido StatusPill (src/components/common/StatusPill.jsx):
 * badge de solo lectura vs. control editable con menú desplegable.
 */
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi } from 'vitest'

import StatusPill from '../components/common/StatusPill'

const META = {
  Pendiente: { label: 'Pendiente', bg: 'bg-[#e3f2fd]', text: 'text-[#1565c0]', dot: 'bg-[#1565c0]' },
  Aprobado:  { label: 'Aprobado',  bg: 'bg-[#e8f5e9]', text: 'text-[#2e7d32]', dot: 'bg-[#2e7d32]' },
  Cancelado: { label: 'Cancelado', bg: 'bg-[#fce4ec]', text: 'text-[#c62828]', dot: 'bg-[#c62828]' },
}
const OPTIONS = ['Pendiente', 'Aprobado', 'Cancelado']

describe('StatusPill', () => {
  it('modo no editable: renderiza un badge de solo lectura, sin botón ni menú', () => {
    render(<StatusPill value="Pendiente" meta={META} options={OPTIONS} editable={false} />)
    expect(screen.getByText('Pendiente')).toBeInTheDocument()
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })

  it('modo editable: renderiza un botón con el label actual', () => {
    render(<StatusPill value="Pendiente" meta={META} options={OPTIONS} editable={true} onChange={() => {}} />)
    expect(screen.getByRole('button', { name: 'Pendiente' })).toBeInTheDocument()
  })

  it('click abre el menú con todas las opciones', async () => {
    const user = userEvent.setup()
    render(<StatusPill value="Pendiente" meta={META} options={OPTIONS} editable={true} onChange={() => {}} />)

    await user.click(screen.getByRole('button', { name: 'Pendiente' }))

    expect(screen.getByRole('button', { name: 'Aprobado' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Cancelado' })).toBeInTheDocument()
  })

  it('el menú se renderiza en un portal fuera del wrapper (document.body), para no quedar recortado por contenedores con overflow', async () => {
    const user = userEvent.setup()
    const { container } = render(
      <StatusPill value="Pendiente" meta={META} options={OPTIONS} editable={true} onChange={() => {}} />
    )

    await user.click(screen.getByRole('button', { name: 'Pendiente' }))

    const menuOption = screen.getByRole('button', { name: 'Cancelado' })
    expect(container.contains(menuOption)).toBe(false)
    expect(document.body.contains(menuOption)).toBe(true)
  })

  it('si no hay espacio debajo dentro del viewport (última fila de una tabla), el menú abre hacia arriba', async () => {
    const originalInnerHeight = window.innerHeight
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 200 })
    const user = userEvent.setup()
    render(<StatusPill value="Pendiente" meta={META} options={OPTIONS} editable={true} onChange={() => {}} />)

    const trigger = screen.getByRole('button', { name: 'Pendiente' })
    // Simula un botón pegado al borde inferior del viewport (poco espacio debajo, sí arriba).
    trigger.parentElement.getBoundingClientRect = () => ({
      top: 150, bottom: 160, left: 5, width: 60, height: 10, right: 65, x: 5, y: 150, toJSON() {},
    })

    await user.click(trigger)

    const menuOption = screen.getByRole('button', { name: 'Cancelado' })
    const menu = menuOption.closest('div')
    expect(parseFloat(menu.style.top)).toBeLessThan(150)

    Object.defineProperty(window, 'innerHeight', { configurable: true, value: originalInnerHeight })
  })

  it('elegir una opción del menú llama a onChange con esa key y cierra el menú', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn().mockResolvedValue(undefined)
    render(<StatusPill value="Pendiente" meta={META} options={OPTIONS} editable={true} onChange={onChange} />)

    await user.click(screen.getByRole('button', { name: 'Pendiente' }))
    await user.click(screen.getByRole('button', { name: 'Aprobado' }))

    expect(onChange).toHaveBeenCalledWith('Aprobado')
    await waitFor(() => {
      expect(screen.queryByRole('button', { name: 'Cancelado' })).not.toBeInTheDocument()
    })
  })

  it('elegir la opción ya seleccionada NO llama a onChange', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<StatusPill value="Pendiente" meta={META} options={OPTIONS} editable={true} onChange={onChange} />)

    await user.click(screen.getByRole('button', { name: 'Pendiente' }))
    // Dentro del menú también aparece la opción actual ("Pendiente"); hay dos
    // botones con ese nombre (el trigger + la opción del menú) — clickeamos el segundo.
    const pendienteButtons = screen.getAllByRole('button', { name: 'Pendiente' })
    await user.click(pendienteButtons[pendienteButtons.length - 1])

    expect(onChange).not.toHaveBeenCalled()
  })

  it('click fuera del componente cierra el menú', async () => {
    const user = userEvent.setup()
    render(
      <div>
        <StatusPill value="Pendiente" meta={META} options={OPTIONS} editable={true} onChange={() => {}} />
        <button>fuera</button>
      </div>
    )

    await user.click(screen.getByRole('button', { name: 'Pendiente' }))
    expect(screen.getByRole('button', { name: 'Cancelado' })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'fuera' }))
    expect(screen.queryByRole('button', { name: 'Cancelado' })).not.toBeInTheDocument()
  })

  it('deshabilita el botón mientras onChange está en vuelo', async () => {
    const user = userEvent.setup()
    let resolvePromise
    const onChange = vi.fn(() => new Promise((resolve) => { resolvePromise = resolve }))
    render(<StatusPill value="Pendiente" meta={META} options={OPTIONS} editable={true} onChange={onChange} />)

    await user.click(screen.getByRole('button', { name: 'Pendiente' }))
    await user.click(screen.getByRole('button', { name: 'Aprobado' }))

    expect(screen.getByRole('button', { name: 'Pendiente' })).toBeDisabled()
    resolvePromise()
    await waitFor(() => expect(screen.getByRole('button', { name: 'Pendiente' })).not.toBeDisabled())
  })
})
