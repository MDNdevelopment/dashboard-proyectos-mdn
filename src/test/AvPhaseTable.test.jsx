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

vi.mock('../components/pautas/avPautasApi', () => ({
  createPauta: (...a) => mockCreatePauta(...a),
  updatePauta: (...a) => mockUpdatePauta(...a),
  deletePauta: (...a) => mockDeletePauta(...a),
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
