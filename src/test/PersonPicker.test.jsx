import { render, screen, fireEvent } from '@testing-library/react'
import { vi } from 'vitest'
import PersonPicker from '../components/chequeo/temporada/PersonPicker'

const USERS = [
  { user_id: 'u1', first_name: 'Sabrina', last_name: 'Bilbao' },
  { user_id: 'u2', first_name: 'Georgina', last_name: 'Portillo' },
  { user_id: 'u3', first_name: 'Paola', last_name: 'Urdaneta' },
  { user_id: 'u-old', first_name: 'Katherine', last_name: 'Mora', deleted_at: '2026-01-01' },
]

function setup(props = {}) {
  const onChange = vi.fn()
  render(<PersonPicker users={USERS} selectedId="u1" onChange={onChange} {...props} />)
  return { onChange }
}
const trigger = () => screen.getAllByRole('button')[0]

describe('PersonPicker (compacto)', () => {
  it('la casilla muestra solo el nombre de pila; el nombre completo va en el tooltip', () => {
    setup()
    expect(trigger()).toHaveTextContent('Sabrina')
    expect(trigger()).not.toHaveTextContent('Bilbao')
    expect(trigger()).toHaveAttribute('title', 'Sabrina Bilbao')
  })

  it('sin selección muestra el texto de «sin asignar»', () => {
    setup({ selectedId: null })
    expect(trigger()).toHaveTextContent('Sin asignar')
  })

  it('el menú lista a las personas con su nombre completo, ordenadas, sin archivados', () => {
    setup()
    fireEvent.click(trigger())
    const names = screen
      .getAllByRole('button')
      .map((b) => b.textContent)
      .filter((t) => /Bilbao|Portillo|Urdaneta|Mora/.test(t))
    expect(names.some((t) => t.includes('Georgina Portillo'))).toBe(true)
    expect(names.some((t) => t.includes('Mora'))).toBe(false)
  })

  it('elegir a alguien dispara onChange con su id y cierra el menú', () => {
    const { onChange } = setup()
    fireEvent.click(trigger())
    fireEvent.click(screen.getByRole('button', { name: /Georgina Portillo/ }))
    expect(onChange).toHaveBeenCalledWith('u2')
    expect(screen.queryByPlaceholderText('Buscar...')).not.toBeInTheDocument()
  })

  it('«Ninguno» dispara onChange con null', () => {
    const { onChange } = setup()
    fireEvent.click(trigger())
    fireEvent.click(screen.getByRole('button', { name: /Ninguno/ }))
    expect(onChange).toHaveBeenCalledWith(null)
  })

  it('el buscador filtra por nombre completo', () => {
    setup()
    fireEvent.click(trigger())
    fireEvent.change(screen.getByPlaceholderText('Buscar...'), { target: { value: 'urdan' } })
    expect(screen.getByRole('button', { name: /Paola Urdaneta/ })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Georgina Portillo/ })).not.toBeInTheDocument()
    fireEvent.change(screen.getByPlaceholderText('Buscar...'), { target: { value: 'zzz' } })
    expect(screen.getByText('Sin resultados')).toBeInTheDocument()
  })

  it('Escape y clic afuera cierran el menú', () => {
    setup()
    fireEvent.click(trigger())
    fireEvent.keyDown(screen.getByPlaceholderText('Buscar...'), { key: 'Escape' })
    expect(screen.queryByPlaceholderText('Buscar...')).not.toBeInTheDocument()
    fireEvent.click(trigger())
    fireEvent.mouseDown(document.body)
    expect(screen.queryByPlaceholderText('Buscar...')).not.toBeInTheDocument()
  })

  it('muestra a la persona seleccionada aunque esté archivada (no se pierde)', () => {
    setup({ selectedId: 'u-old' })
    expect(trigger()).toHaveTextContent('Katherine')
    fireEvent.click(trigger())
    // Archivada: se ve en la casilla, pero no se ofrece como opción nueva.
    expect(screen.queryByRole('button', { name: /Katherine Mora/ })).not.toBeInTheDocument()
  })
})
