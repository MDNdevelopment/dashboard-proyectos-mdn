import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi } from 'vitest'
import ClientPicker from '../components/common/ClientPicker'

const CLIENTS = [
  { id: 'c1', name: 'Punto Fit', deleted_at: null },
  { id: 'c2', name: 'Punto Beauty', deleted_at: null },
  { id: 'c3', name: 'Cliente archivado', deleted_at: '2026-01-01' },
]

describe('ClientPicker', () => {
  it('sin selección muestra "Sin clientes agregados."', () => {
    render(<ClientPicker clients={CLIENTS} selectedIds={[]} onChange={vi.fn()} />)
    expect(screen.getByText('Sin clientes agregados.')).toBeInTheDocument()
  })

  it('escribir en el buscador sugiere clientes activos que matchean, sin los archivados', async () => {
    const user = userEvent.setup()
    render(<ClientPicker clients={CLIENTS} selectedIds={[]} onChange={vi.fn()} />)
    await user.type(screen.getByPlaceholderText('Buscar cliente por nombre…'), 'Punto')
    expect(await screen.findByText('Punto Fit')).toBeInTheDocument()
    expect(screen.getByText('Punto Beauty')).toBeInTheDocument()
    expect(screen.queryByText('Cliente archivado')).not.toBeInTheDocument()
  })

  it('elegir una sugerencia agrega el id al arreglo y limpia el buscador', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<ClientPicker clients={CLIENTS} selectedIds={[]} onChange={onChange} />)
    await user.type(screen.getByPlaceholderText('Buscar cliente por nombre…'), 'Punto Fit')
    await user.click(await screen.findByText('Punto Fit'))
    expect(onChange).toHaveBeenCalledWith(['c1'])
  })

  it('muestra un chip por cada seleccionado, con botón para quitarlo', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<ClientPicker clients={CLIENTS} selectedIds={['c1', 'c2']} onChange={onChange} />)
    expect(screen.getByText('Punto Fit')).toBeInTheDocument()
    expect(screen.getByText('Punto Beauty')).toBeInTheDocument()
    await user.click(screen.getByLabelText('Quitar a Punto Fit'))
    expect(onChange).toHaveBeenCalledWith(['c2'])
  })
})
