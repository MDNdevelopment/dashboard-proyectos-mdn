import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { vi } from 'vitest'

const updatePauta = vi.fn()
const setSesionId = vi.fn()
vi.mock('../components/pautas/avPautasApi', () => ({
  updatePauta: (...a) => updatePauta(...a),
  setSesionId: (...a) => setSesionId(...a),
}))

import PautaFormModal from '../components/pautas/PautaFormModal'

const clients = [
  { id: 'c1', name: 'Smashack' },
  { id: 'c2', name: 'Alpitech' },
]
const employees = [{ user_id: 'u1', first_name: 'Ana', last_name: 'Pérez', access_level: 1 }]

const ocupada = {
  id: 'x',
  client_id: 'c2',
  client_name: 'Alpitech',
  status: 'programada',
  lugar_tipo: 'estudio',
  pauta_date: '2026-10-10',
  salida: '13:00:00',
  deleted_at: null,
}

const pauta = {
  id: 'p1',
  client_id: 'c1',
  tema: 'Original',
  formats: ['V'],
  requirements: '',
  link: '',
  piezas_desc: '',
  pauta_date: '2026-10-20',
  salida: '10:00:00',
  llegada: null,
  lugar_tipo: 'locacion',
  place: 'Playa',
  attendee_ids: [],
  extra: false,
  status: 'solicitada',
}

function setup(props = {}) {
  const onSaved = vi.fn()
  const onClose = vi.fn()
  render(
    <PautaFormModal
      pauta={pauta}
      clients={clients}
      employees={employees}
      pautas={[ocupada]}
      onClose={onClose}
      onSaved={onSaved}
      {...props}
    />,
  )
  return { onSaved, onClose }
}

const submit = () => screen.getByRole('button', { name: /Guardar cambios/ })
const typeTema = (v) =>
  fireEvent.change(screen.getByLabelText('De qué trata'), { target: { value: v } })
const typeDate = (ddmmyyyy) =>
  fireEvent.change(screen.getByPlaceholderText('dd/mm/aaaa'), { target: { value: ddmmyyyy } })
const typeSalida = (v) =>
  fireEvent.change(screen.getByLabelText(/^Salida/), { target: { value: v } })

beforeEach(() => {
  updatePauta.mockReset().mockResolvedValue({ data: { id: 'p1' }, error: null })
  setSesionId.mockReset().mockResolvedValue({ data: [], error: null })
})

// Crear una pauta ya no pasa por aquí: ver SolicitarWizard.test.jsx.
describe('PautaFormModal — editar', () => {
  it('solo manda los campos que cambiaron', async () => {
    const { onSaved } = setup()
    expect(screen.getByRole('heading', { name: 'Editar pauta' })).toBeInTheDocument()
    typeTema('Nuevo tema')
    fireEvent.click(submit())
    await waitFor(() => expect(onSaved).toHaveBeenCalled())
    expect(updatePauta).toHaveBeenCalledWith('p1', { tema: 'Nuevo tema' })
  })

  it('sin cambios cierra sin llamar a la API', async () => {
    const { onClose } = setup()
    fireEvent.click(submit())
    await waitFor(() => expect(onClose).toHaveBeenCalled())
    expect(updatePauta).not.toHaveBeenCalled()
  })

  it('no deja guardar sin tema (brief incompleto) y explica qué falta', () => {
    setup()
    typeTema('')
    expect(submit()).toBeDisabled()
    expect(screen.getByText(/escribe de qué trata/)).toBeInTheDocument()
  })

  it('en una solicitud, cambiar al estudio exige hora y respeta los choques', () => {
    setup()
    fireEvent.click(screen.getByRole('radio', { name: 'Estudio MDN' }))
    typeDate('10/10/2026')
    typeSalida('14:00')
    expect(screen.getByRole('alert')).toHaveTextContent(/choca con Alpitech/)
    expect(submit()).toBeDisabled()
    typeSalida('15:00')
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(submit()).toBeEnabled()
  })

  it('una pauta ya agendada no expone fecha/hora/lugar (eso es Reagendar)', () => {
    setup({ pauta: { ...pauta, status: 'programada' } })
    expect(screen.queryByPlaceholderText('dd/mm/aaaa')).not.toBeInTheDocument()
    expect(screen.getByText(/Usa/)).toHaveTextContent(/Reagendar/)
  })

  it('muestra el error traducido si la base rechaza el guardado', async () => {
    updatePauta.mockResolvedValue({ data: null, error: { code: '23P01', message: 'exclusion' } })
    const { onSaved } = setup()
    typeTema('Otro')
    fireEvent.click(submit())
    await screen.findByText(/El estudio ya está ocupado/)
    expect(onSaved).not.toHaveBeenCalled()
  })
})

describe('PautaFormModal — recursos de una pauta ya agendada', () => {
  const agendada = { ...pauta, status: 'programada', recurso_ids: ['u1'] }
  const usersById = new Map([['u1', employees[0]]])

  it('una solicitud no muestra Recursos (se eligen al aprobar y agendar)', () => {
    setup({ recursoUsers: employees, usersById })
    expect(screen.queryByText(/Recursos \(quién graba/)).not.toBeInTheDocument()
  })

  it('una pauta agendada permite cambiar los recursos y manda solo recurso_ids', async () => {
    const { onSaved } = setup({ pauta: agendada, recursoUsers: employees, usersById })
    expect(screen.getByText(/Recursos \(quién graba/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Quitar a Ana Pérez' }))
    fireEvent.click(submit())
    await waitFor(() => expect(onSaved).toHaveBeenCalled())
    expect(updatePauta).toHaveBeenCalledWith('p1', { recurso_ids: [] })
  })

  // Grabación de grupo: otra cuenta a la misma hora del mismo día. Declararla como la misma
  // salida comparte `sesion_id` y saca ese choque del cálculo de carga.
  it('declara la misma salida: guarda sesion_id y se lo escribe a la pauta hermana', async () => {
    const hermana = {
      id: 'h1',
      client_id: 'c2',
      client_name: 'San Lucas Riñones',
      status: 'programada',
      lugar_tipo: 'locacion',
      pauta_date: agendada.pauta_date,
      salida: agendada.salida,
      llegada: null,
      recurso_ids: ['u1'],
      deleted_at: null,
    }
    const onChanged = vi.fn()
    const { onSaved } = setup({
      pauta: agendada,
      pautas: [hermana],
      recursoUsers: employees,
      usersById,
      onChanged,
    })
    fireEvent.click(screen.getByRole('checkbox', { name: /Se graba junto con San Lucas Riñones/ }))
    fireEvent.click(submit())
    await waitFor(() => expect(onSaved).toHaveBeenCalled())

    const sesion = updatePauta.mock.calls[0][1].sesion_id
    expect(sesion).toBeTruthy()
    expect(setSesionId).toHaveBeenCalledWith(['h1'], sesion)
  })
})
