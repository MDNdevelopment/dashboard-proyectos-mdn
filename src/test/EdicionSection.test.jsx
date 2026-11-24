import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { vi } from 'vitest'

const api = vi.hoisted(() => ({
  upsertLote: vi.fn(),
  deleteLote: vi.fn(),
  updatePieza: vi.fn(),
  loadVideosDeLote: vi.fn(),
  updateVideo: vi.fn(),
}))
vi.mock('../components/pautas/avPautasApi', () => api)
vi.mock('../supabase', () => {
  const channel = { on: vi.fn(() => channel), subscribe: vi.fn(() => channel) }
  return { supabase: { channel: vi.fn(() => channel), removeChannel: vi.fn() } }
})

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

// Lote z1: 6 asignadas, 4 listas → 4 listo + 1 espera de aprobación + 1 pendiente.
const VIDEOS = [
  ...[0, 1, 2, 3].map((i) => ({ id: `v${i}`, pieza_id: 'z1', status: 'listo', position: i })),
  { id: 'v4', pieza_id: 'z1', status: 'espera_aprobacion', position: 4 },
  { id: 'v5', pieza_id: 'z1', status: 'pendiente', position: 5 },
].map((v, i) => ({ nombre: null, ...v, position: i }))

const inc = (label) => screen.getByRole('button', { name: new RegExp(`Agregar ${label}`) })
const dec = (label) => screen.getByRole('button', { name: new RegExp(`Quitar ${label}`) })

beforeEach(() => {
  Object.values(api).forEach((fn) => fn.mockReset())
  api.upsertLote.mockResolvedValue({ data: { id: 'new' }, error: null })
  api.updatePieza.mockResolvedValue({ data: { id: 'z1' }, error: null })
  api.deleteLote.mockResolvedValue({ data: null, error: null })
  api.loadVideosDeLote.mockResolvedValue({ data: VIDEOS, error: null })
  api.updateVideo.mockResolvedValue({ data: { ...VIDEOS[5], status: 'listo' }, error: null })
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

  it('listas es de solo lectura: no hay stepper, lo deriva el trigger de los videos', () => {
    setup({ piezas: [lote({ cantidad: 4, listas: 4 })] })
    expect(
      screen.queryByRole('button', { name: /listas de Reel de Eva Ed/ }),
    ).not.toBeInTheDocument()
  })

  it('cada lote resume sus videos por estado y los despliega', async () => {
    setup()
    const toggle = screen.getByRole('button', { name: 'Ver videos de Reel de Eva Ed' })
    await waitFor(() =>
      expect(toggle).toHaveTextContent('4 listos · 1 en espera de aprobación · 1 pendiente'),
    )
    fireEvent.click(toggle)
    expect(screen.getByRole('list', { name: 'Videos de Reel de Eva Ed' }).children).toHaveLength(6)
  })

  it('cambiar el estado de un video escribe solo el video, nunca listas del lote', async () => {
    setup()
    fireEvent.click(await screen.findByRole('button', { name: 'Ver videos de Reel de Eva Ed' }))
    fireEvent.click(screen.getByText('Pendiente'))
    // El menú de StatusPill se monta en un portal al final del body: su opción es la última.
    fireEvent.click((await screen.findAllByRole('button', { name: 'Listo' })).at(-1))
    await waitFor(() => expect(api.updateVideo).toHaveBeenCalledWith('v5', { status: 'listo' }))
    expect(api.updatePieza).not.toHaveBeenCalled()
  })

  it('un editor mueve el estado de sus videos pero no las asignadas', async () => {
    setup({ canEdit: false, userId: 'e1' })
    expect(screen.queryByRole('button', { name: /Agregar asignadas/ })).not.toBeInTheDocument()
    fireEvent.click(await screen.findByRole('button', { name: 'Ver videos de Reel de Eva Ed' }))
    expect(screen.getByLabelText('Nombre del video 1')).toBeInTheDocument()
    expect(screen.queryByText('+ agregar editor')).not.toBeInTheDocument()
  })

  it('quien no es el editor ve los videos sin poder cambiarlos', async () => {
    setup({ canEdit: false, userId: 'otro' })
    fireEvent.click(await screen.findByRole('button', { name: 'Ver videos de Reel de Eva Ed' }))
    expect(screen.queryByLabelText('Nombre del video 1')).not.toBeInTheDocument()
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

  it('ya no hay modo solo lectura: la matriz editable se muestra aunque queden filas sueltas', () => {
    setup({
      piezas: [
        { id: 'a', es_lote: false, editor_user_id: 'e1', formato: 'R', status: 'listo' },
        lote(),
      ],
    })
    expect(screen.queryByText('registro anterior, solo lectura')).not.toBeInTheDocument()
    expect(screen.getByText('+ agregar editor')).toBeInTheDocument()
  })

  it('sin captura avisa que el cupo sale de lo capturado', () => {
    setup({ pauta: { ...pauta, piezas_por_formato: {} }, piezas: [] })
    expect(screen.getByText(/Registra primero la captura/)).toBeInTheDocument()
    expect(screen.getByText('Sin editores asignados.')).toBeInTheDocument()
  })
})

describe('EdicionSection — cancelar videos', () => {
  const abrir = async () =>
    fireEvent.click(await screen.findByRole('button', { name: 'Ver videos de Reel de Eva Ed' }))
  const opcionesDelMenu = async () => {
    fireEvent.click(screen.getByText('Pendiente'))
    return (await screen.findAllByRole('button')).map((b) => b.textContent)
  }

  it('quien edita la pauta puede cancelar un video', async () => {
    setup()
    await abrir()
    expect(await opcionesDelMenu()).toContain('Cancelado')
  })

  it('el editor no ofrece Cancelado: dejaría el lote sin poder completarse', async () => {
    setup({ canEdit: false, userId: 'e1' })
    await abrir()
    expect(await opcionesDelMenu()).not.toContain('Cancelado')
  })

  it('un video cancelado avisa que hay que bajar las asignadas', async () => {
    api.loadVideosDeLote.mockResolvedValue({
      data: VIDEOS.map((v, i) => (i === 5 ? { ...v, status: 'cancelado' } : v)),
      error: null,
    })
    setup()
    await abrir()
    expect(await screen.findByText(/baja las asignadas para quitarlo/)).toBeInTheDocument()
  })
})
