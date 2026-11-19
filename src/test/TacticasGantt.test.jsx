import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi } from 'vitest'
import TacticasGantt from '../components/ads/tacticas/TacticasGantt'

const TODAY = '2026-11-19'

const brands = [
  { id: 'b1', name: 'RE/MAX' },
  { id: 'b2', name: 'Capitas' },
]

const camp = (over = {}) => ({
  id: 'c1',
  name: 'Plan RE/MAX',
  client_id: 'b1',
  status: 'En Curso',
  start_date: '2026-11-01',
  end_date: '2026-11-21',
  created_at: '2026-11-01T10:00:00Z',
  checklist: [],
  ...over,
})

function renderGantt(props = {}) {
  return render(
    <TacticasGantt
      brands={brands}
      campaigns={[camp()]}
      today={TODAY}
      onSelect={() => {}}
      onOpenBrand={() => {}}
      {...props}
    />,
  )
}

describe('TacticasGantt', () => {
  it('muestra los meses de la ventana y una fila por marca', () => {
    renderGantt()
    for (const m of ['Octubre', 'Noviembre', 'Diciembre', 'Enero', 'Febrero']) {
      expect(screen.getByText(m)).toBeInTheDocument()
    }
    expect(screen.getAllByRole('listitem')).toHaveLength(2)
  })

  it('la barra describe fechas, duración y días que quedan, y abre el detalle', async () => {
    const user = userEvent.setup()
    const onSelect = vi.fn()
    renderGantt({ onSelect })
    const bar = screen.getByRole('button', { name: /^Plan RE\/MAX:/ })
    expect(bar).toHaveAccessibleName(/\(21 días\)/)
    expect(bar).toHaveAccessibleName(/2 días$/)
    // Vence en 2 días → rojo.
    expect(bar.className).toContain('bg-[#e05252]')

    await user.click(bar)
    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ id: 'c1' }))
  })

  it('una marca sin vigente dice "Sin táctica vigente" y va al final', () => {
    renderGantt()
    const rows = screen.getAllByRole('listitem')
    expect(within(rows[0]).getByRole('button', { name: 'RE/MAX' })).toBeInTheDocument()
    expect(within(rows[1]).getByText('Sin táctica vigente')).toBeInTheDocument()
  })

  it('clic en el nombre de la marca la abre (filtra por ella)', async () => {
    const user = userEvent.setup()
    const onOpenBrand = vi.fn()
    renderGantt({ onOpenBrand })
    await user.click(screen.getByRole('button', { name: 'Capitas' }))
    expect(onOpenBrand).toHaveBeenCalledWith('b2')
  })

  it('las flechas corren la ventana de a un mes y "Hoy" vuelve', async () => {
    const user = userEvent.setup()
    renderGantt()
    expect(screen.queryByRole('button', { name: 'Hoy' })).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Mes siguiente' }))
    expect(screen.queryByText('Octubre')).not.toBeInTheDocument()
    expect(screen.getByText('Marzo')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Hoy' }))
    expect(screen.getByText('Octubre')).toBeInTheDocument()
  })

  it('las terminadas se ven en gris y dicen que terminaron', () => {
    renderGantt({
      campaigns: [camp({ status: 'Finalizado', start_date: '2026-10-01', end_date: '2026-10-31' })],
    })
    const bar = screen.getByRole('button', { name: /^Plan RE\/MAX:/ })
    expect(bar).toHaveAccessibleName(/terminada$/)
    expect(bar.className).toContain('bg-[#d9d6cc]')
  })

  it('sin marcas avisa en vez de dibujar un diagrama vacío', () => {
    renderGantt({ brands: [] })
    expect(screen.getByText('Sin marcas para los filtros aplicados')).toBeInTheDocument()
  })
})
