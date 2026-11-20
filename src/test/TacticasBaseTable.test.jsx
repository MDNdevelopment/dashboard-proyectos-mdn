import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi } from 'vitest'
import TacticasBaseTable from '../components/ads/tacticas/TacticasBaseTable'
import { latestByBrand } from '../utils/tacticas'

const TODAY = '2026-11-19'
const FOLDER = 'https://drive.google.com/drive/folders/1AbCdEfGhIjKlMnOpQrStUvWxYz012345'

const camp = (over = {}) => ({
  id: 'c1',
  name: 'Plan noviembre',
  client: 'RE/MAX',
  client_id: 'b1',
  assignee: 'u1',
  status: 'En Curso',
  start_date: '2026-11-01',
  end_date: '2026-12-31',
  created_at: '2026-11-01T10:00:00Z',
  checklist: [],
  ...over,
})

function renderTable(campaigns, props = {}) {
  return render(
    <TacticasBaseTable
      campaigns={campaigns}
      today={TODAY}
      clientsById={new Map([['b1', { id: 'b1', logo_url: null }]])}
      latestByBrand={latestByBrand(campaigns)}
      leadOf={() => 'Sabrina'}
      canManage
      onSelect={() => {}}
      onOpenBrand={() => {}}
      onStatusChange={() => {}}
      onEdit={() => {}}
      onDelete={() => {}}
      {...props}
    />,
  )
}

const bodyRows = () => screen.getAllByRole('row').slice(1)

describe('TacticasBaseTable', () => {
  it('muestra marca, táctica, jefa y los días que quedan (sin columna Responsable)', () => {
    renderTable([camp()])
    expect(screen.getByText('RE/MAX')).toBeInTheDocument()
    expect(screen.getByText('Plan noviembre')).toBeInTheDocument()
    expect(screen.getByText('Sabrina')).toBeInTheDocument()
    expect(screen.getByText('42 días')).toBeInTheDocument()
    expect(screen.queryByRole('columnheader', { name: /Responsable/ })).not.toBeInTheDocument()
  })

  it('por defecto ordena por la más reciente; clic en "Vence" ordena por la que vence primero', async () => {
    const user = userEvent.setup()
    renderTable([
      camp({ id: 'vieja', name: 'Vieja', start_date: '2026-10-01', end_date: '2026-11-20' }),
      camp({ id: 'nueva', name: 'Nueva', start_date: '2026-11-10', end_date: '2026-12-31' }),
    ])
    expect(bodyRows()[0]).toHaveTextContent('Nueva')

    await user.click(screen.getByRole('columnheader', { name: /Vence/ }))
    expect(bodyRows()[0]).toHaveTextContent('Vieja')
    expect(bodyRows()[1]).toHaveTextContent('Nueva')
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

  it('una finalizada no muestra días; una vencida sin cerrar se marca en rojo', () => {
    renderTable([
      camp({ id: 'fin', name: 'Cerrada', status: 'Finalizado', end_date: '2026-10-31' }),
      camp({ id: 'venc', name: 'Colgada', status: 'En Curso', end_date: '2026-11-17' }),
    ])
    const cerrada = screen.getByText('Cerrada').closest('tr')
    expect(within(cerrada).queryByText(/Venció/)).not.toBeInTheDocument()
    const colgada = screen.getByText('Colgada').closest('tr')
    expect(within(colgada).getByText('vencida sin cerrar')).toBeInTheDocument()
    expect(colgada.className).toContain('bg-red-50/50')
  })

  it('muestra el avance X/N y el %, o un guion si no hay acciones', () => {
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
    expect(screen.getByText('1/2 · 50%')).toBeInTheDocument()
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

  it('Editar y Eliminar no abren el detalle', async () => {
    const user = userEvent.setup()
    const onSelect = vi.fn()
    const onEdit = vi.fn()
    const onDelete = vi.fn()
    const c = camp()
    renderTable([c], { onSelect, onEdit, onDelete })

    await user.click(screen.getByRole('button', { name: 'Editar Plan noviembre' }))
    expect(onEdit).toHaveBeenCalledWith(c)
    await user.click(screen.getByRole('button', { name: 'Eliminar Plan noviembre' }))
    expect(onDelete).toHaveBeenCalledWith(c)
    expect(onSelect).not.toHaveBeenCalled()
  })

  it('clic en el estado no abre el detalle', async () => {
    const user = userEvent.setup()
    const onSelect = vi.fn()
    renderTable([camp()], { onSelect })
    await user.click(screen.getByRole('button', { name: 'En Curso' }))
    expect(onSelect).not.toHaveBeenCalled()
  })

  it('sin ads.manage no hay acciones de editar ni eliminar', () => {
    renderTable([camp()], { canManage: false })
    expect(screen.queryByRole('button', { name: /Editar/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Eliminar/ })).not.toBeInTheDocument()
  })
})

describe('TacticasBaseTable — Sin fecha', () => {
  it('una táctica sin fechas muestra "Sin fecha" y "Agregar fecha" abre el formulario', async () => {
    const user = userEvent.setup()
    const onEdit = vi.fn()
    const onSelect = vi.fn()
    const c = camp({ status: 'Pendiente', start_date: null, end_date: null })
    renderTable([c], { onEdit, onSelect })

    const row = screen.getByText('Plan noviembre').closest('tr')
    expect(within(row).getByText('Sin fecha')).toBeInTheDocument()
    await user.click(within(row).getByRole('button', { name: 'Agregar fecha a Plan noviembre' }))
    expect(onEdit).toHaveBeenCalledWith(c)
    expect(onSelect).not.toHaveBeenCalled()
  })

  it('sin ads.manage solo muestra la etiqueta', () => {
    renderTable([camp({ start_date: null, end_date: null })], { canManage: false })
    expect(screen.getByText('Sin fecha')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Agregar fecha/ })).not.toBeInTheDocument()
  })
})
