import { render, screen } from '@testing-library/react'
import EstudioAvailability from '../components/pautas/EstudioAvailability'

const estudio = (o) => ({
  id: 'x',
  client_id: 'otro',
  client_name: 'Smashack',
  status: 'programada',
  lugar_tipo: 'estudio',
  pauta_date: '2026-10-10',
  salida: '13:00:00',
  deleted_at: null,
  ...o,
})

describe('EstudioAvailability', () => {
  it('sin fecha pide elegirla', () => {
    render(<EstudioAvailability pautas={[]} date={null} salida={null} />)
    expect(screen.getByText(/Elige la fecha/)).toBeInTheDocument()
  })

  it('día libre y hora válida → "Libre de … a …"', () => {
    render(<EstudioAvailability pautas={[]} date="2026-10-10" salida="09:00" clientId="c1" />)
    expect(screen.getByText(/Nadie ha reservado/)).toBeInTheDocument()
    expect(screen.getByText(/Libre de 09:00 A\.M\. a 11:00 A\.M\./)).toBeInTheDocument()
  })

  it('lista la ocupación del día y marca el choque con la pauta que lo causa', () => {
    render(
      <EstudioAvailability pautas={[estudio()]} date="2026-10-10" salida="14:00" clientId="c1" />,
    )
    expect(screen.getByRole('listitem')).toHaveTextContent('01:00 P.M. – 03:00 P.M.')
    expect(screen.getByRole('listitem')).toHaveTextContent('Smashack')
    expect(screen.getByRole('alert')).toHaveTextContent(/Ocupado: choca con Smashack/)
  })

  it('una solicitud pendiente solo avisa; sin hora propia pide la hora', () => {
    const { rerender } = render(
      <EstudioAvailability
        pautas={[estudio({ status: 'solicitada' })]}
        date="2026-10-10"
        salida="14:00"
        clientId="c1"
      />,
    )
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(screen.getByText(/también pidió el estudio/)).toBeInTheDocument()
    expect(screen.getByText('solicitud')).toBeInTheDocument()

    rerender(
      <EstudioAvailability pautas={[estudio()]} date="2026-10-10" salida={null} clientId="c1" />,
    )
    expect(screen.getByText(/Indica la hora de salida/)).toBeInTheDocument()
  })

  it('el mismo cliente no genera choque', () => {
    render(
      <EstudioAvailability pautas={[estudio()]} date="2026-10-10" salida="14:00" clientId="otro" />,
    )
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(screen.getByText(/Libre de/)).toBeInTheDocument()
  })
})
