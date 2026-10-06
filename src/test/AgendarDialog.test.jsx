import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { vi } from 'vitest'
import AgendarDialog from '../components/pautas/AgendarDialog'

const users = new Map([
  ['r1', { user_id: 'r1', first_name: 'Rafa', last_name: 'Cam', access_level: 1 }],
  ['r2', { user_id: 'r2', first_name: 'Sol', last_name: 'Luz', access_level: 1 }],
])
const recursos = [...users.values()]

const base = {
  id: 'p1',
  client_id: 'c1',
  client_name: 'Smashack',
  status: 'solicitada',
  lugar_tipo: 'locacion',
  place: 'Playa',
  pauta_date: '2026-10-10',
  salida: '09:00:00',
  llegada: null,
  recurso_ids: [],
  attendee_ids: [],
  deleted_at: null,
}
// Rafa ya está en otra pauta ese día 09:00–11:00 (horas reales → choque seguro).
const otra = {
  id: 'x',
  client_id: 'c2',
  client_name: 'Alpitech',
  status: 'programada',
  lugar_tipo: 'estudio',
  pauta_date: '2026-10-10',
  salida: '09:00:00',
  llegada: '11:00:00',
  recurso_ids: ['r1'],
  deleted_at: null,
}

function setup(props = {}) {
  const onConfirm = vi.fn().mockResolvedValue({ error: null })
  const onClose = vi.fn()
  render(
    <AgendarDialog
      mode="agendar"
      pauta={base}
      pautas={[base, otra]}
      usersById={users}
      recursoUsers={recursos}
      allEmployees={recursos}
      onConfirm={onConfirm}
      onClose={onClose}
      {...props}
    />,
  )
  return { onConfirm, onClose }
}

const submit = () => screen.getByRole('button', { name: /^Agendar$|^Reagendar$/ })
const addRecurso = (name) =>
  fireEvent.click(screen.getAllByTitle(new RegExp(`Agregar a ${name}`))[0])

describe('AgendarDialog — agendar', () => {
  it('guarda status programada con fecha, lugar, recursos y asistentes', async () => {
    const { onConfirm, onClose } = setup()
    addRecurso('Sol')
    fireEvent.click(submit())
    await waitFor(() => expect(onConfirm).toHaveBeenCalled())
    expect(onConfirm.mock.calls[0][0]).toMatchObject({
      status: 'programada',
      submitted: true,
      pauta_date: '2026-10-10',
      salida: '09:00:00',
      lugar_tipo: 'locacion',
      place: 'Playa',
      recurso_ids: ['r2'],
    })
    await waitFor(() => expect(onClose).toHaveBeenCalled())
  })

  it('un choque seguro de recurso bloquea y lo explica', () => {
    const { onConfirm } = setup()
    addRecurso('Rafa')
    expect(screen.getByRole('alert')).toHaveTextContent(/Rafa Cam ya está en la pauta de Alpitech/)
    expect(submit()).toBeDisabled()
    fireEvent.click(submit())
    expect(onConfirm).not.toHaveBeenCalled()
  })

  it('un choque probable pregunta y "Asignar igual" guarda', async () => {
    // La otra pauta sin llegada: solo choca asumiendo 3h → aviso, no bloqueo.
    const { onConfirm } = setup({ pautas: [base, { ...otra, llegada: null, salida: '08:00:00' }] })
    addRecurso('Rafa')
    expect(submit()).toBeEnabled()
    fireEvent.click(submit())
    expect(screen.getByText('Posible choque de horario')).toBeInTheDocument()
    expect(onConfirm).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Asignar igual' }))
    await waitFor(() => expect(onConfirm).toHaveBeenCalled())
  })

  it('el estudio ocupado bloquea; sin fecha tampoco deja', () => {
    setup({ pauta: { ...base, lugar_tipo: 'estudio', salida: '10:00:00' } })
    expect(screen.getByText(/el estudio está ocupado/)).toBeInTheDocument()
    expect(submit()).toBeDisabled()
    fireEvent.change(screen.getByLabelText(/^Salida/), { target: { value: '12:00' } })
    expect(submit()).toBeEnabled()
    fireEvent.change(screen.getByPlaceholderText('dd/mm/aaaa'), { target: { value: '' } })
    expect(screen.getByText(/elige la fecha/)).toBeInTheDocument()
  })

  it('muestra el error de la base si el guardado falla', async () => {
    const onConfirm = vi.fn().mockResolvedValue({ error: { code: '23P01', message: 'x' } })
    const { onClose } = setup({ onConfirm })
    fireEvent.click(submit())
    await screen.findByText(/El estudio ya está ocupado/)
    expect(onClose).not.toHaveBeenCalled()
  })
})

describe('AgendarDialog — reagendar', () => {
  const prog = { ...base, status: 'programada', recurso_ids: ['r1'] }

  it('solo envía fecha/hora/lugar y exige un cambio real', async () => {
    const { onConfirm } = setup({ mode: 'reagendar', pauta: prog, pautas: [prog] })
    expect(screen.queryByText(/Recursos/)).not.toBeInTheDocument()
    expect(submit()).toBeDisabled()
    expect(screen.getByText(/Cambia la fecha/)).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText(/^Salida/), { target: { value: '14:00' } })
    fireEvent.click(submit())
    await waitFor(() => expect(onConfirm).toHaveBeenCalled())
    const fields = onConfirm.mock.calls[0][0]
    expect(fields).toEqual({
      pauta_date: '2026-10-10',
      salida: '14:00',
      llegada: null,
      lugar_tipo: 'locacion',
      place: 'Playa',
    })
  })

  it('al reagendar valida los recursos que ya tiene contra la nueva hora', () => {
    // Rafa (recurso de prog) choca con `otra` si prog se mueve a las 10:00 con llegada 10:30.
    setup({ mode: 'reagendar', pauta: { ...prog, salida: '13:00:00' }, pautas: [prog, otra] })
    fireEvent.change(screen.getByLabelText(/^Salida/), { target: { value: '10:00' } })
    fireEvent.change(screen.getByLabelText('Llegada'), { target: { value: '10:30' } })
    expect(screen.getByText(/Rafa Cam ya está en la pauta de Alpitech/)).toBeInTheDocument()
    expect(submit()).toBeDisabled()
  })
})
