/**
 * Tests del componente compartido DateInput (src/components/common/DateInput.jsx):
 * selector de fecha con formato venezolano DD/MM/YYYY, independiente del
 * locale del navegador.
 *
 * Caso de regresión directo: el cliente ALSA quedó con mdn_since = 2026-11-01
 * (1 de noviembre interpretado como 11/01 en formato MM/DD) porque el
 * <input type="date"> nativo mostraba el orden americano. Este componente
 * debe garantizar que "11/01/2026" escrito por el usuario se guarde siempre
 * como el 11 de enero (2026-01-11), nunca como noviembre.
 */
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi } from 'vitest'

import DateInput from '../components/common/DateInput'

describe('DateInput', () => {
  it('renderiza un value ISO como DD/MM/YYYY', () => {
    render(<DateInput value="2026-01-11" onChange={() => {}} />)
    expect(screen.getByRole('textbox')).toHaveValue('11/01/2026')
  })

  it('renderiza vacío cuando value es ""', () => {
    render(<DateInput value="" onChange={() => {}} placeholder="dd/mm/aaaa" />)
    expect(screen.getByRole('textbox')).toHaveValue('')
  })

  it('escribir 11/01/2026 llama onChange con 2026-01-11 (no se intercambian día y mes)', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<DateInput value="" onChange={onChange} />)

    await user.type(screen.getByRole('textbox'), '11/01/2026')

    expect(onChange).toHaveBeenLastCalledWith('2026-01-11')
    expect(onChange).not.toHaveBeenCalledWith('2026-11-01')
  })

  it('una fecha inválida (31/02) no dispara onChange', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<DateInput value="" onChange={onChange} />)

    await user.type(screen.getByRole('textbox'), '31/02/2026')

    expect(onChange).not.toHaveBeenCalled()
  })

  it('abrir el calendario y seleccionar un día emite el ISO correcto', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<DateInput value="2026-01-01" onChange={onChange} />)

    await user.click(screen.getByRole('textbox'))
    await waitFor(() => expect(screen.getByText(/enero 2026/i)).toBeInTheDocument())

    await user.click(screen.getByRole('button', { name: '15' }))

    expect(onChange).toHaveBeenCalledWith('2026-01-15')
  })

  it('respeta min/max: un día fuera de rango está deshabilitado en el calendario', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<DateInput value="2026-01-15" onChange={onChange} min="2026-01-10" max="2026-01-20" />)

    await user.click(screen.getByRole('textbox'))
    await waitFor(() => expect(screen.getByText(/enero 2026/i)).toBeInTheDocument())

    expect(screen.getByRole('button', { name: '5' })).toBeDisabled()
    expect(screen.getByRole('button', { name: '25' })).toBeDisabled()
    expect(screen.getByRole('button', { name: '15' })).not.toBeDisabled()
  })

  it('respeta min/max: escribir una fecha fuera de rango no dispara onChange', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<DateInput value="" onChange={onChange} min="2026-01-10" max="2026-01-20" />)

    await user.type(screen.getByRole('textbox'), '25/01/2026')

    expect(onChange).not.toHaveBeenCalled()
  })

  it('clearable: el botón de limpiar vacía el valor', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<DateInput value="2026-01-11" onChange={onChange} clearable />)

    await user.click(screen.getByRole('button', { name: /limpiar fecha/i }))

    expect(onChange).toHaveBeenCalledWith('')
  })

  it('clearable=false no muestra botón de limpiar', () => {
    render(<DateInput value="2026-01-11" onChange={() => {}} clearable={false} />)
    expect(screen.queryByRole('button', { name: /limpiar fecha/i })).not.toBeInTheDocument()
  })

  it('disabled: no permite abrir el calendario ni editar el texto', async () => {
    const user = userEvent.setup()
    render(<DateInput value="2026-01-11" onChange={() => {}} disabled />)

    expect(screen.getByRole('textbox')).toBeDisabled()
    await user.click(screen.getByRole('textbox'))
    expect(screen.queryByText(/enero 2026/i)).not.toBeInTheDocument()
  })
})
