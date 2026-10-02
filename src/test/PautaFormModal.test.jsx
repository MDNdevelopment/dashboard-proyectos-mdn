import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { vi } from 'vitest'

const updatePauta = vi.fn()
vi.mock('../components/pautas/avPautasApi', () => ({
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
