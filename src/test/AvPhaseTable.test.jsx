/**
 * Tests de AvPhaseTable — flujo de "Solicitar pauta" como borrador 100% local (rol jefe).
 * La fila nueva no debe tocar la base de datos hasta el guardado final; "Cancelar" descarta
 * sin llamar a la API; el rol coordinadora ("+ Agregar pauta") sigue creando de inmediato,
 * sin cambios (regresión).
 */
import { useState } from 'react'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { vi } from 'vitest'

const mockCreatePauta = vi.fn()
const mockUpdatePauta = vi.fn()
const mockDeletePauta = vi.fn()
const mockRestorePauta = vi.fn()
const mockPermanentlyDeletePauta = vi.fn()
const mockFetchPautasByDate = vi.fn()

vi.mock('../components/pautas/avPautasApi', () => ({
  createPauta: (...a) => mockCreatePauta(...a),
  updatePauta: (...a) => mockUpdatePauta(...a),
  deletePauta: (...a) => mockDeletePauta(...a),
  restorePauta: (...a) => mockRestorePauta(...a),
  permanentlyDeletePauta: (...a) => mockPermanentlyDeletePauta(...a),
  fetchPautasByDate: (...a) => mockFetchPautasByDate(...a),
}))

import AvPhaseTable from '../components/pautas/AvPhaseTable'

const CLIENTS = [{ id: 'c1', name: 'Cliente A' }]
const EMPLOYEES = [
  { user_id: 'req-1', first_name: 'Georgina', last_name: 'Ríos', deleted_at: null },
]

// AvPhaseTable ya no gestiona `phase` internamente (se levantó a AudiovisualView para que
// los SummaryCard puedan controlarlo). Este wrapper simula ese controlador para los tests.
function TableWrapper({ initialPhase = 'solicitudes', ...props }) {
  const [phase, setPhase] = useState(initialPhase)
  return (
    <AvPhaseTable
      pautas={[]}
      clients={CLIENTS}
      audiovisualUsers={[]}
      allEmployees={[]}
      companyId="co-1"
      userId="u1"
      defaultLineId="line-1"
      editMode="solicita"
      onChanged={vi.fn()}
      onDeleted={vi.fn()}
      phase={phase}
      onPhaseChange={setPhase}
      // Coincide con las fechas usadas en los tests (2026-09-04): así, salvo que un test
      // pase viewYear/viewMonth explícitos, las pautas no aparecen "fuera de mes".
      viewYear={2026}
      viewMonth={9}
      onGoToMonth={vi.fn()}
      {...props}
    />
  )
}

function renderTable(props = {}) {
  return render(<TableWrapper {...props} />)
}

describe('AvPhaseTable — borrador local de "Solicitar pauta" (rol solicita)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('"+ Solicitar pauta" agrega una fila local sin llamar a la API', () => {
    renderTable()
    fireEvent.click(screen.getByText('+ Solicitar pauta'))
    expect(screen.getByText('Sin guardar')).toBeInTheDocument()
    expect(mockCreatePauta).not.toHaveBeenCalled()
  })

  it('"Guardar solicitud" está deshabilitado hasta completar cliente + enlace/piezas, y recién ahí llama a la API', async () => {
    renderTable()
    fireEvent.click(screen.getByText('+ Solicitar pauta'))

    const saveBtn = screen.getByText('Guardar solicitud')
    expect(saveBtn).toBeDisabled()
    expect(mockCreatePauta).not.toHaveBeenCalled()

    // Llenar cliente
    const selects = document.querySelectorAll('select')
    fireEvent.change(selects[0], { target: { value: 'c1' } })
    expect(mockCreatePauta).not.toHaveBeenCalled()
    expect(screen.getByText('Guardar solicitud')).toBeDisabled()

    // Llenar el enlace de la grilla (brief completo)
    mockCreatePauta.mockResolvedValue({ data: { id: 'p1', status: 'solicitada' }, error: null })
    const linkInput = screen.getByPlaceholderText('Enlace de la grilla (Drive)')
    fireEvent.change(linkInput, { target: { value: 'https://drive.google.com/x' } })

    await waitFor(() => expect(screen.getByText('Guardar solicitud')).not.toBeDisabled())
    fireEvent.click(screen.getByText('Guardar solicitud'))

    await waitFor(() => expect(mockCreatePauta).toHaveBeenCalledTimes(1))
    expect(mockCreatePauta).toHaveBeenCalledWith(
      'co-1',
      expect.objectContaining({
        client_id: 'c1',
        link: 'https://drive.google.com/x',
        status: 'solicitada',
        submitted: true,
      }),
      'u1',
      'line-1',
    )
    // El borrador no debe tener el campo interno _draftId en el payload enviado
    const sentFields = mockCreatePauta.mock.calls[0][1]
    expect(sentFields._draftId).toBeUndefined()
  })

  it('"Cancelar" descarta el borrador sin llamar a la API', () => {
    renderTable()
    fireEvent.click(screen.getByText('+ Solicitar pauta'))
    expect(screen.getByText('Sin guardar')).toBeInTheDocument()

    fireEvent.click(screen.getByText('Cancelar'))
    expect(screen.queryByText('Sin guardar')).not.toBeInTheDocument()
    expect(mockCreatePauta).not.toHaveBeenCalled()
  })

  it('rol coordinadora: el brief de una pauta recién creada (submitted:true) es editable, no queda en blanco', async () => {
    mockUpdatePauta.mockResolvedValue({ data: { id: 'p1', client_id: 'c1' }, error: null })
    const pauta = {
      id: 'p1',
      client_id: null,
      client_name: null,
      tema: '',
      status: 'solicitada',
      submitted: true,
      formats: [],
    }
    renderTable({ editMode: 'coordina', pautas: [pauta] })

    const clientSelect = document.querySelector('select')
    expect(clientSelect).not.toBeNull()
    fireEvent.change(clientSelect, { target: { value: 'c1' } })

    await waitFor(() => expect(mockUpdatePauta).toHaveBeenCalledWith('p1', { client_id: 'c1' }))
  })

  it('muestra quién solicitó la pauta (Solicitudes) resuelto desde allEmployees', () => {
    const pauta = {
      id: 'p1',
      client_id: 'c1',
      client_name: 'Cliente A',
      created_by: 'req-1',
      status: 'solicitada',
      submitted: true,
      formats: [],
    }
    renderTable({ editMode: 'coordina', pautas: [pauta], allEmployees: EMPLOYEES })
    expect(screen.getByText('Georgina Ríos')).toBeInTheDocument()
  })

  it('rol coordinadora: "+ Agregar pauta" sigue creando de inmediato en la base de datos (sin cambios)', async () => {
    mockCreatePauta.mockResolvedValue({ data: { id: 'p1', status: 'solicitada' }, error: null })
    renderTable({ editMode: 'coordina' })

    expect(screen.getByText('+ Agregar pauta')).toBeInTheDocument()
    fireEvent.click(screen.getByText('+ Agregar pauta'))

    await waitFor(() => expect(mockCreatePauta).toHaveBeenCalledTimes(1))
    expect(mockCreatePauta).toHaveBeenCalledWith(
      'co-1',
      { status: 'solicitada', submitted: true },
      'u1',
      'line-1',
    )
    expect(screen.queryByText('Sin guardar')).not.toBeInTheDocument()
  })
})

describe('AvPhaseTable — Agenda: "Recursos" (selección múltiple, reemplaza a "Graba")', () => {
  const AV_USERS = [
    { user_id: 'r1', first_name: 'Nadia', last_name: 'Torres', deleted_at: null },
    { user_id: 'r2', first_name: 'Pablo', last_name: 'Ríos', deleted_at: null },
  ]

  beforeEach(() => {
    vi.clearAllMocks()
    mockFetchPautasByDate.mockResolvedValue({ data: [], error: null })
  })

  it('el encabezado dice "Recursos" y no "Graba"', () => {
    renderTable({ initialPhase: 'agenda', editMode: 'coordina', audiovisualUsers: AV_USERS })
    expect(screen.getByText('Recursos')).toBeInTheDocument()
    expect(screen.queryByText(/Graba/)).not.toBeInTheDocument()
  })

  it('permite elegir varios recursos y persiste recurso_ids', async () => {
    mockUpdatePauta.mockResolvedValue({ data: { id: 'p1' }, error: null })
    const pauta = {
      id: 'p1',
      client_name: 'Cliente A',
      status: 'programada',
      formats: [],
      recurso_ids: [],
    }
    renderTable({
      initialPhase: 'agenda',
      editMode: 'coordina',
      audiovisualUsers: AV_USERS,
      pautas: [pauta],
    })

    // El botón "Seleccionar…" de Recursos es el primero de la fila (antes que Asistentes).
    fireEvent.click(screen.getAllByText('Seleccionar…')[0])
    const search = screen.getByPlaceholderText('Buscar empleado por nombre…')
    fireEvent.change(search, { target: { value: 'Nadia' } })
    fireEvent.click(screen.getByRole('button', { name: /Nadia Torres/ }))

    await waitFor(() => expect(mockUpdatePauta).toHaveBeenCalledWith('p1', { recurso_ids: ['r1'] }))
  })

  it('el picker de Recursos no tiene selección rápida por cargo (solo Audiovisual, búsqueda manual)', async () => {
    const pauta = {
      id: 'p1',
      client_name: 'Cliente A',
      status: 'programada',
      formats: [],
      recurso_ids: [],
    }
    renderTable({
      initialPhase: 'agenda',
      editMode: 'coordina',
      audiovisualUsers: AV_USERS,
      pautas: [pauta],
    })

    fireEvent.click(screen.getAllByText('Seleccionar…')[0])
    expect(screen.queryByText('Preseleccionar por cargo')).not.toBeInTheDocument()
  })

  it('abrir Asistentes cierra el buscador de Recursos, y viceversa (no quedan los dos abiertos a la vez)', () => {
    const pauta = {
      id: 'p1',
      client_name: 'Cliente A',
      status: 'programada',
      formats: [],
      recurso_ids: [],
      attendee_ids: [],
    }
    renderTable({
      initialPhase: 'agenda',
      editMode: 'coordina',
      audiovisualUsers: AV_USERS,
      pautas: [pauta],
    })

    // Abrir Recursos (primer botón "Seleccionar…" de la fila)
    fireEvent.click(screen.getAllByText('Seleccionar…')[0])
    expect(screen.getByText('Recursos (quién graba fotos/video)')).toBeInTheDocument()

    // Abrir Asistentes (segundo botón "Seleccionar…" de la fila — el de Recursos sigue
    // siendo un botón normal, solo se agregó una fila expandida debajo con su picker)
    fireEvent.click(screen.getAllByText('Seleccionar…')[1])
    expect(screen.queryByText('Recursos (quién graba fotos/video)')).not.toBeInTheDocument()
    expect(screen.getByText('Buscar por nombre')).toBeInTheDocument()
  })
})

describe('AvPhaseTable — disponibilidad de recursos al asignar (Agenda)', () => {
  const AV_USERS = [{ user_id: 'r1', first_name: 'Nadia', last_name: 'Torres', deleted_at: null }]
  const RESOURCE_USERS_BY_ID = new Map(AV_USERS.map((u) => [u.user_id, u]))

  beforeEach(() => {
    vi.clearAllMocks()
  })

  function selectNadia() {
    fireEvent.click(screen.getAllByText('Seleccionar…')[0])
    const search = screen.getByPlaceholderText('Buscar empleado por nombre…')
    fireEvent.change(search, { target: { value: 'Nadia' } })
    fireEvent.click(screen.getByRole('button', { name: /Nadia Torres/ }))
  }

  it('sin conflicto: consulta el día y guarda normalmente', async () => {
    mockFetchPautasByDate.mockResolvedValue({ data: [], error: null })
    mockUpdatePauta.mockResolvedValue({ data: { id: 'p1' }, error: null })
    const pauta = {
      id: 'p1',
      client_name: 'Cliente A',
      status: 'programada',
      formats: [],
      recurso_ids: [],
      pauta_date: '2026-09-04',
      salida: '09:00',
      llegada: '11:00',
    }
    renderTable({
      initialPhase: 'agenda',
      editMode: 'coordina',
      audiovisualUsers: AV_USERS,
      resourceUsersById: RESOURCE_USERS_BY_ID,
      pautas: [pauta],
    })

    selectNadia()

    await waitFor(() => expect(mockUpdatePauta).toHaveBeenCalledWith('p1', { recurso_ids: ['r1'] }))
  })

  it('solapamiento: bloquea el guardado y muestra el conflicto', async () => {
    mockFetchPautasByDate.mockResolvedValue({
      data: [
        {
          id: 'p2',
          client_name: 'Cliente B',
          salida: '10:00',
          llegada: '12:00',
          recurso_ids: ['r1'],
          status: 'programada',
        },
      ],
      error: null,
    })
    const pauta = {
      id: 'p1',
      client_name: 'Cliente A',
      status: 'programada',
      formats: [],
      recurso_ids: [],
      pauta_date: '2026-09-04',
      salida: '09:00',
      llegada: '11:00',
    }
    renderTable({
      initialPhase: 'agenda',
      editMode: 'coordina',
      audiovisualUsers: AV_USERS,
      resourceUsersById: RESOURCE_USERS_BY_ID,
      pautas: [pauta],
    })

    selectNadia()

    // El aviso debe vivir DENTRO del panel de Recursos desplegado, no en el banner de la
    // cabecera del card: la tabla es larga y ese banner queda fuera de pantalla cuando se
    // está editando una fila de abajo — el usuario no ve nada y parece que el click no hizo
    // nada. Por eso se ancla al panel y se verifica la contención, no solo su presencia.
    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent(/Cliente B/)
    expect(alert).toHaveTextContent(/Nadia Torres/)

    const panel = screen.getByText('Recursos (quién graba fotos/video)').closest('td')
    expect(panel).toContainElement(alert)

    expect(mockUpdatePauta).not.toHaveBeenCalled()
  })

  it('el conflicto desaparece al cerrar y reabrir el selector de Recursos', async () => {
    mockFetchPautasByDate.mockResolvedValue({
      data: [
        {
          id: 'p2',
          client_name: 'Cliente B',
          salida: '10:00',
          llegada: '12:00',
          recurso_ids: ['r1'],
          status: 'programada',
        },
      ],
      error: null,
    })
    const pauta = {
      id: 'p1',
      client_name: 'Cliente A',
      status: 'programada',
      formats: [],
      recurso_ids: [],
      pauta_date: '2026-09-04',
      salida: '09:00',
      llegada: '11:00',
    }
    renderTable({
      initialPhase: 'agenda',
      editMode: 'coordina',
      audiovisualUsers: AV_USERS,
      resourceUsersById: RESOURCE_USERS_BY_ID,
      pautas: [pauta],
    })

    selectNadia()
    await screen.findByRole('alert')

    fireEvent.click(screen.getByLabelText('Cerrar selector de recursos'))
    fireEvent.click(screen.getAllByText('Seleccionar…')[0])

    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('pauta previa sin hora de cierre: pide confirmar (no bloquea) si cae en la ventana asumida', async () => {
    // Gisely ya tiene una pauta a la 1 pm sin hora de cierre; se le quiere asignar otra a
    // las 3 pm. El choque solo existe asumiendo 3 h, así que se pregunta en vez de bloquear.
    mockFetchPautasByDate.mockResolvedValue({
      data: [
        {
          id: 'p2',
          client_name: 'Cliente B',
          salida: '13:00:00',
          llegada: null,
          recurso_ids: ['r1'],
          status: 'programada',
        },
      ],
      error: null,
    })
    mockUpdatePauta.mockResolvedValue({ data: { id: 'p1' }, error: null })
    const pauta = {
      id: 'p1',
      client_name: 'Cliente A',
      status: 'programada',
      formats: [],
      recurso_ids: [],
      pauta_date: '2026-09-04',
      salida: '15:00:00',
      llegada: null,
    }
    renderTable({
      initialPhase: 'agenda',
      editMode: 'coordina',
      audiovisualUsers: AV_USERS,
      resourceUsersById: RESOURCE_USERS_BY_ID,
      pautas: [pauta],
    })

    selectNadia()

    await waitFor(() =>
      expect(screen.getByRole('button', { name: /Asignar igual/ })).toBeInTheDocument(),
    )
    expect(screen.getByText(/sin hora de cierre/)).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument() // no se bloqueó
    expect(mockUpdatePauta).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: /Asignar igual/ }))

    await waitFor(() => expect(mockUpdatePauta).toHaveBeenCalledWith('p1', { recurso_ids: ['r1'] }))
  })

  it('sobrecarga (3ª pauta del día): pide confirmar antes de guardar', async () => {
    mockFetchPautasByDate.mockResolvedValue({
      data: [
        {
          id: 'p2',
          client_name: 'B',
          salida: null,
          llegada: null,
          recurso_ids: ['r1'],
          status: 'programada',
        },
        {
          id: 'p3',
          client_name: 'C',
          salida: null,
          llegada: null,
          recurso_ids: ['r1'],
          status: 'programada',
        },
      ],
      error: null,
    })
    mockUpdatePauta.mockResolvedValue({ data: { id: 'p1' }, error: null })
    const pauta = {
      id: 'p1',
      client_name: 'Cliente A',
      status: 'programada',
      formats: [],
      recurso_ids: [],
      pauta_date: '2026-09-04',
      salida: null,
      llegada: null,
    }
    renderTable({
      initialPhase: 'agenda',
      editMode: 'coordina',
      audiovisualUsers: AV_USERS,
      resourceUsersById: RESOURCE_USERS_BY_ID,
      pautas: [pauta],
    })

    selectNadia()

    await waitFor(() =>
      expect(screen.getByRole('button', { name: /Asignar igual/ })).toBeInTheDocument(),
    )
    expect(mockUpdatePauta).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: /Asignar igual/ }))

    await waitFor(() => expect(mockUpdatePauta).toHaveBeenCalledWith('p1', { recurso_ids: ['r1'] }))
  })
})

describe('AvPhaseTable — Realizadas: columna única "Piezas" + fila clickeable', () => {
  const PAUTA_REALIZADA = {
    id: 'p1',
    client_name: 'Cliente A',
    status: 'realizada',
    formats: [],
    recurso_ids: [],
    attendee_ids: [],
    piezas_totales: 4,
    piezas_editadas: 0,
  }

  it('ya no muestra "✂️ Edita" ni "Piezas (tot / edit)" — solo la columna "Piezas" con progreso', () => {
    renderTable({ initialPhase: 'realizadas', editMode: 'coordina', pautas: [PAUTA_REALIZADA] })
    expect(screen.queryByText('✂️ Edita')).not.toBeInTheDocument()
    expect(screen.queryByText('Piezas (tot / edit)')).not.toBeInTheDocument()
    expect(screen.getByText('Piezas')).toBeInTheDocument()
  })

  it('con piezas cargadas, muestra el progreso listas/total de esa pauta', () => {
    const piezas = [
      { id: 'pz1', pauta_id: 'p1', status: 'listo' },
      { id: 'pz2', pauta_id: 'p1', status: 'pendiente' },
    ]
    renderTable({
      initialPhase: 'realizadas',
      editMode: 'coordina',
      pautas: [PAUTA_REALIZADA],
      piezas,
    })
    expect(screen.getByText('1/2')).toBeInTheDocument()
  })

  it('sin piezas cargadas todavía, cae al total manual de la pauta ("0/N")', () => {
    renderTable({ initialPhase: 'realizadas', editMode: 'coordina', pautas: [PAUTA_REALIZADA] })
    expect(screen.getByText('0/4')).toBeInTheDocument()
  })

  it('click en la fila llama a onPautaClick con la pauta', () => {
    const onPautaClick = vi.fn()
    renderTable({
      initialPhase: 'realizadas',
      editMode: 'coordina',
      pautas: [PAUTA_REALIZADA],
      onPautaClick,
    })
    fireEvent.click(screen.getByText('Cliente A'))
    expect(onPautaClick).toHaveBeenCalledWith(PAUTA_REALIZADA)
  })

  it('columna "Recursos" combina quién graba (recurso_ids) y quién edita (piezas.editor_user_id)', () => {
    const pauta = {
      ...PAUTA_REALIZADA,
      recurso_ids: ['rec-1'],
    }
    const piezas = [{ id: 'pz1', pauta_id: 'p1', status: 'pendiente', editor_user_id: 'edit-1' }]
    const audiovisualUsers = [{ user_id: 'rec-1', first_name: 'Rosa', last_name: 'Grabadora' }]
    const editorUsers = [{ user_id: 'edit-1', first_name: 'Erick', last_name: 'Editor' }]
    renderTable({
      initialPhase: 'realizadas',
      editMode: 'coordina',
      pautas: [pauta],
      piezas,
      audiovisualUsers,
      editorUsers,
    })
    expect(screen.getByText('Rosa Grabadora, Erick Editor')).toBeInTheDocument()
  })
})

describe('AvPhaseTable — Papelera (soft delete + restaurar)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  const PAUTA_ACTIVA = {
    id: 'p1',
    client_name: 'Cliente A',
    status: 'realizada',
    formats: [],
    recurso_ids: [],
    attendee_ids: [],
    piezas_totales: 0,
    piezas_editadas: 0,
    deleted_at: null,
  }

  const PAUTA_BORRADA = {
    id: 'p2',
    client_name: 'Cliente B',
    status: 'programada',
    formats: [],
    recurso_ids: [],
    attendee_ids: [],
    deleted_at: '2026-08-20T12:00:00.000Z',
  }

  it('una pauta con deleted_at no aparece en su fase original (Agenda) sino en Papelera', () => {
    renderTable({
      initialPhase: 'agenda',
      editMode: 'coordina',
      pautas: [PAUTA_BORRADA],
    })
    expect(screen.getByText('Nada agendado en este alcance.')).toBeInTheDocument()

    fireEvent.click(screen.getByText(/Papelera/))
    expect(screen.getByText('Cliente B')).toBeInTheDocument()
  })

  it('la pestaña Papelera muestra el conteo de pautas borradas', () => {
    renderTable({
      initialPhase: 'realizadas',
      editMode: 'coordina',
      pautas: [PAUTA_ACTIVA, PAUTA_BORRADA],
    })
    const tab = screen.getByText('Papelera').closest('button')
    expect(tab).toHaveTextContent('1')
  })

  it('"Borrar" (doble clic) llama a deletePauta y propaga el resultado por onChanged, no onDeleted', async () => {
    const softDeleted = { ...PAUTA_ACTIVA, deleted_at: '2026-08-20T12:00:00.000Z' }
    mockDeletePauta.mockResolvedValue({ data: softDeleted, error: null })
    const onChanged = vi.fn()
    renderTable({
      initialPhase: 'realizadas',
      editMode: 'coordina',
      pautas: [PAUTA_ACTIVA],
      onChanged,
    })
    fireEvent.click(screen.getByTitle('Borrar pauta'))
    fireEvent.click(screen.getByText('Borrar'))
    await waitFor(() => expect(mockDeletePauta).toHaveBeenCalledWith('p1'))
    await waitFor(() => expect(onChanged).toHaveBeenCalledWith(softDeleted))
  })

  it('"Restaurar" en Papelera llama a restorePauta y propaga el resultado por onChanged', async () => {
    const restored = { ...PAUTA_BORRADA, deleted_at: null }
    mockRestorePauta.mockResolvedValue({ data: restored, error: null })
    const onChanged = vi.fn()
    renderTable({
      initialPhase: 'papelera',
      editMode: 'coordina',
      pautas: [PAUTA_BORRADA],
      onChanged,
    })
    fireEvent.click(screen.getByText('Restaurar'))
    await waitFor(() => expect(mockRestorePauta).toHaveBeenCalledWith('p2'))
    await waitFor(() => expect(onChanged).toHaveBeenCalledWith(restored))
  })

  it('papelera vacía muestra el mensaje correspondiente', () => {
    renderTable({ initialPhase: 'papelera', editMode: 'coordina', pautas: [PAUTA_ACTIVA] })
    expect(screen.getByText('La papelera está vacía.')).toBeInTheDocument()
  })

  it('"Eliminar definitivamente" abre el diálogo de confirmación sin llamar a la API todavía', () => {
    renderTable({ initialPhase: 'papelera', editMode: 'coordina', pautas: [PAUTA_BORRADA] })
    fireEvent.click(screen.getByText('Eliminar definitivamente'))
    expect(screen.getByText('Eliminar pauta')).toBeInTheDocument()
    expect(mockPermanentlyDeletePauta).not.toHaveBeenCalled()
  })

  it('el botón "Eliminar" del diálogo queda deshabilitado hasta teclear el nombre exacto del cliente', () => {
    renderTable({ initialPhase: 'papelera', editMode: 'coordina', pautas: [PAUTA_BORRADA] })
    fireEvent.click(screen.getByText('Eliminar definitivamente'))
    const confirmBtn = screen.getByRole('button', { name: 'Eliminar' })
    expect(confirmBtn).toBeDisabled()
    fireEvent.change(screen.getByPlaceholderText('Cliente B'), { target: { value: 'Cliente B' } })
    expect(confirmBtn).not.toBeDisabled()
  })

  it('confirmar el diálogo llama a permanentlyDeletePauta y propaga por onDeleted (no onChanged)', async () => {
    mockPermanentlyDeletePauta.mockResolvedValue({ error: null })
    const onDeleted = vi.fn()
    const onChanged = vi.fn()
    renderTable({
      initialPhase: 'papelera',
      editMode: 'coordina',
      pautas: [PAUTA_BORRADA],
      onDeleted,
      onChanged,
    })
    fireEvent.click(screen.getByText('Eliminar definitivamente'))
    fireEvent.change(screen.getByPlaceholderText('Cliente B'), { target: { value: 'Cliente B' } })
    fireEvent.click(screen.getByRole('button', { name: 'Eliminar' }))
    await waitFor(() => expect(mockPermanentlyDeletePauta).toHaveBeenCalledWith('p2'))
    await waitFor(() => expect(onDeleted).toHaveBeenCalledWith('p2'))
    expect(onChanged).not.toHaveBeenCalled()
  })

  it('"Cancelar" cierra el diálogo sin llamar a la API', () => {
    renderTable({ initialPhase: 'papelera', editMode: 'coordina', pautas: [PAUTA_BORRADA] })
    fireEvent.click(screen.getByText('Eliminar definitivamente'))
    fireEvent.click(screen.getByText('Cancelar'))
    expect(screen.queryByText('Eliminar pauta')).not.toBeInTheDocument()
    expect(mockPermanentlyDeletePauta).not.toHaveBeenCalled()
  })
})

describe('AvPhaseTable — Agenda: la fila no se pierde al editar fecha/hora', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('al guardar una nueva fecha/hora, la fila queda resaltada y el resaltado se apaga solo', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    mockUpdatePauta.mockResolvedValue({
      data: { id: 'p1', client_name: 'Cliente A', status: 'programada', pauta_date: '2026-09-10' },
      error: null,
    })
    const pauta = {
      id: 'p1',
      client_name: 'Cliente A',
      status: 'programada',
      formats: [],
      recurso_ids: [],
      pauta_date: '2026-09-04',
    }
    renderTable({ initialPhase: 'agenda', editMode: 'coordina', pautas: [pauta] })

    const dateInput = screen.getByDisplayValue('2026-09-04')
    fireEvent.blur(dateInput, { target: { value: '2026-09-10' } })

    await waitFor(() => expect(mockUpdatePauta).toHaveBeenCalled())
    await waitFor(() => expect(dateInput.closest('tr')).toHaveClass('bg-[#FFF9E8]'))

    await vi.advanceTimersByTimeAsync(2600)
    expect(dateInput.closest('tr')).not.toHaveClass('bg-[#FFF9E8]')

    vi.useRealTimers()
  })

  it('una pauta con fecha de otro mes muestra el aviso "↗ mes" y permite saltar a él', () => {
    const onGoToMonth = vi.fn()
    const pauta = {
      id: 'p1',
      client_name: 'Cliente A',
      status: 'programada',
      formats: [],
      recurso_ids: [],
      pauta_date: '2026-10-15',
    }
    renderTable({
      initialPhase: 'agenda',
      editMode: 'coordina',
      pautas: [pauta],
      viewYear: 2026,
      viewMonth: 9,
      onGoToMonth,
    })

    const chip = screen.getByText(/octubre/i)
    fireEvent.click(chip)
    expect(onGoToMonth).toHaveBeenCalledWith(2026, 10)
  })

  it('sin conflicto de mes, no se muestra el aviso "↗ mes"', () => {
    const pauta = {
      id: 'p1',
      client_name: 'Cliente A',
      status: 'programada',
      formats: [],
      recurso_ids: [],
      pauta_date: '2026-09-04',
    }
    renderTable({
      initialPhase: 'agenda',
      editMode: 'coordina',
      pautas: [pauta],
      viewYear: 2026,
      viewMonth: 9,
    })
    expect(screen.queryByText(/septiembre/i)).not.toBeInTheDocument()
  })

  it('si el guardado es rechazado por un conflicto bloqueante, el input vuelve a mostrar la fecha persistida', async () => {
    mockFetchPautasByDate.mockResolvedValue({
      data: [
        {
          id: 'p2',
          client_name: 'Cliente B',
          salida: '10:00',
          llegada: '12:00',
          recurso_ids: ['r1'],
          status: 'programada',
        },
      ],
      error: null,
    })
    const AV_USERS = [{ user_id: 'r1', first_name: 'Nadia', last_name: 'Torres', deleted_at: null }]
    const pauta = {
      id: 'p1',
      client_name: 'Cliente A',
      status: 'programada',
      formats: [],
      recurso_ids: ['r1'],
      pauta_date: '2026-09-04',
      salida: '09:00',
      llegada: '11:00',
    }
    renderTable({
      initialPhase: 'agenda',
      editMode: 'coordina',
      audiovisualUsers: AV_USERS,
      resourceUsersById: new Map(AV_USERS.map((u) => [u.user_id, u])),
      pautas: [pauta],
    })

    const dateInput = screen.getByDisplayValue('2026-09-04')
    fireEvent.blur(dateInput, { target: { value: '2026-09-10' } })

    // El remonte forzado (revertTick) hace que el input vuelva a mostrar la fecha original,
    // ya que el conflicto bloqueante impidió el guardado.
    await waitFor(() => expect(screen.getByDisplayValue('2026-09-04')).toBeInTheDocument())
    expect(mockUpdatePauta).not.toHaveBeenCalled()
  })
})
