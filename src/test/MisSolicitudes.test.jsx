import { render, screen, fireEvent, within } from '@testing-library/react'
import { vi } from 'vitest'
import MisSolicitudes from '../components/pautas/MisSolicitudes'

const TODAY = new Date(2026, 9, 7)

const pauta = (o = {}) => ({
  id: 'p',
  client_name: 'Cliente',
  tema: 'Tema',
  status: 'solicitada',
  pauta_date: null,
  salida: null,
  created_by: 'j1',
  created_at: '2026-10-01T10:00:00Z',
  deleted_at: null,
  ...o,
})

describe('MisSolicitudes', () => {
  it('no pinta nada si el usuario no ha pedido pautas', () => {
    const { container } = render(
      <MisSolicitudes pautas={[pauta({ created_by: 'otra' })]} userId="j1" today={TODAY} />,
    )
    expect(container).toBeEmptyDOMElement()
  })

  it('lista solo las mías, más recientes primero, con su avance', () => {
    render(
      <MisSolicitudes
        today={TODAY}
        userId="j1"
        pautas={[
          pauta({ id: 'a', client_name: 'Smashack', created_at: '2026-10-01T10:00:00Z' }),
          pauta({
            id: 'b',
            client_name: 'Alpitech',
            status: 'programada',
            pauta_date: '2026-10-09',
            salida: '09:00:00',
            created_at: '2026-10-02T10:00:00Z',
          }),
          pauta({ id: 'c', client_name: 'Ajena', created_by: 'otra' }),
          pauta({ id: 'd', client_name: 'Declinada', status: 'declinada' }),
        ]}
      />,
    )
    const items = screen.getAllByRole('button', { name: /^Mi solicitud/ })
    expect(items.map((b) => b.getAttribute('aria-label'))).toEqual([
      'Mi solicitud Alpitech',
      'Mi solicitud Smashack',
      'Mi solicitud Declinada',
    ])
    expect(screen.queryByText('Ajena')).not.toBeInTheDocument()

    const alpitech = items[0]
    expect(alpitech).toHaveTextContent(/9 oct 09:00 A\.M\./)
    const hitos = within(alpitech).getByRole('list', { name: 'Avance' })
    expect(hitos).toHaveTextContent(/Solicitada.*2 oct.*Agendada.*9 oct.*Realizada/)

    const smashack = items[1]
    expect(smashack).toHaveTextContent('sin fecha fija')
    const declinada = items[2]
    expect(within(declinada).getByRole('list', { name: 'Avance' })).toHaveTextContent(
      /Solicitada.*Declinada/,
    )
  })

  it('oculta realizadas de hace más de un mes', () => {
    render(
      <MisSolicitudes
        today={TODAY}
        userId="j1"
        pautas={[
          pauta({
            id: 'vieja',
            client_name: 'Vieja',
            status: 'realizada',
            pauta_date: '2026-08-01',
          }),
          pauta({
            id: 'nueva',
            client_name: 'Nueva',
            status: 'realizada',
            pauta_date: '2026-10-01',
          }),
        ]}
      />,
    )
    expect(screen.getByText('Nueva')).toBeInTheDocument()
    expect(screen.queryByText('Vieja')).not.toBeInTheDocument()
  })

  it('muestra 4 y deja ver el resto; clic abre la pauta', () => {
    const onPautaClick = vi.fn()
    const list = ['a', 'b', 'c', 'd', 'e', 'f'].map((id, i) =>
      pauta({ id, client_name: `C${id}`, created_at: `2026-10-0${i + 1}T00:00:00Z` }),
    )
    render(<MisSolicitudes today={TODAY} userId="j1" pautas={list} onPautaClick={onPautaClick} />)
    expect(screen.getAllByRole('button', { name: /^Mi solicitud/ })).toHaveLength(4)
    fireEvent.click(screen.getByRole('button', { name: 'Ver las 6' }))
    expect(screen.getAllByRole('button', { name: /^Mi solicitud/ })).toHaveLength(6)
    fireEvent.click(screen.getByRole('button', { name: 'Mi solicitud Cf' }))
    expect(onPautaClick).toHaveBeenCalledWith(expect.objectContaining({ id: 'f' }))
  })
})
