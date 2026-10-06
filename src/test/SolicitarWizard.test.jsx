import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import { vi } from 'vitest'

const createPauta = vi.fn()
vi.mock('../components/pautas/avPautasApi', () => ({
  createPauta: (...a) => createPauta(...a),
}))

import SolicitarWizard from '../components/pautas/SolicitarWizard'

const TODAY = new Date(2026, 9, 3) // sábado → primer día sugerido: lun 5 oct

const clients = [
  { id: 'c1', name: 'Smashack' },
  { id: 'c2', name: 'Alpitech' },
]
const employees = [{ user_id: 'u1', first_name: 'Ana', last_name: 'Pérez', access_level: 1 }]
const recursos = [{ user_id: 'r1', first_name: 'Rafa', last_name: 'Cam', access_level: 1 }]

const ocupada = {
  id: 'x',
  client_id: 'c2',
  client_name: 'Alpitech',
  status: 'programada',
  lugar_tipo: 'estudio',
  pauta_date: '2026-10-07',
  salida: '13:00:00',
  llegada: '15:00:00',
  recurso_ids: ['r1'],
  deleted_at: null,
}

function setup(props = {}) {
  const onSaved = vi.fn()
  const onClose = vi.fn()
  render(
    <SolicitarWizard
      clients={clients}
      employees={employees}
      recursoUsers={recursos}
      pautas={[ocupada]}
      companyId="co"
      userId="j1"
      defaultLineId="l1"
      today={TODAY}
      onClose={onClose}
      onSaved={onSaved}
      {...props}
    />,
  )
  return { onSaved, onClose }
}

const next = () => screen.getByRole('button', { name: 'Siguiente' })
const send = () => screen.getByRole('button', { name: /Enviar solicitud|Enviando/ })
const pickClient = (name) => fireEvent.click(screen.getByRole('option', { name }))
const pickFormat = (re) => fireEvent.click(screen.getByRole('button', { name: re }))
const typeTema = (v) =>
  fireEvent.change(screen.getByLabelText('De qué trata'), { target: { value: v } })
const pickDay = (re) =>
  fireEvent.click(
    within(screen.getByRole('group', { name: 'Días sugeridos' })).getByRole('button', { name: re }),
  )
const pickHour = (re) =>
  fireEvent.click(
    within(screen.getByRole('group', { name: 'Horas sugeridas' })).getByRole('button', {
      name: re,
    }),
  )

function completarPaso1() {
  pickClient('Smashack')
  pickFormat(/Reel/)
  typeTema('Lanzamiento')
  fireEvent.click(next())
}

beforeEach(() => {
  createPauta.mockReset().mockResolvedValue({ data: { id: 'new' }, error: null })
})

describe('SolicitarWizard — paso 1 (qué)', () => {
  it('pide cliente, al menos un formato y tema antes de seguir, y dice qué falta', () => {
    setup()
    expect(screen.getByRole('heading', { name: 'Solicitar pauta' })).toBeInTheDocument()
    expect(next()).toBeDisabled()
    expect(screen.getByText(/elige el cliente/)).toBeInTheDocument()
    pickClient('Smashack')
    expect(screen.getByText(/marca al menos un formato/)).toBeInTheDocument()
    pickFormat(/Reel/)
    expect(screen.getByText(/escribe de qué trata/)).toBeInTheDocument()
    typeTema('Lanzamiento')
    expect(next()).toBeEnabled()
  })

  it('con un solo cliente en la lista lo preselecciona', () => {
    setup({ clients: [clients[0]] })
    expect(screen.getByText('Smashack')).toBeInTheDocument()
    expect(screen.queryByRole('option')).not.toBeInTheDocument()
  })
})

describe('SolicitarWizard — paso 2 (cuándo y dónde)', () => {
  it('locación: elegir un día basta; envía con fecha, lugar y la hora si la eligió', async () => {
    const { onSaved } = setup()
    completarPaso1()
    expect(screen.getByRole('radio', { name: /Locación/ })).toHaveAttribute('aria-checked', 'true')
    expect(next()).toBeDisabled()
    expect(screen.getByText(/elige un día/)).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('Locación'), { target: { value: 'Playa' } })
    pickDay(/lun.*5 oct/)
    expect(next()).toBeEnabled()
    pickHour(/^09:00/)
    fireEvent.click(next())
    fireEvent.click(send())
    await waitFor(() => expect(onSaved).toHaveBeenCalledWith({ id: 'new' }))
    expect(createPauta).toHaveBeenCalledWith(
      'co',
      expect.objectContaining({
        client_id: 'c1',
        formats: ['R'],
        tema: 'Lanzamiento',
        lugar_tipo: 'locacion',
        place: 'Playa',
        pauta_date: '2026-10-05',
        salida: '09:00',
        status: 'solicitada',
        submitted: true,
      }),
      'j1',
      'l1',
    )
  })

  it('estudio: exige hora; un hueco ocupado no se puede elegir y uno libre sí', () => {
    setup()
    completarPaso1()
    fireEvent.click(screen.getByRole('radio', { name: /Estudio MDN/ }))
    pickDay(/mié.*7 oct/)
    expect(next()).toBeDisabled()
    expect(screen.getByText(/necesita hora de salida/)).toBeInTheDocument()
    const horas = within(screen.getByRole('group', { name: 'Horas sugeridas' }))
    expect(horas.getByRole('button', { name: /^13:00 · Alpitech/ })).toBeDisabled()
    pickHour(/^15:00/)
    expect(next()).toBeEnabled()
  })

  it('"Sin fecha fija" permite enviar sin fecha (solo en locación)', async () => {
    setup()
    completarPaso1()
    fireEvent.click(screen.getByRole('checkbox', { name: /Sin fecha fija/ }))
    expect(next()).toBeEnabled()
    fireEvent.click(next())
    fireEvent.click(send())
    await waitFor(() => expect(createPauta).toHaveBeenCalled())
    expect(createPauta.mock.calls[0][1]).toMatchObject({ pauta_date: null, salida: null })
  })

  it('en el estudio no se puede pedir "sin fecha fija"', () => {
    setup()
    completarPaso1()
    fireEvent.click(screen.getByRole('radio', { name: /Estudio MDN/ }))
    expect(screen.getByRole('checkbox', { name: /Sin fecha fija/ })).toBeDisabled()
  })

  it('cambiar de día borra la hora elegida', () => {
    setup()
    completarPaso1()
    fireEvent.click(screen.getByRole('radio', { name: /Estudio MDN/ }))
    pickDay(/lun.*5 oct/)
    pickHour(/^09:00/)
    expect(next()).toBeEnabled()
    pickDay(/mar.*6 oct/)
    expect(next()).toBeDisabled()
  })
})

describe('SolicitarWizard — paso 3 y envío', () => {
  it('Atrás vuelve al paso anterior conservando lo escrito', () => {
    setup()
    completarPaso1()
    fireEvent.click(screen.getByRole('button', { name: 'Atrás' }))
    expect(screen.getByLabelText('De qué trata')).toHaveValue('Lanzamiento')
    expect(screen.getByText('Smashack')).toBeInTheDocument()
  })

  it('los detalles son opcionales y viajan en la solicitud', async () => {
    setup()
    completarPaso1()
    pickDay(/lun.*5 oct/)
    fireEvent.click(next())
    expect(screen.getByText(/Todo lo de este paso es opcional/)).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('Requerimientos'), { target: { value: 'Trípode' } })
    fireEvent.change(screen.getByLabelText('Enlace de la grilla'), {
      target: { value: 'https://drive.google.com/g' },
    })
    fireEvent.click(screen.getByRole('checkbox', { name: /Pauta extra/ }))
    fireEvent.click(send())
    await waitFor(() => expect(createPauta).toHaveBeenCalled())
    expect(createPauta.mock.calls[0][1]).toMatchObject({
      requirements: 'Trípode',
      link: 'https://drive.google.com/g',
      extra: true,
    })
  })

  it('muestra el error traducido si la base rechaza el guardado', async () => {
    createPauta.mockResolvedValue({ data: null, error: { code: '23P01', message: 'exclusion' } })
    const { onSaved } = setup()
    completarPaso1()
    pickDay(/lun.*5 oct/)
    fireEvent.click(next())
    fireEvent.click(send())
    await screen.findByText(/El estudio ya está ocupado/)
    expect(onSaved).not.toHaveBeenCalled()
  })

  it('Cerrar avisa al padre', () => {
    const { onClose } = setup()
    fireEvent.click(screen.getByRole('button', { name: 'Cerrar' }))
    expect(onClose).toHaveBeenCalled()
  })
})
