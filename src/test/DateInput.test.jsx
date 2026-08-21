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

  it('permite saltar de año/mes vía la vista de rejilla (ej. cumpleaños de 2001)', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<DateInput value="2026-08-01" onChange={onChange} />)

    await user.click(screen.getByRole('textbox'))
    await waitFor(() => expect(screen.getByText(/agosto 2026/i)).toBeInTheDocument())

    // Header de días -> vista de meses
    await user.click(screen.getByText(/agosto 2026/i))
    await waitFor(() => expect(screen.getByText('2026')).toBeInTheDocument())

    // Header de meses (año) -> vista de años
    await user.click(screen.getByText('2026'))
    await waitFor(() => expect(screen.getByText(/^\d{4}–\d{4}$/)).toBeInTheDocument())

    // Retroceder páginas de años hasta llegar a la que contiene 2001
    while (!screen.queryByRole('button', { name: '2001' })) {
      await user.click(screen.getByRole('button', { name: /años anteriores/i }))
    }
    await user.click(screen.getByRole('button', { name: '2001' }))

    // Vuelve a vista de meses, ahora en 2001
    await waitFor(() => expect(screen.getByText('2001')).toBeInTheDocument())
    await user.click(screen.getByRole('button', { name: /^mar$/i }))

    // Vuelve a vista de días, en marzo 2001
    await waitFor(() => expect(screen.getByText(/marzo 2001/i)).toBeInTheDocument())
    await user.click(screen.getByRole('button', { name: '11' }))

    expect(onChange).toHaveBeenCalledWith('2001-03-11')
  })

  it('la vista de años pagina de a 12 años', async () => {
    const user = userEvent.setup()
    render(<DateInput value="2026-08-01" onChange={() => {}} />)

    await user.click(screen.getByRole('textbox'))
    await waitFor(() => expect(screen.getByText(/agosto 2026/i)).toBeInTheDocument())
    await user.click(screen.getByText(/agosto 2026/i))
    await user.click(screen.getByText('2026'))

    const rangeBefore = screen.getByText(/^\d{4}–\d{4}$/).textContent
    const [startBefore] = rangeBefore.split('–').map(Number)

    await user.click(screen.getByRole('button', { name: /años anteriores/i }))

    const rangeAfter = screen.getByText(/^\d{4}–\d{4}$/).textContent
    const [startAfter] = rangeAfter.split('–').map(Number)

    expect(startBefore - startAfter).toBe(12)
  })

  it('disabled: no permite abrir el calendario ni editar el texto', async () => {
    const user = userEvent.setup()
    render(<DateInput value="2026-01-11" onChange={() => {}} disabled />)

    expect(screen.getByRole('textbox')).toBeDisabled()
    await user.click(screen.getByRole('textbox'))
    expect(screen.queryByText(/enero 2026/i)).not.toBeInTheDocument()
  })
})
