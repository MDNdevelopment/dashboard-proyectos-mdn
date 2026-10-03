import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { vi } from 'vitest'

const api = vi.hoisted(() => ({
  deletePauta: vi.fn(),
  restorePauta: vi.fn(),
  permanentlyDeletePauta: vi.fn(),
  upsertLote: vi.fn(),
  deleteLote: vi.fn(),
  updatePieza: vi.fn(),
}))
vi.mock('../components/pautas/avPautasApi', () => api)

import PautaDetail from '../components/pautas/PautaDetail'
import { pautaPermissions } from '../utils/audiovisual'

const users = new Map([
  ['u1', { user_id: 'u1', first_name: 'Ana', last_name: 'Pérez' }],
  ['liz', { user_id: 'liz', first_name: 'Lizdania', last_name: 'A' }],
])

function pauta(o = {}) {
  return {
    id: 'p1',
    client_id: 'c1',
    client_name: 'Smashack',
    line_id: 'l1',
    status: 'solicitada',
    lugar_tipo: 'estudio',
    place: '',
    pauta_date: '2026-10-10',
    salida: '13:00:00',
    llegada: null,
    formats: ['R'],
    recurso_ids: [],
    attendee_ids: [],
    created_by: 'u1',
    deleted_at: null,
    submitted: true,
    tema: 'Lanzamiento',
    piezas_totales: 0,
    piezas_editadas: 0,
    piezas_por_formato: {},
    grabacion_por_formato: {},
    reagendamientos: [],
    ...o,
  }
}

function setup(p, role = {}, props = {}) {
  const onFields = vi.fn().mockResolvedValue({ error: null })
  const onChanged = vi.fn()
  const onDeleted = vi.fn()
  const onEdit = vi.fn()
  const onClose = vi.fn()
  const perms = pautaPermissions({ ...role, pauta: p })
  render(
    <PautaDetail
      pauta={p}
      piezas={[]}
      pautas={[p]}
      lines={[{ id: 'l1', name: 'Georgina' }]}
      usersById={users}
      recursoUsers={[]}
      editorUsers={[]}
      allEmployees={[]}
      perms={perms}
      userId={role.userId ?? null}
      companyId="co"
      onFields={onFields}
      onChanged={onChanged}
      onDeleted={onDeleted}
      onPiezaChanged={vi.fn()}
      onPiezaDeleted={vi.fn()}
      onEdit={onEdit}
      onClose={onClose}
      {...props}
    />,
  )
  return { onFields, onChanged, onDeleted, onEdit, onClose }
}

const btn = (name) => screen.queryByRole('button', { name })

beforeEach(() => {
  Object.values(api).forEach((fn) => fn.mockReset())
})

describe('PautaDetail — cabecera y datos', () => {
  it('muestra cliente, línea, estado y los datos en grilla', () => {
    setup(pauta())
    expect(screen.getByRole('heading', { name: 'Smashack' })).toBeInTheDocument()
    expect(screen.getByText(/Georgina/)).toBeInTheDocument()
    expect(screen.getByText('Solicitada')).toBeInTheDocument()
    expect(screen.getByText('Estudio MDN')).toBeInTheDocument()
    expect(screen.getByText(/10 oct · 01:00 P\.M\./)).toBeInTheDocument()
    expect(screen.getByText('Ana Pérez')).toBeInTheDocument()
  })

  it('muestra el historial de reagendados', () => {
    setup(
      pauta({
        status: 'programada',
        reagendamientos: [
          {
            from_date: '2026-10-05',
            from_salida: '10:00:00',
            to_date: '2026-10-10',
            at: '2026-10-01T00:00:00Z',
            by: 'liz',
          },
        ],
      }),
    )
    expect(screen.getByLabelText('Historial de reagendados')).toHaveTextContent(
      'Reagendada desde 5 oct 10:00 A.M. · por Lizdania A',
    )
  })
})

describe('PautaDetail — acciones por estado y rol', () => {
  it('coordina sobre una solicitada: aprobar, declinar, editar, borrar', () => {
    const { onFields } = setup(pauta(), { canCoordinate: true, userId: 'liz' })
    expect(btn('Aprobar y agendar')).toBeInTheDocument()
    expect(btn('Declinar')).toBeInTheDocument()
    expect(btn('Editar')).toBeInTheDocument()
    expect(btn('Borrar')).toBeInTheDocument()
    expect(btn('Reagendar')).not.toBeInTheDocument()
    fireEvent.click(btn('Declinar'))
    expect(onFields).toHaveBeenCalledWith(expect.objectContaining({ id: 'p1' }), {
      status: 'declinada',
    })
  })

  it('coordina sobre una programada: reagendar y marcar realizada; abre el diálogo de reagendar', () => {
    const { onFields } = setup(pauta({ status: 'programada' }), { canCoordinate: true })
    expect(btn('Aprobar y agendar')).not.toBeInTheDocument()
    fireEvent.click(btn('Marcar realizada'))
    expect(onFields).toHaveBeenCalledWith(expect.anything(), { status: 'realizada' })
    fireEvent.click(btn('Reagendar'))
    expect(screen.getByRole('form', { name: 'Reagendar pauta' })).toBeInTheDocument()
  })

  it('aprobar abre el diálogo de agenda', () => {
    setup(pauta(), { canCoordinate: true })
    fireEvent.click(btn('Aprobar y agendar'))
    expect(screen.getByRole('form', { name: 'Aprobar y agendar' })).toBeInTheDocument()
  })

  it('la solicitante solo edita y borra su solicitud', () => {
    const { onEdit } = setup(pauta(), { canManage: true, userId: 'u1' })
    expect(btn('Aprobar y agendar')).not.toBeInTheDocument()
    expect(btn('Declinar')).not.toBeInTheDocument()
    fireEvent.click(btn('Editar'))
    expect(onEdit).toHaveBeenCalledWith(expect.objectContaining({ id: 'p1' }))
    expect(btn('Borrar')).toBeInTheDocument()
  })

  it('un lector no ve acciones ni secciones de trabajo editables', () => {
    setup(pauta({ status: 'realizada' }), { userId: 'x' })
    expect(screen.queryByLabelText('Acciones')).not.toBeInTheDocument()
    expect(screen.getByText('quién capturó cuántas piezas')).toBeInTheDocument()
    expect(screen.queryByText('+ agregar recurso')).not.toBeInTheDocument()
  })

  it('declinada: coordina puede volverla a solicitada', () => {
    const { onFields } = setup(pauta({ status: 'declinada' }), { canCoordinate: true })
    fireEvent.click(btn('Volver a solicitada'))
    expect(onFields).toHaveBeenCalledWith(expect.anything(), { status: 'solicitada' })
  })

  it('borrar manda a la papelera y propaga el cambio', async () => {
    api.deletePauta.mockResolvedValue({ data: { id: 'p1', deleted_at: 'x' }, error: null })
    const { onChanged } = setup(pauta(), { canCoordinate: true })
    fireEvent.click(btn('Borrar'))
    await waitFor(() => expect(onChanged).toHaveBeenCalledWith({ id: 'p1', deleted_at: 'x' }))
  })

  it('en papelera: restaurar y eliminar definitivamente con confirmación', async () => {
    api.restorePauta.mockResolvedValue({ data: { id: 'p1', deleted_at: null }, error: null })
    api.permanentlyDeletePauta.mockResolvedValue({ data: null, error: null })
    const { onChanged, onDeleted, onClose } = setup(pauta({ deleted_at: 'x' }), {
      canCoordinate: true,
    })
    expect(screen.getByText('En papelera')).toBeInTheDocument()
    expect(screen.queryByText('quién capturó cuántas piezas')).not.toBeInTheDocument()
    fireEvent.click(btn('Restaurar'))
    await waitFor(() => expect(onChanged).toHaveBeenCalled())
    fireEvent.click(btn('Eliminar definitivamente'))
    expect(screen.getByText(/no se puede deshacer/)).toBeInTheDocument()
    fireEvent.click(screen.getAllByRole('button', { name: /Eliminar/ }).at(-1))
    await waitFor(() => expect(onDeleted).toHaveBeenCalledWith('p1'))
    expect(onClose).toHaveBeenCalled()
  })

  it('muestra el error traducido cuando una acción falla', async () => {
    const onFields = vi.fn().mockResolvedValue({ error: { code: '42501', message: 'rls' } })
    setup(pauta({ status: 'programada' }), { canCoordinate: true }, { onFields })
    fireEvent.click(btn('Marcar realizada'))
    await screen.findByText(/No tienes permiso/)
  })
})
