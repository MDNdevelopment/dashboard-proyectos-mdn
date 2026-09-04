import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import ChequeoSummary from '../components/chequeo/ChequeoSummary'

function summary(overrides = {}) {
  return {
    totalCuentas: 24,
    sinRedes: 0,
    actualizadas: 11,
    parciales: 6,
    sinRegistrar: 7,
    enAlerta: 4,
    porVencer: 3,
    celdasTotal: 60,
    celdasConFecha: 40,
    ...overrides,
  }
}

describe('ChequeoSummary', () => {
  it('muestra los conteos de las 3 tarjetas (Cuentas, Actualizadas, Por vencer)', () => {
    render(<ChequeoSummary summary={summary()} periodoLabel="Semana S3" />)
    expect(screen.getByText('Cuentas')).toBeInTheDocument()
    expect(screen.getByText('24')).toBeInTheDocument()
    expect(screen.getByText('Actualizadas')).toBeInTheDocument()
    expect(screen.getByText('11')).toBeInTheDocument()
    expect(screen.getByText('Por vencer')).toBeInTheDocument()
    expect(screen.getByText('3')).toBeInTheDocument()
  })

  it('ya no muestra las tarjetas de Parciales, Sin registrar ni En alerta', () => {
    render(<ChequeoSummary summary={summary()} periodoLabel="Semana S3" />)
    expect(screen.queryByText('Parciales')).not.toBeInTheDocument()
    expect(screen.queryByText('Sin registrar')).not.toBeInTheDocument()
    expect(screen.queryByText('En alerta')).not.toBeInTheDocument()
  })

  it('muestra el porcentaje de cuentas actualizadas sobre el total', () => {
    render(<ChequeoSummary summary={summary()} periodoLabel="Semana S3" />)
    expect(screen.getByText('46% del total')).toBeInTheDocument()
  })

  it('con cero cuentas no calcula porcentaje ni rompe', () => {
    render(
      <ChequeoSummary
        summary={summary({
          totalCuentas: 0,
          actualizadas: 0,
          parciales: 0,
          sinRegistrar: 0,
          enAlerta: 0,
          porVencer: 0,
        })}
        periodoLabel="Semana S3"
      />,
    )
    expect(screen.queryByText(/% del total/)).not.toBeInTheDocument()
    expect(screen.queryByText(/Estado de cuentas/)).not.toBeInTheDocument()
  })

  it('muestra cuántas cuentas no tienen redes cargadas en vez del período cuando sinRedes > 0', () => {
    render(<ChequeoSummary summary={summary({ sinRedes: 2 })} periodoLabel="Semana S3" />)
    expect(screen.getByText('2 sin redes')).toBeInTheDocument()
  })

  it('sin cuentas sin redes, muestra el período en la tarjeta de Cuentas', () => {
    render(<ChequeoSummary summary={summary({ sinRedes: 0 })} periodoLabel="Semana S3" />)
    expect(screen.getAllByText('Semana S3').length).toBeGreaterThan(0)
  })
})
