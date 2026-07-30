import { render, screen } from '@testing-library/react'
import LeadsStatsView from '../components/leads/LeadsStatsView'

// Nota: no se mockea recharts — LeadsPage.test.jsx ya prueba que renderiza sin errores
// dentro de jsdom (contenedores a 0×0). Aquí solo se verifican los cálculos propios del
// componente (KPIs, agrupación por mes, servicios), expuestos como texto plano fuera de
// los charts de recharts.

const MOCK_LEADS = [
  { id: '1', created_at: '2026-06-10T10:00:00Z', status: 'pendiente', servicios: ['Web'] },
  { id: '2', created_at: '2026-06-15T10:00:00Z', status: 'pendiente', servicios: ['Web', 'Redes'] },
  { id: '3', created_at: '2026-07-01T10:00:00Z', status: 'contactado', servicios: ['Redes'] },
  { id: '4', created_at: '2026-07-05T10:00:00Z', status: 'cancelado', servicios: [] },
]

describe('LeadsStatsView', () => {
  it('shows the empty state when there are no leads', () => {
    render(<LeadsStatsView leads={[]} />)
    expect(screen.getByText('Aún no hay leads para generar estadísticas.')).toBeInTheDocument()
  })

  it('computes total and percentage per status', () => {
    render(<LeadsStatsView leads={MOCK_LEADS} />)
    expect(screen.getByText('Total leads')).toBeInTheDocument()
    expect(screen.getByText('4')).toBeInTheDocument()
    // 2 de 4 pendientes = 50%; 1 de 4 contactados = 25% (también es la tasa de conversión)
    expect(screen.getByText('% Pendientes')).toBeInTheDocument()
    expect(screen.getAllByText('50%').length).toBeGreaterThan(0)
    expect(screen.getByText('% Contactados')).toBeInTheDocument()
    expect(screen.getAllByText('25%').length).toBeGreaterThan(0)
    expect(screen.getByText('% Cancelados')).toBeInTheDocument()
    expect(screen.getByText('Tasa de conversión')).toBeInTheDocument()
  })

  it('renders the "Leads por mes" section', () => {
    render(<LeadsStatsView leads={MOCK_LEADS} />)
    expect(screen.getByText('Leads por mes')).toBeInTheDocument()
  })

  it('shows the servicios más solicitados section when leads have servicios', () => {
    render(<LeadsStatsView leads={MOCK_LEADS} />)
    // El contenido interno del BarChart (ticks "Web"/"Redes") no se renderiza en jsdom
    // (recharts mide el contenedor a 0px) — se verifica solo que la sección aparece.
    expect(screen.getByText('Servicios más solicitados')).toBeInTheDocument()
  })

  it('does not render the servicios section when no lead has servicios', () => {
    const leadsSinServicios = [
      { id: '1', created_at: '2026-06-10T10:00:00Z', status: 'pendiente', servicios: [] },
    ]
    render(<LeadsStatsView leads={leadsSinServicios} />)
    expect(screen.queryByText('Servicios más solicitados')).not.toBeInTheDocument()
  })
})
