/**
 * Tests de AttendeePicker — botones rápidos por cargo (access_level, cada uno reemplaza
 * la selección), "Quitar a todos", buscador para agregar/quitar individualmente (marca
 * con check verde a los ya agregados en vez de ocultarlos), y lista de participantes ya
 * agregados (removibles). Solo se listan los ya agregados, no toda la plantilla. Los
 * cargos se resuelven por access_level, no por position_name (texto libre por empresa)
 * — ver ARQUITECTURA.md.
 */
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi } from 'vitest'
import AttendeePicker from '../components/reuniones/AttendeePicker'

const EMPLOYEES = [
  { user_id: 'director-1', first_name: 'Ana', last_name: 'Director', access_level: 4 },
  { user_id: 'jefe-1', first_name: 'Beto', last_name: 'Jefe', access_level: 3 },
  { user_id: 'coord-1', first_name: 'Carla', last_name: 'Coord', access_level: 2 },
  { user_id: 'emp-1', first_name: 'Dario', last_name: 'Empleado', access_level: 1 },
]

function renderPicker(selectedIds = [], onChange = vi.fn()) {
  render(<AttendeePicker employees={EMPLOYEES} selectedIds={selectedIds} onChange={onChange} />)
  return onChange
}

describe('AttendeePicker — botones rápidos por cargo', () => {
  it('"Solo directores" selecciona únicamente access_level >= 4', async () => {
    const user = userEvent.setup()
    const onChange = renderPicker()
    await user.click(screen.getByRole('button', { name: 'Solo directores' }))
    expect(onChange).toHaveBeenCalledWith(['director-1'])
  })

  it('"Solo jefes" selecciona únicamente access_level === 3 (excluye directores)', async () => {
    const user = userEvent.setup()
    const onChange = renderPicker()
    await user.click(screen.getByRole('button', { name: 'Solo jefes' }))
    expect(onChange).toHaveBeenCalledWith(['jefe-1'])
  })

  it('"Solo coordinadores" selecciona únicamente access_level === 2 (excluye jefes y directores)', async () => {
    const user = userEvent.setup()
    const onChange = renderPicker()
    await user.click(screen.getByRole('button', { name: 'Solo coordinadores' }))
    expect(onChange).toHaveBeenCalledWith(['coord-1'])
  })

  it('"Directores y jefes" selecciona access_level >= 3', async () => {
    const user = userEvent.setup()
    const onChange = renderPicker()
    await user.click(screen.getByRole('button', { name: 'Directores y jefes' }))
    const called = onChange.mock.calls[0][0]
    expect(new Set(called)).toEqual(new Set(['director-1', 'jefe-1']))
  })

  it('"Directores, jefes y coordinadores" selecciona access_level >= 2', async () => {
    const user = userEvent.setup()
    const onChange = renderPicker()
    await user.click(screen.getByRole('button', { name: 'Directores, jefes y coordinadores' }))
    const called = onChange.mock.calls[0][0]
    expect(new Set(called)).toEqual(new Set(['director-1', 'jefe-1', 'coord-1']))
  })

  it('"Toda la empresa" selecciona a todos los empleados', async () => {
    const user = userEvent.setup()
    const onChange = renderPicker()
    await user.click(screen.getByRole('button', { name: 'Toda la empresa' }))
    const called = onChange.mock.calls[0][0]
    expect(new Set(called)).toEqual(new Set(['director-1', 'jefe-1', 'coord-1', 'emp-1']))
  })

  it('el botón rápido reemplaza la selección previa (no hace merge)', async () => {
    const user = userEvent.setup()
    const onChange = renderPicker(['emp-1'])
    await user.click(screen.getByRole('button', { name: 'Solo directores' }))
    expect(onChange).toHaveBeenCalledWith(['director-1'])
  })

  it('si se presiona "Toda la empresa" y luego "Solo jefes", predomina el último botón', async () => {
    const user = userEvent.setup()
    const onChange = renderPicker()
    await user.click(screen.getByRole('button', { name: 'Toda la empresa' }))
    await user.click(screen.getByRole('button', { name: 'Solo jefes' }))
    expect(onChange).toHaveBeenLastCalledWith(['jefe-1'])
  })

  it('"Quitar a todos" vacía la selección', async () => {
    const user = userEvent.setup()
    const onChange = renderPicker(['director-1', 'jefe-1'])
    await user.click(screen.getByRole('button', { name: 'Quitar a todos' }))
    expect(onChange).toHaveBeenCalledWith([])
  })
})

describe('AttendeePicker — solo lista a los ya agregados', () => {
  it('sin selección, no muestra a ningún empleado (ni el buscador los revela sin escribir)', () => {
    renderPicker()
    expect(screen.getByText('Sin participantes agregados.')).toBeInTheDocument()
    expect(screen.queryByText('Ana Director')).not.toBeInTheDocument()
    expect(screen.queryByText('Beto Jefe')).not.toBeInTheDocument()
  })

  it('solo se listan los participantes ya agregados, no toda la plantilla', () => {
    renderPicker(['director-1'])
    expect(screen.getByText('Ana Director')).toBeInTheDocument()
    expect(screen.queryByText('Beto Jefe')).not.toBeInTheDocument()
    expect(screen.queryByText('Carla Coord')).not.toBeInTheDocument()
  })
})

describe('AttendeePicker — buscador para agregar', () => {
  it('no muestra sugerencias hasta que se escribe algo', () => {
    renderPicker()
    expect(screen.queryByText('Carla Coord')).not.toBeInTheDocument()
  })

  it('al escribir, sugiere a todos los que coinciden, incluidos los ya agregados', async () => {
    const user = userEvent.setup()
    renderPicker(['director-1'])
    await user.type(screen.getByPlaceholderText('Buscar empleado por nombre…'), 'a')
    const dropdown = within(screen.getByTestId('attendee-suggestions'))
    expect(dropdown.getByText('Carla Coord')).toBeInTheDocument()
    expect(dropdown.getByText('Dario Empleado')).toBeInTheDocument()
    // "Ana Director" ya está agregado → se muestra igual (con check verde, ver siguiente describe)
    expect(dropdown.getByText('Ana Director')).toBeInTheDocument()
  })

  it('click en una sugerencia no agregada la agrega', async () => {
    const user = userEvent.setup()
    const onChange = renderPicker([])
    const search = screen.getByPlaceholderText('Buscar empleado por nombre…')
    await user.type(search, 'Carla')
    await user.click(screen.getByRole('button', { name: /Carla Coord/ }))
    expect(onChange).toHaveBeenCalledWith(['coord-1'])
  })

  it('al seleccionar una sugerencia, el buscador se resetea', async () => {
    const user = userEvent.setup()
    renderPicker([])
    const search = screen.getByPlaceholderText('Buscar empleado por nombre…')
    await user.type(search, 'Carla')
    await user.click(screen.getByRole('button', { name: /Carla Coord/ }))
    expect(search.value).toBe('')
    // Al resetearse la búsqueda, el dropdown de sugerencias también se cierra
    expect(screen.queryByTestId('attendee-suggestions')).not.toBeInTheDocument()
  })

  it('muestra "Sin resultados" cuando la búsqueda no coincide con nadie', async () => {
    const user = userEvent.setup()
    renderPicker()
    await user.type(screen.getByPlaceholderText('Buscar empleado por nombre…'), 'zzz')
    expect(screen.getByText('Sin resultados')).toBeInTheDocument()
  })
})

describe('AttendeePicker — sugerencia de alguien ya agregado (check verde)', () => {
  it('a un empleado ya agregado se le muestra un check verde en las sugerencias', async () => {
    const user = userEvent.setup()
    renderPicker(['director-1'])
    await user.type(screen.getByPlaceholderText('Buscar empleado por nombre…'), 'Ana')
    const dropdown = within(screen.getByTestId('attendee-suggestions'))
    const row = dropdown.getByRole('button', { name: 'Ana Director' })
    expect(row).toHaveAttribute('title', 'Quitar a Ana Director')
    expect(within(row).getByTestId('already-added-check')).toBeInTheDocument()
  })

  it('a un empleado no agregado no se le muestra el check', async () => {
    const user = userEvent.setup()
    renderPicker(['director-1'])
    await user.type(screen.getByPlaceholderText('Buscar empleado por nombre…'), 'Carla')
    const dropdown = within(screen.getByTestId('attendee-suggestions'))
    const row = dropdown.getByRole('button', { name: 'Carla Coord' })
    expect(row).toHaveAttribute('title', 'Agregar a Carla Coord')
    expect(within(row).queryByTestId('already-added-check')).not.toBeInTheDocument()
  })

  it('click en una sugerencia ya agregada la quita (toggle)', async () => {
    const user = userEvent.setup()
    const onChange = renderPicker(['director-1', 'coord-1'])
    await user.type(screen.getByPlaceholderText('Buscar empleado por nombre…'), 'Ana')
    const dropdown = within(screen.getByTestId('attendee-suggestions'))
    await user.click(dropdown.getByRole('button', { name: 'Ana Director' }))
    expect(onChange).toHaveBeenCalledWith(['coord-1'])
  })
})

describe('AttendeePicker — quitar participantes agregados', () => {
  it('el botón "Quitar a <nombre>" remueve al participante de la selección', async () => {
    const user = userEvent.setup()
    const onChange = renderPicker(['director-1', 'coord-1'])
    await user.click(screen.getByRole('button', { name: 'Quitar a Ana Director' }))
    expect(onChange).toHaveBeenCalledWith(['coord-1'])
  })
})
