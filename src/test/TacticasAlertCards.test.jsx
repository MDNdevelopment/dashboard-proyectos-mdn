import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi } from 'vitest'
import TacticasAlertCards from '../components/ads/tacticas/TacticasAlertCards'

const stats = {
  vigentes: 18,
  brandsTotal: 71,
  vencen3: 2,
  vencenMes: 4,
  sinTactica: 53,
  avgPct: 64,
}

describe('TacticasAlertCards', () => {
  it('muestra los contadores', () => {
    render(<TacticasAlertCards stats={stats} estado="vigentes" onFilter={() => {}} />)
    expect(screen.getByText('18')).toBeInTheDocument()
    expect(screen.getByText(/de 71 marcas/)).toBeInTheDocument()
    expect(screen.getByText(/cumplimiento 64%/)).toBeInTheDocument()
    expect(screen.getByText('2')).toBeInTheDocument()
    expect(screen.getByText('4')).toBeInTheDocument()
    expect(screen.getByText('53')).toBeInTheDocument()
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

  it('las tres primeras tarjetas filtran al hacer clic', async () => {
    const user = userEvent.setup()
    const onFilter = vi.fn()
    render(<TacticasAlertCards stats={stats} estado="vigentes" onFilter={onFilter} />)

    await user.click(screen.getByRole('button', { name: /Vencen en 3 días/ }))
    expect(onFilter).toHaveBeenLastCalledWith('vencen3')
    await user.click(screen.getByRole('button', { name: /Vencen este mes/ }))
    expect(onFilter).toHaveBeenLastCalledWith('vencen_mes')
    await user.click(screen.getByRole('button', { name: /Tácticas vigentes/ }))
    expect(onFilter).toHaveBeenLastCalledWith('vigentes')
  })

  it('"Sin táctica vigente" es informativa (esas marcas se listan en Por hacer)', () => {
    render(<TacticasAlertCards stats={stats} estado="vigentes" onFilter={() => {}} />)
    expect(screen.queryByRole('button', { name: /Sin táctica vigente/ })).not.toBeInTheDocument()
  })

  it('resalta la tarjeta del filtro activo', () => {
    render(<TacticasAlertCards stats={stats} estado="vencen3" onFilter={() => {}} />)
    expect(screen.getByRole('button', { name: /Vencen en 3 días/ }).className).toContain('ring-2')
    expect(screen.getByRole('button', { name: /Vencen este mes/ }).className).not.toContain(
      'ring-2',
    )
  })
})
