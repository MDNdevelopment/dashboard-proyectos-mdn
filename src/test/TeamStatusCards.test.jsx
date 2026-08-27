/**
 * Tests de TeamStatusCards — las dos tarjetas fijas de estado del equipo ("De vacaciones
 * ahora" / "En período de prueba") en Empresa → Empleados. Componente puramente de
 * presentación (sin Supabase), calcado de EmployeeDatesCalendar.test.jsx.
 */
import { render, screen } from '@testing-library/react'
import TeamStatusCards from '../components/empresa/TeamStatusCards'

function item(overrides = {}) {
  return {
    id: 'i1',
    user: { first_name: 'Ana', last_name: 'Pérez', avatar_url: null },
    name: 'Ana Pérez',
    subtitle: 'Hasta el 20/03',
    badge: null,
    dashed: false,
    ...overrides,
  }
}

describe('TeamStatusCards', () => {
  it('muestra los títulos de ambas tarjetas', () => {
    render(<TeamStatusCards onVacationItems={[]} probationItems={[]} />)
    expect(screen.getByText('De vacaciones ahora')).toBeInTheDocument()
    expect(screen.getByText('En período de prueba')).toBeInTheDocument()
  })

  it('muestra nombre y subtítulo por cada item', () => {
    render(
      <TeamStatusCards
        onVacationItems={[item({ name: 'Ana Pérez', subtitle: 'Hasta el 20/03' })]}
        probationItems={[]}
      />,
    )
    expect(screen.getByText('Ana Pérez')).toBeInTheDocument()
    expect(screen.getByText('Hasta el 20/03')).toBeInTheDocument()
  })

  it('un item con dashed+badge muestra el borde punteado y el texto del badge', () => {
    const { container } = render(
      <TeamStatusCards
        onVacationItems={[
          item({
            dashed: true,
            badge: { text: 'tentativa', cls: 'bg-amber-100 text-amber-800' },
          }),
        ]}
        probationItems={[]}
      />,
    )
    expect(screen.getByText('tentativa')).toBeInTheDocument()
    expect(container.querySelector('.border-dashed')).toBeTruthy()
  })

  it('con listas vacías, muestra el texto de vacío y las tarjetas siguen en el DOM', () => {
    render(<TeamStatusCards onVacationItems={[]} probationItems={[]} />)
    expect(screen.getByText('Nadie está de vacaciones hoy.')).toBeInTheDocument()
    expect(screen.getByText('Nadie está en período de prueba.')).toBeInTheDocument()
    expect(screen.getByText('De vacaciones ahora')).toBeInTheDocument()
    expect(screen.getByText('En período de prueba')).toBeInTheDocument()
  })

  it('el contador refleja items.length', () => {
    render(
      <TeamStatusCards
        onVacationItems={[item({ id: 'i1' }), item({ id: 'i2' })]}
        probationItems={[item({ id: 'i3' })]}
      />,
    )
    expect(screen.getByText('(2)')).toBeInTheDocument()
    expect(screen.getByText('(1)')).toBeInTheDocument()
  })
})
