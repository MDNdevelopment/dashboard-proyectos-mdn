import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { vi } from 'vitest'

const createPauta = vi.fn()
const updatePauta = vi.fn()
vi.mock('../components/pautas/avPautasApi', () => ({
  createPauta: (...a) => createPauta(...a),
  updatePauta: (...a) => updatePauta(...a),
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

function setup(props = {}) {
  const onSaved = vi.fn()
  const onClose = vi.fn()
  render(
    <PautaFormModal
      pauta={null}
      clients={clients}
      employees={employees}
      pautas={[ocupada]}
      companyId="co"
      userId="u1"
      defaultLineId="l1"
      onClose={onClose}
      onSaved={onSaved}
      {...props}
    />,
  )
  return { onSaved, onClose }
}

const submit = () => screen.getByRole('button', { name: /Enviar solicitud|Guardar cambios/ })
const pickClient = (id) =>
  fireEvent.change(screen.getByLabelText('Cliente'), { target: { value: id } })
const typeTema = (v) =>
  fireEvent.change(screen.getByLabelText('De qué trata'), { target: { value: v } })
const typeDate = (ddmmyyyy) =>
  fireEvent.change(screen.getByPlaceholderText('dd/mm/aaaa'), { target: { value: ddmmyyyy } })
const typeSalida = (v) =>
  fireEvent.change(screen.getByLabelText(/^Salida/), { target: { value: v } })

beforeEach(() => {
  createPauta.mockReset().mockResolvedValue({ data: { id: 'new' }, error: null })
  updatePauta.mockReset().mockResolvedValue({ data: { id: 'p1' }, error: null })
})

describe('PautaFormModal — solicitar', () => {
  it('no deja enviar sin cliente ni tema y explica qué falta', () => {
    setup()
    expect(submit()).toBeDisabled()
    expect(screen.getByText(/elige el cliente/)).toBeInTheDocument()
    pickClient('c1')
    expect(submit()).toBeDisabled()
    expect(screen.getByText(/escribe de qué trata/)).toBeInTheDocument()
    typeTema('Lanzamiento')
    expect(submit()).toBeEnabled()
  })

  it('envía la solicitud ya marcada como enviada, con lugar_tipo y la línea por defecto', async () => {
    const { onSaved } = setup()
    pickClient('c1')
    typeTema('Lanzamiento')
    fireEvent.click(screen.getByRole('button', { name: /Reel/ }))
    fireEvent.click(submit())
    await waitFor(() => expect(onSaved).toHaveBeenCalledWith({ id: 'new' }))
    expect(createPauta).toHaveBeenCalledWith(
      'co',
      expect.objectContaining({
        client_id: 'c1',
        tema: 'Lanzamiento',
        formats: ['R'],
        lugar_tipo: 'locacion',
        status: 'solicitada',
        submitted: true,
      }),
      'u1',
      'l1',
    )
  })

  it('el estudio exige fecha y hora; con choque no deja guardar y nombra la pauta', async () => {
    setup()
    pickClient('c1')
    typeTema('Lanzamiento')
    fireEvent.click(screen.getByRole('radio', { name: 'Estudio MDN' }))
    expect(submit()).toBeDisabled()
    expect(screen.getByText(/necesita fecha y hora/)).toBeInTheDocument()

    typeDate('10/10/2026')
    typeSalida('14:00')
    expect(screen.getByRole('alert')).toHaveTextContent(/choca con Alpitech/)
    expect(submit()).toBeDisabled()
    expect(screen.getByText(/el estudio está ocupado/)).toBeInTheDocument()

    typeSalida('15:00')
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(submit()).toBeEnabled()
    fireEvent.click(submit())
    await waitFor(() => expect(createPauta).toHaveBeenCalled())
    expect(createPauta.mock.calls[0][1]).toMatchObject({
      lugar_tipo: 'estudio',
      pauta_date: '2026-10-10',
      salida: '15:00',
    })
  })

  it('una solicitud pendiente a esa hora avisa pero deja enviar', () => {
    setup({ pautas: [{ ...ocupada, status: 'solicitada' }] })
    pickClient('c1')
    typeTema('Lanzamiento')
    fireEvent.click(screen.getByRole('radio', { name: 'Estudio MDN' }))
    typeDate('10/10/2026')
    typeSalida('14:00')
    expect(screen.getByText(/también pidió el estudio/)).toBeInTheDocument()
    expect(submit()).toBeEnabled()
  })

  it('muestra el error traducido si la base rechaza el guardado', async () => {
    createPauta.mockResolvedValue({ data: null, error: { code: '23P01', message: 'exclusion' } })
    const { onSaved } = setup()
    pickClient('c1')
    typeTema('Lanzamiento')
    fireEvent.click(submit())
    await screen.findByText(/El estudio ya está ocupado/)
    expect(onSaved).not.toHaveBeenCalled()
  })
})

describe('PautaFormModal — editar', () => {
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

  it('solo manda los campos que cambiaron', async () => {
    const { onSaved } = setup({ pauta })
    expect(screen.getByRole('heading', { name: 'Editar pauta' })).toBeInTheDocument()
    typeTema('Nuevo tema')
    fireEvent.click(submit())
    await waitFor(() => expect(onSaved).toHaveBeenCalled())
    expect(updatePauta).toHaveBeenCalledWith('p1', { tema: 'Nuevo tema' })
  })

  it('sin cambios cierra sin llamar a la API', async () => {
    const { onClose } = setup({ pauta })
    fireEvent.click(submit())
    await waitFor(() => expect(onClose).toHaveBeenCalled())
    expect(updatePauta).not.toHaveBeenCalled()
  })

  it('una pauta ya agendada no expone fecha/hora/lugar (eso es Reagendar)', () => {
    setup({ pauta: { ...pauta, status: 'programada' } })
    expect(screen.queryByPlaceholderText('dd/mm/aaaa')).not.toBeInTheDocument()
    expect(screen.getByText(/Usa/)).toHaveTextContent(/Reagendar/)
  })
})
