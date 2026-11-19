import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi } from 'vitest'
import TacticasVigentesTable from '../components/ads/tacticas/TacticasVigentesTable'
import { latestByBrand } from '../utils/tacticas'

const TODAY = '2026-11-19'
const FOLDER = 'https://drive.google.com/drive/folders/1AbCdEfGhIjKlMnOpQrStUvWxYz012345'

const camp = (over = {}) => ({
  id: 'c1',
  name: 'Plan noviembre',
  client: 'RE/MAX',
  client_id: 'b1',
  status: 'En Curso',
  start_date: '2026-11-01',
  end_date: '2026-12-31',
  created_at: '2026-11-01T10:00:00Z',
  checklist: [],
  ...over,
})

function renderTable(campaigns, props = {}) {
  return render(
    <TacticasVigentesTable
      campaigns={campaigns}
      today={TODAY}
      clientsById={new Map([['b1', { id: 'b1', logo_url: null }]])}
      latestByBrand={latestByBrand(campaigns)}
      leadOf={() => 'Sabrina'}
      canManage
      onSelect={() => {}}
      onOpenBrand={() => {}}
      {...props}
    />,
  )
}

describe('TacticasVigentesTable', () => {
  it('muestra marca, táctica, jefa y los días que quedan', () => {
    renderTable([camp()])
    expect(screen.getByText('RE/MAX')).toBeInTheDocument()
    expect(screen.getByText('Plan noviembre')).toBeInTheDocument()
    expect(screen.getByText('Sabrina')).toBeInTheDocument()
    expect(screen.getByText('42 días')).toBeInTheDocument()
  })

  it('ordena por la que vence primero', () => {
    renderTable([
      camp({ id: 'tarde', name: 'Tarde', end_date: '2026-12-31', client_id: 'b2' }),
      camp({ id: 'pronto', name: 'Pronto', end_date: '2026-11-20', client_id: 'b3' }),
    ])
    const rows = screen.getAllByRole('row').slice(1)
    expect(rows[0]).toHaveTextContent('Pronto')
    expect(rows[1]).toHaveTextContent('Tarde')
  })

  it('pinta la pill según la urgencia: rojo si vence en ≤3 días, verde si hay margen', () => {
    renderTable([
      camp({ id: 'a', name: 'Urgente', end_date: '2026-11-20', client_id: 'b2' }),
      camp({ id: 'b', name: 'Holgada', end_date: '2026-12-31', client_id: 'b3' }),
    ])
    expect(screen.getByText('1 día').className).toContain('bg-[#fce4e4]')
    expect(screen.getByText('42 días').className).toContain('bg-[#e3f2e5]')
  })

  it('avisa "Vence hoy" el mismo día del vencimiento', () => {
    renderTable([camp({ end_date: TODAY })])
    expect(screen.getByText('Vence hoy')).toBeInTheDocument()
  })

  it('muestra el avance X/N del checklist, o un guion si no hay acciones', () => {
    renderTable([
      camp({
        id: 'a',
        name: 'Con acciones',
        client_id: 'b2',
        checklist: [
          { id: '1', title: 'x', done: true },
          { id: '2', title: 'y', done: false },
        ],
      }),
      camp({ id: 'b', name: 'Sin acciones', client_id: 'b3' }),
    ])
    expect(screen.getByText('1/2')).toBeInTheDocument()
  })

  it('marca como "Programada" la que todavía no empezó', () => {
    renderTable([camp({ start_date: '2026-12-01' })])
    expect(screen.getByText(/Programada · empieza el/)).toBeInTheDocument()
  })

  it('el link de Drive abre en pestaña nueva y no abre el detalle', async () => {
    const user = userEvent.setup()
    const onSelect = vi.fn()
    renderTable([camp({ drive_url: FOLDER })], { onSelect })

    const link = screen.getByRole('link', { name: 'Carpeta' })
    expect(link).toHaveAttribute('href', FOLDER)
    expect(link).toHaveAttribute('target', '_blank')
    await user.click(link)
    expect(onSelect).not.toHaveBeenCalled()
  })

  it('avisa que falta el link solo en la última táctica de la marca y solo con ads.manage', () => {
    const vieja = camp({
      id: 'vieja',
      name: 'Vieja',
      start_date: '2026-01-01',
      end_date: '2026-12-31',
    })
    const nueva = camp({ id: 'nueva', name: 'Nueva', start_date: '2026-11-01' })
    const { unmount } = renderTable([vieja, nueva])
    // Dos filas de la misma marca, pero el aviso es uno: el de la última.
    expect(screen.getAllByText('Falta el link')).toHaveLength(1)
    const row = screen.getByText('Nueva').closest('tr')
    expect(within(row).getByText('Falta el link')).toBeInTheDocument()
    unmount()

    renderTable([vieja, nueva], { canManage: false })
    expect(screen.queryByText('Falta el link')).not.toBeInTheDocument()
  })

  it('clic en la fila abre el detalle; clic en la marca abre su ficha sin abrir el detalle', async () => {
    const user = userEvent.setup()
    const onSelect = vi.fn()
    const onOpenBrand = vi.fn()
    const c = camp()
    renderTable([c], { onSelect, onOpenBrand })

    await user.click(screen.getByRole('button', { name: 'Ver ficha de RE/MAX' }))
    expect(onOpenBrand).toHaveBeenCalledWith('b1')
    expect(onSelect).not.toHaveBeenCalled()

    await user.click(screen.getByText('Plan noviembre'))
    expect(onSelect).toHaveBeenCalledWith(c)
  })

  it('sin tácticas muestra el estado vacío', () => {
    renderTable([])
    expect(screen.getByText('Sin tácticas para los filtros aplicados')).toBeInTheDocument()
  })
})
