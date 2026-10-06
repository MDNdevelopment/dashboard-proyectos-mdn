import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { vi } from 'vitest'

const api = vi.hoisted(() => ({ upsertLote: vi.fn(), deleteLote: vi.fn(), updatePieza: vi.fn() }))
vi.mock('../components/pautas/avPautasApi', () => api)

import EdicionSection from '../components/pautas/EdicionSection'

const users = new Map([
  ['e1', { user_id: 'e1', first_name: 'Eva', last_name: 'Ed' }],
  ['e2', { user_id: 'e2', first_name: 'Leo', last_name: 'Cut' }],
])
const editores = [...users.values()]

const pauta = {
  id: 'p1',
  formats: ['V', 'R'],
  piezas_por_formato: { V: { salieron: 2, editadas: 0 }, R: { salieron: 10, editadas: 4 } },
}
const lote = (o) => ({
  id: 'z1',
  pauta_id: 'p1',
  editor_user_id: 'e1',
  formato: 'R',
  es_lote: true,
  cantidad: 6,
  listas: 4,
  status: 'en_edicion',
  ...o,
})

function setup(props = {}) {
  const onPiezaChanged = vi.fn()
  const onPiezaDeleted = vi.fn()
  render(
    <EdicionSection
      pauta={pauta}
      piezas={[lote()]}
      editorUsers={editores}
      usersById={users}
      canEdit
      userId="liz"
      companyId="co"
      onPiezaChanged={onPiezaChanged}
      onPiezaDeleted={onPiezaDeleted}
      {...props}
    />,
  )
  return { onPiezaChanged, onPiezaDeleted }
}

const inc = (label) => screen.getByRole('button', { name: new RegExp(`Agregar ${label}`) })
const dec = (label) => screen.getByRole('button', { name: new RegExp(`Quitar ${label}`) })

beforeEach(() => {
  Object.values(api).forEach((fn) => fn.mockReset())
  api.upsertLote.mockResolvedValue({ data: { id: 'new' }, error: null })
  api.updatePieza.mockResolvedValue({ data: { id: 'z1' }, error: null })
  api.deleteLote.mockResolvedValue({ data: null, error: null })
})

describe('EdicionSection', () => {
  it('cabecera por formato: salieron · asignadas · faltan', () => {
    setup()
    const table = screen.getByRole('table', { name: 'Edición por editor y formato' })
    expect(table).toHaveTextContent('salieron 10 · asignadas 6 · faltan 4')
    expect(table).toHaveTextContent('salieron 2 · asignadas 0 · faltan 2')
    expect(table).toHaveTextContent('Eva Ed')
  })

  it('el primer + de un formato sin lote inserta; después actualiza', async () => {
    const { onPiezaChanged } = setup()
    fireEvent.click(inc('asignadas de Video de marca a Eva Ed'))
    await waitFor(() => expect(api.upsertLote).toHaveBeenCalled())
    expect(api.upsertLote).toHaveBeenCalledWith(
      'co',
      'p1',
      'e1',
      'V',
      { cantidad: 1, listas: 0 },
      null,
    )
    expect(onPiezaChanged).toHaveBeenCalledWith({ id: 'new' })

    fireEvent.click(inc('asignadas de Reel a Eva Ed'))
    await waitFor(() => expect(api.updatePieza).toHaveBeenCalledWith('z1', { cantidad: 7 }))
  })

  it('el cupo limita asignadas: con faltan 0 no deja subir y avisa', async () => {
    setup({
      pauta: {
        ...pauta,
        piezas_por_formato: { V: { salieron: 0, editadas: 0 }, R: { salieron: 6, editadas: 4 } },
      },
    })
    expect(inc('asignadas de Reel a Eva Ed')).toBeDisabled()
    expect(api.updatePieza).not.toHaveBeenCalled()
  })

  it('bajar asignadas hasta 0 borra el lote; nunca por debajo de listas', async () => {
    const { onPiezaDeleted } = setup({ piezas: [lote({ cantidad: 1, listas: 0 })] })
    fireEvent.click(dec('asignadas de Reel a Eva Ed'))
    await waitFor(() => expect(api.deleteLote).toHaveBeenCalledWith('z1'))
    expect(onPiezaDeleted).toHaveBeenCalledWith('z1')
  })

  it('listas no supera asignadas', () => {
    setup({ piezas: [lote({ cantidad: 4, listas: 4 })] })
    expect(inc('listas de Reel de Eva Ed')).toBeDisabled()
  })

  it('un editor solo mueve sus propias listas', () => {
    setup({ canEdit: false, userId: 'e1' })
    expect(screen.queryByRole('button', { name: /Agregar asignadas/ })).not.toBeInTheDocument()
    expect(inc('listas de Reel de Eva Ed')).toBeInTheDocument()
    expect(screen.queryByText('+ agregar editor')).not.toBeInTheDocument()
  })

  it('agregar editor crea su primer lote en el formato con cupo', async () => {
    setup()
    fireEvent.click(screen.getByText('+ agregar editor'))
    fireEvent.change(screen.getByLabelText('Agregar editor'), { target: { value: 'e2' } })
    await waitFor(() => expect(api.upsertLote).toHaveBeenCalled())
    expect(api.upsertLote.mock.calls[0].slice(0, 4)).toEqual(['co', 'p1', 'e2', 'V'])
  })

  it('quitar editor bloqueado con entregas; permitido sin ellas', async () => {
    const { onPiezaDeleted } = setup({
      piezas: [lote(), lote({ id: 'z2', editor_user_id: 'e2', listas: 0, cantidad: 2 })],
    })
    expect(screen.getByRole('button', { name: 'Quitar a Eva Ed' })).toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: 'Quitar a Leo Cut' }))
    await waitFor(() => expect(api.deleteLote).toHaveBeenCalledWith('z2'))
    expect(onPiezaDeleted).toHaveBeenCalledWith('z2')
  })

  it('pauta vieja (filas sueltas) se muestra en solo lectura con resumen', () => {
    setup({
      piezas: [
        { id: 'a', es_lote: false, editor_user_id: 'e1', formato: 'R', status: 'listo' },
        { id: 'b', es_lote: false, editor_user_id: 'e1', formato: 'R', status: 'pendiente' },
      ],
    })
    expect(screen.getByText('registro anterior, solo lectura')).toBeInTheDocument()
    expect(screen.queryByText('+ agregar editor')).not.toBeInTheDocument()
    const row = screen.getByText('Eva Ed').closest('tr')
    expect(row).toHaveTextContent('Reel')
    expect(row).toHaveTextContent('2')
    expect(row).toHaveTextContent('1')
  })

  it('sin captura avisa que el cupo sale de lo capturado', () => {
    setup({ pauta: { ...pauta, piezas_por_formato: {} }, piezas: [] })
    expect(screen.getByText(/Registra primero la captura/)).toBeInTheDocument()
    expect(screen.getByText('Sin editores asignados.')).toBeInTheDocument()
  })
})
