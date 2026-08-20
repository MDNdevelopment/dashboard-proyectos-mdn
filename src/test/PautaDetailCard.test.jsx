/**
 * Smoke test de PautaDetailCard — modal de detalle solo-lectura que abre el click en una
 * pauta del calendario. Cubre: renderiza la info esperada, ya no usa emojis literales como
 * iconos (reemplazados por SVG), y cierra al click fuera / en la ✕.
 */
import { render, screen, fireEvent } from '@testing-library/react'
import { vi } from 'vitest'
import PautaDetailCard from '../components/pautas/PautaDetailCard'

const EMOJIS = ['⏩', '📅', '⏱️', '📍', '👥', '🎬']

const USERS_BY_ID = new Map([
  ['u1', { first_name: 'Lizdania', last_name: 'Andrade' }],
  ['u2', { first_name: 'Georgina', last_name: 'Ríos' }],
])

function pauta(overrides = {}) {
  return {
    id: 'p1',
    client_name: 'Cliente A',
    tema: 'Spot institucional',
    status: 'programada',
    pauta_date: '2026-08-20',
    salida: '09:00:00',
    llegada: '11:00:00',
    place: 'Estudio central',
    formats: ['V'],
    recurso_ids: ['u1'],
    attendee_ids: ['u2'],
    link: null,
    piezas_desc: null,
    ...overrides,
  }
}

describe('PautaDetailCard', () => {
  it('renderiza la info principal de la pauta', () => {
    render(<PautaDetailCard pauta={pauta()} usersById={USERS_BY_ID} onClose={vi.fn()} />)
    expect(screen.getByText('Cliente A')).toBeInTheDocument()
    expect(screen.getByText(/Estudio central/)).toBeInTheDocument()
    expect(screen.getByText(/Asiste: Georgina Ríos/)).toBeInTheDocument()
    expect(screen.getByText(/LIZDANIA ANDRADE/)).toBeInTheDocument()
  })

  it('ya no usa emojis literales como iconos (reemplazados por SVG)', () => {
    const { container } = render(
      <PautaDetailCard pauta={pauta()} usersById={USERS_BY_ID} onClose={vi.fn()} />,
    )
    const text = container.textContent
    EMOJIS.forEach((emoji) => expect(text).not.toContain(emoji))
    expect(container.querySelectorAll('svg').length).toBeGreaterThanOrEqual(6)
  })

  it('null pauta no renderiza nada', () => {
    const { container } = render(
      <PautaDetailCard pauta={null} usersById={USERS_BY_ID} onClose={vi.fn()} />,
    )
    expect(container).toBeEmptyDOMElement()
  })

  it('click en la ✕ cierra el modal', () => {
    const onClose = vi.fn()
    render(<PautaDetailCard pauta={pauta()} usersById={USERS_BY_ID} onClose={onClose} />)
    fireEvent.click(screen.getByLabelText('Cerrar'))
    expect(onClose).toHaveBeenCalled()
  })
})
