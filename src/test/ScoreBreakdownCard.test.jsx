import { render, screen, fireEvent } from '@testing-library/react'
import ScoreBreakdownCard from '../components/evaluaciones/ScoreBreakdownCard'

function result(overrides = {}) {
  return {
    score: 87,
    estado: 'ok',
    breakdown: [],
    disponibilidad: 1,
    autoCirculoPct: null,
    ...overrides,
  }
}

const CRITERIA = [{ id: 'c1', icon: '⭐', name: 'Calidad', description: 'Qué tan bien lo hace' }]

function rating(overrides = {}) {
  return {
    items: [{ criterion_id: 'c1', icon: '⭐', name: 'Calidad', score: 9.2 }],
    comment: 'Buen mes',
    rated_at: '2026-08-30T00:00:00Z',
    ...overrides,
  }
}

describe('ScoreBreakdownCard', () => {
  it('sin criterios del jefe: la nota es el score automático convertido a /10', () => {
    render(<ScoreBreakdownCard result={result({ score: 87 })} />)
    // 87/100 → 8.7/10
    expect(screen.getByText('8.7')).toBeInTheDocument()
    expect(screen.getByText('sobre 10')).toBeInTheDocument()
    expect(screen.queryByText(/Lo evalúa el jefe/)).not.toBeInTheDocument()
  })

  it('un cargo sin criterios no muestra el bloque del jefe aunque haya score', () => {
    render(<ScoreBreakdownCard result={result()} criteria={[]} />)
    expect(screen.queryByText(/Lo evalúa el jefe/)).not.toBeInTheDocument()
  })

  it('combina 70/30 cuando hay score automático y evaluación del jefe', () => {
    render(
      <ScoreBreakdownCard
        result={result({ score: 87 })}
        criteria={CRITERIA}
        managerRating={rating({
          items: [{ criterion_id: 'c1', icon: '⭐', name: 'Calidad', score: 9 }],
        })}
      />,
    )
    // auto 8.7/10 (70%) + jefe 9/10 (30%) = 8.79/10
    expect(screen.getByText('8.8')).toBeInTheDocument()
    // el criterio del jefe aparece en su casilla
    expect(screen.getByText('9.0')).toBeInTheDocument()
  })

  it('cargo sin indicadores automáticos usa solo la evaluación del jefe como nota', () => {
    render(
      <ScoreBreakdownCard
        result={result({ score: null, estado: 'sin_datos' })}
        criteria={CRITERIA}
        managerRating={rating()}
      />,
    )
    // "9.2" aparece tanto en la nota general como en la casilla del criterio.
    expect(screen.getAllByText('9.2').length).toBeGreaterThanOrEqual(2)
  })

  it('sin evaluación del jefe todavía muestra el aviso de pendiente', () => {
    render(
      <ScoreBreakdownCard
        result={result({ score: 87 })}
        criteria={CRITERIA}
        managerRating={null}
      />,
    )
    expect(screen.getByText('Pendiente de evaluación este mes.')).toBeInTheDocument()
  })

  it('muestra el botón Evaluar solo si canEvaluar es true', () => {
    const { rerender } = render(
      <ScoreBreakdownCard
        result={result()}
        criteria={CRITERIA}
        managerRating={null}
        canEvaluar={false}
      />,
    )
    expect(screen.queryByText('Evaluar')).not.toBeInTheDocument()

    rerender(
      <ScoreBreakdownCard
        result={result()}
        criteria={CRITERIA}
        managerRating={null}
        canEvaluar={true}
      />,
    )
    expect(screen.getByText('Evaluar')).toBeInTheDocument()
  })

  it('renderiza las casillas de la evaluación del jefe', () => {
    render(<ScoreBreakdownCard result={result()} criteria={CRITERIA} managerRating={rating()} />)
    expect(screen.getByText('Calidad')).toBeInTheDocument()
    expect(screen.getByText((text) => text.includes('Buen mes'))).toBeInTheDocument()
  })

  it('cada indicador trae su botón "i" que explica qué evalúa', () => {
    render(
      <ScoreBreakdownCard
        result={result({
          breakdown: [
            {
              key: 'tareas',
              label: 'Tareas',
              aplica: true,
              pct: 0.5,
              pesoBase: 100,
              pesoEfectivo: 100,
              unidades: 4,
            },
          ],
        })}
      />,
    )
    const btn = screen.getByRole('button', { name: 'Qué evalúa: Tareas' })
    fireEvent.mouseEnter(btn)
    expect(screen.getByRole('tooltip')).toHaveTextContent(/vencían este mes/)
  })

  it('muestra las cifras reales de cada categoría y su peso en el total', () => {
    render(
      <ScoreBreakdownCard
        result={result({
          breakdown: [
            {
              key: 'tareas',
              label: 'Tareas',
              aplica: true,
              pct: 4 / 7,
              pesoBase: 18,
              pesoEfectivo: 18,
              puntos: 10.3,
              unidades: 7,
              detalle: { total: 7, cumplidas: 4 },
            },
          ],
        })}
      />,
    )
    expect(screen.getByText('4 de 7 tareas cerradas a tiempo')).toBeInTheDocument()
    expect(screen.getByText('18% del total')).toBeInTheDocument()
  })

  it('un indicador que no aplica explica el motivo y que su peso se reparte', () => {
    render(
      <ScoreBreakdownCard
        result={result({
          breakdown: [
            {
              key: 'tareas',
              label: 'Tareas',
              aplica: false,
              pct: null,
              pesoBase: 18,
              pesoEfectivo: 0,
              puntos: 0,
              unidades: 1,
              detalle: {},
            },
          ],
        })}
      />,
    )
    expect(
      screen.getByText('Hubo 1 tarea con vencimiento; se necesitan al menos 2'),
    ).toBeInTheDocument()
    expect(screen.getByText('Su 18% se reparte entre los demás ítems')).toBeInTheDocument()
  })

  it('oculta los indicadores que no aplican al cargo (peso 0) pero muestra los que aplican sin datos', () => {
    render(
      <ScoreBreakdownCard
        result={result({
          breakdown: [
            {
              key: 'entregas',
              label: 'Cumplimiento de entregas',
              aplica: false,
              pct: null,
              pesoBase: 25,
              pesoEfectivo: 0,
              unidades: 0,
            },
            {
              key: 'tickets',
              label: 'Tickets IT en SLA',
              aplica: false,
              pct: null,
              pesoBase: 0,
              pesoEfectivo: 0,
              unidades: 0,
            },
          ],
        })}
      />,
    )
    expect(screen.getByText('Cumplimiento de entregas')).toBeInTheDocument()
    expect(screen.queryByText('Tickets IT en SLA')).not.toBeInTheDocument()
  })

  it('muestra el estado y color según el estado del resultado', () => {
    render(<ScoreBreakdownCard result={result({ estado: 'parcial' })} />)
    expect(screen.getByText('Medición parcial')).toBeInTheDocument()
  })

  it('muestra el nombre del empleado y el cargo', () => {
    render(
      <ScoreBreakdownCard result={result()} employeeName="Ana Pérez" cargoLabel="Diseñadora" />,
    )
    expect(screen.getByText('Ana Pérez')).toBeInTheDocument()
    expect(screen.getByText('Diseñadora')).toBeInTheDocument()
  })
})
