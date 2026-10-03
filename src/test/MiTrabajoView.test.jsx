import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import { vi } from 'vitest'

const upsertLote = vi.fn()
const updatePieza = vi.fn()
vi.mock('../components/pautas/avPautasApi', () => ({
  upsertLote: (...a) => upsertLote(...a),
  updatePieza: (...a) => updatePieza(...a),
}))

import MiTrabajoView from '../components/pautas/MiTrabajoView'

// Hoy = miércoles 7 oct 2026.
const TODAY = new Date(2026, 9, 7)
const ME = 'r1'

const users = new Map([
  ['r1', { user_id: 'r1', first_name: 'Rafa', last_name: 'Cam' }],
  ['r2', { user_id: 'r2', first_name: 'Sol', last_name: 'Luz' }],
])

const pauta = (o = {}) => ({
  id: 'p',
  client_id: 'c',
  client_name: 'Cliente',
  tema: '',
  status: 'programada',
  lugar_tipo: 'locacion',
  place: 'Calle',
  pauta_date: '2026-10-07',
  salida: '09:00:00',
  llegada: null,
  formats: ['R'],
  recurso_ids: [ME],
  deleted_at: null,
  grabacion_por_formato: {},
  piezas_por_formato: {},
  ...o,
})

const PAUTAS = [
  pauta({ id: 'hoy', client_name: 'Smashack', formats: ['R', 'F'], recurso_ids: [ME, 'r2'] }),
  pauta({
    id: 'hoy-estudio',
    client_name: 'Fein Kaffee',
    lugar_tipo: 'estudio',
    place: '',
    salida: '13:00:00',
    formats: ['V'],
  }),
  pauta({ id: 'prox', client_name: 'Alpitech', pauta_date: '2026-10-09', recurso_ids: [ME, 'r2'] }),
  // Realizada el lunes, con 10 reels de los que yo tengo 4 listas de 6 asignadas.
  pauta({
    id: 'lun',
    client_name: 'Push',
    status: 'realizada',
    pauta_date: '2026-10-05',
    grabacion_por_formato: { R: { r1: 10 } },
    piezas_por_formato: { R: { salieron: 10, editadas: 4 } },
  }),
  // Pasada sin captura.
  pauta({ id: 'pasada', client_name: 'Olvidada', pauta_date: '2026-10-06' }),
  // No soy recurso: no aparece en Hoy, pero tiene cupo para tomar si tengo permiso.
  pauta({
    id: 'ajena',
    client_name: 'Ajena',
    recurso_ids: ['r2'],
    status: 'realizada',
    pauta_date: '2026-10-06',
    grabacion_por_formato: { R: { r2: 3 } },
    piezas_por_formato: { R: { salieron: 3, editadas: 0 } },
  }),
]
const PIEZAS = [
  {
    id: 'l1',
    pauta_id: 'lun',
    editor_user_id: ME,
    formato: 'R',
    es_lote: true,
    cantidad: 6,
    listas: 4,
  },
  {
    id: 'l2',
    pauta_id: 'lun',
    editor_user_id: 'r2',
    formato: 'R',
    es_lote: true,
    cantidad: 1,
    listas: 0,
  },
]
const byPauta = (list) => {
  const m = new Map()
  list.forEach((pz) => {
    if (!m.has(pz.pauta_id)) m.set(pz.pauta_id, [])
    m.get(pz.pauta_id).push(pz)
  })
  return m
}

function setup(props = {}) {
  const onFields = vi.fn().mockResolvedValue({ error: null })
  const onPiezaChanged = vi.fn()
  const onPautaClick = vi.fn()
  const permsFor = props.permsFor ?? (() => ({ canEditPiezas: true, canMarkRealizada: false }))
  const piezas = props.piezas ?? PIEZAS
  render(
    <MiTrabajoView
      pautas={PAUTAS}
      piezas={piezas}
      piezasByPauta={byPauta(piezas)}
      usersById={users}
      userId={ME}
      userName="Rafa"
      today={TODAY}
      companyId="co"
      onFields={onFields}
      onPiezaChanged={onPiezaChanged}
      onPautaClick={onPautaClick}
      {...props}
      permsFor={permsFor}
    />,
  )
  return { onFields, onPiezaChanged, onPautaClick }
}

const seccion = (name) => within(screen.getByRole('region', { name }))

beforeEach(() => {
  upsertLote.mockReset().mockResolvedValue({ data: { id: 'nuevo' }, error: null })
  updatePieza.mockReset().mockResolvedValue({ data: { id: 'l1', listas: 5 }, error: null })
})

describe('MiTrabajoView — cabecera y secciones', () => {
  it('resume la semana y separa hoy, pendiente de registrar, próximas y por editar', () => {
    setup()
    expect(screen.getByRole('heading', { name: 'Mi trabajo · Rafa' })).toBeInTheDocument()
    // Semana 5–10 oct: hoy(2) + prox + lun + pasada = 5 pautas; por editar 6−4 = 2.
    expect(screen.getByLabelText('Resumen de la semana')).toHaveTextContent(
      '5 pautas · 2 por editar',
    )

    const hoy = seccion('Hoy, miércoles 7')
    expect(hoy.getAllByRole('article').map((a) => a.getAttribute('aria-label'))).toEqual([
      'Pauta Smashack',
      'Pauta Fein Kaffee',
    ])
    expect(hoy.getByText(/con Sol/)).toBeInTheDocument()

    expect(
      seccion('Pendiente de registrar').getByRole('article', { name: 'Pauta Olvidada' }),
    ).toBeInTheDocument()
    expect(seccion('Próximas').getByRole('button', { name: 'Próxima Alpitech' })).toHaveTextContent(
      /9 oct.*Alpitech.*con Sol/,
    )
    const editar = seccion('Por editar (2)')
    expect(editar.getByText('Push')).toBeInTheDocument()
    expect(editar.getByLabelText('Cantidad de listas de Reel de Push')).toHaveTextContent('4')
    expect(editar.getByRole('button', { name: 'Ver pauta Push' })).toBeInTheDocument()
  })

  it('sin nada asignado muestra los vacíos', () => {
    setup({ pautas: [], piezas: [], piezasByPauta: new Map() })
    expect(screen.getByText('Nada para hoy.')).toBeInTheDocument()
    expect(screen.getByText('Sin pautas próximas.')).toBeInTheDocument()
    expect(screen.getByText(/No tienes piezas pendientes/)).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Pendiente de registrar' })).not.toBeInTheDocument()
  })
})

describe('MiTrabajoView — captura rápida', () => {
  it('+1 en un formato registra mi captura, deriva "salieron" y me mantiene como recurso', async () => {
    const { onFields } = setup()
    const card = seccion('Hoy, miércoles 7').getByRole('article', { name: 'Pauta Smashack' })
    fireEvent.click(within(card).getByRole('button', { name: 'Agregar grabadas de Reel' }))
    await waitFor(() => expect(onFields).toHaveBeenCalled())
    const [p, fields] = onFields.mock.calls[0]
    expect(p.id).toBe('hoy')
    expect(fields.grabacion_por_formato).toEqual({ R: { r1: 1 }, F: {} })
    expect(fields.piezas_por_formato).toEqual({
      R: { salieron: 1, editadas: 0 },
      F: { salieron: 0, editadas: 0 },
    })
    expect(fields.recurso_ids).toBeUndefined() // ya estaba
  })

  it('las fotos se llaman "capturadas" y el −1 no baja de cero', () => {
    setup()
    const card = seccion('Hoy, miércoles 7').getByRole('article', { name: 'Pauta Smashack' })
    expect(
      within(card).getByRole('button', { name: 'Agregar capturadas de Foto' }),
    ).toBeInTheDocument()
    expect(within(card).getByRole('button', { name: 'Quitar capturadas de Foto' })).toBeDisabled()
  })

  it('sin permiso de piezas, solo muestra el número', () => {
    setup({ permsFor: () => ({ canEditPiezas: false, canMarkRealizada: false }) })
    const card = seccion('Hoy, miércoles 7').getByRole('article', { name: 'Pauta Smashack' })
    expect(within(card).queryByRole('button', { name: /Agregar/ })).not.toBeInTheDocument()
  })

  it('"Marcar realizada" aparece solo para quien puede, en pautas programadas', async () => {
    const { onFields } = setup({
      permsFor: (p) => ({ canEditPiezas: true, canMarkRealizada: p.status === 'programada' }),
    })
    const card = seccion('Hoy, miércoles 7').getByRole('article', { name: 'Pauta Smashack' })
    fireEvent.click(within(card).getByRole('button', { name: /Marcar realizada/ }))
    await waitFor(() =>
      expect(onFields).toHaveBeenCalledWith(expect.objectContaining({ id: 'hoy' }), {
        status: 'realizada',
      }),
    )
  })

  it('si el guardado falla, la tarjeta muestra el error', async () => {
    setup({ onFields: vi.fn().mockResolvedValue({ error: { message: 'boom' } }) })
    const card = seccion('Hoy, miércoles 7').getByRole('article', { name: 'Pauta Smashack' })
    fireEvent.click(within(card).getByRole('button', { name: 'Agregar grabadas de Reel' }))
    expect(await within(card).findByRole('alert')).toBeInTheDocument()
  })

  it('"ver pauta" abre el detalle', () => {
    const { onPautaClick } = setup()
    const card = seccion('Hoy, miércoles 7').getByRole('article', { name: 'Pauta Smashack' })
    fireEvent.click(within(card).getByRole('button', { name: 'ver pauta' }))
    expect(onPautaClick).toHaveBeenCalledWith(expect.objectContaining({ id: 'hoy' }))
  })
})

describe('MiTrabajoView — edición rápida', () => {
  it('+1 sube "listas" del lote propio y avisa al padre', async () => {
    const { onPiezaChanged } = setup()
    fireEvent.click(screen.getByRole('button', { name: 'Agregar listas de Reel de Push' }))
    await waitFor(() => expect(updatePieza).toHaveBeenCalledWith('l1', { listas: 5 }))
    expect(onPiezaChanged).toHaveBeenCalledWith({ id: 'l1', listas: 5 })
  })

  it('"todo listo" pone listas = asignadas', async () => {
    setup()
    fireEvent.click(screen.getByRole('button', { name: '✓ todo listo' }))
    await waitFor(() => expect(updatePieza).toHaveBeenCalledWith('l1', { listas: 6 }))
  })

  it('no ofrece lotes de otros editores', () => {
    setup()
    expect(screen.getAllByRole('button', { name: /^Agregar listas/ })).toHaveLength(1)
  })
})

describe('MiTrabajoView — tomar cupo', () => {
  it('lista los formatos con cupo donde puedo editar piezas y crea el lote al tomar', async () => {
    const { onPiezaChanged } = setup()
    const region = seccion('Disponible para tomar')
    // Push tiene cupo (10 − 7) pero ya tengo un lote ahí sin terminar → vive en "Por editar".
    // Ajena: 3 salieron, 0 asignadas → faltan 3.
    expect(region.queryByText('Push')).not.toBeInTheDocument()
    expect(region.getByText('Ajena')).toBeInTheDocument()
    const input = region.getByLabelText('Cuántas tomar de Reel de Ajena')
    expect(input).toHaveValue(3)
    fireEvent.change(input, { target: { value: '2' } })
    fireEvent.click(region.getByRole('button', { name: 'Tomar 2' }))
    await waitFor(() =>
      expect(upsertLote).toHaveBeenCalledWith(
        'co',
        'ajena',
        ME,
        'R',
        { cantidad: 2, listas: 0 },
        null,
      ),
    )
    expect(onPiezaChanged).toHaveBeenCalledWith({ id: 'nuevo' })
  })

  it('no deja tomar más que el cupo', () => {
    setup()
    const region = seccion('Disponible para tomar')
    const input = region.getByLabelText('Cuántas tomar de Reel de Ajena')
    fireEvent.change(input, { target: { value: '99' } })
    expect(region.getByRole('button', { name: 'Tomar 3' })).toBeInTheDocument()
  })

  it('si no puedo editar piezas de la pauta, no aparece para tomar', () => {
    setup({ permsFor: (p) => ({ canEditPiezas: p.id !== 'ajena', canMarkRealizada: false }) })
    expect(screen.queryByRole('region', { name: 'Disponible para tomar' })).not.toBeInTheDocument()
  })
})
