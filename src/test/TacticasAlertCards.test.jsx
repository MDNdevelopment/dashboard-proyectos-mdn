import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi } from 'vitest'
import TacticasAlertCards from '../components/ads/tacticas/TacticasAlertCards'

const stats = {
  brandsTotal: 71,
  brandsConVigente: 18,
  vigentes: 21,
  sinTactica: 53,
  avgPct: 64,
}

describe('TacticasAlertCards', () => {
  it('muestra cuántas marcas hay, cuántas tácticas están vigentes y las marcas sin táctica', () => {
    render(<TacticasAlertCards stats={stats} estado="vigentes" onFilter={() => {}} />)
    expect(screen.getByText('71')).toBeInTheDocument()
    expect(screen.getByText('18 con táctica vigente')).toBeInTheDocument()
    expect(screen.getByText('21')).toBeInTheDocument()
    expect(screen.getByText(/cumplimiento promedio 64%/)).toBeInTheDocument()
    expect(screen.getByText('53')).toBeInTheDocument()
    expect(screen.getByText('marcas por hacer')).toBeInTheDocument()
  })

  it('sin ninguna acción registrada no muestra el cumplimiento promedio', () => {
    render(
      <TacticasAlertCards
        stats={{ ...stats, avgPct: null }}
        estado="vigentes"
        onFilter={() => {}}
      />,
    )
    expect(screen.queryByText(/cumplimiento/)).not.toBeInTheDocument()
  })

  it('lo que vence pronto no ocupa tarjetas (llega como notificación y se ve en el Gantt)', () => {
    render(<TacticasAlertCards stats={stats} estado="vigentes" onFilter={() => {}} />)
    expect(screen.queryByText(/Vencen en 3 días/)).not.toBeInTheDocument()
    expect(screen.queryByText(/Vencen este mes/)).not.toBeInTheDocument()
  })

  it('"Tácticas vigentes" quita el filtro de estado al hacer clic', async () => {
    const user = userEvent.setup()
    const onFilter = vi.fn()
    render(<TacticasAlertCards stats={stats} estado="vencen3" onFilter={onFilter} />)
    await user.click(screen.getByRole('button', { name: /Tácticas vigentes/ }))
    expect(onFilter).toHaveBeenLastCalledWith('vigentes')
  })

  it('"Marcas" y "Sin táctica vigente" son informativas', () => {
    render(<TacticasAlertCards stats={stats} estado="vigentes" onFilter={() => {}} />)
    expect(screen.queryByRole('button', { name: /Sin táctica vigente/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^Marcas/ })).not.toBeInTheDocument()
  })

  it('resalta "Tácticas vigentes" solo cuando no hay filtro de estado', () => {
    const { rerender } = render(
      <TacticasAlertCards stats={stats} estado="vigentes" onFilter={() => {}} />,
    )
    expect(screen.getByRole('button', { name: /Tácticas vigentes/ }).className).toContain('ring-2')
    rerender(<TacticasAlertCards stats={stats} estado="vencen3" onFilter={() => {}} />)
    expect(screen.getByRole('button', { name: /Tácticas vigentes/ }).className).not.toContain(
      'ring-2',
    )
  })

  it('usa el singular con una sola marca por hacer', () => {
    render(
      <TacticasAlertCards
        stats={{ ...stats, sinTactica: 1 }}
        estado="vigentes"
        onFilter={() => {}}
      />,
    )
    expect(screen.getByText('marca por hacer')).toBeInTheDocument()
  })
})
