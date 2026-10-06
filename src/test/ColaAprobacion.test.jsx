import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { vi } from 'vitest'
import ColaAprobacion from '../components/pautas/ColaAprobacion'

const users = new Map([
  ['j1', { user_id: 'j1', first_name: 'Georgina', last_name: 'Lara', access_level: 2 }],
  ['r1', { user_id: 'r1', first_name: 'Rafa', last_name: 'Cam', access_level: 1 }],
])
const recursos = [users.get('r1')]

const solicitud = (o = {}) => ({
  id: 's1',
  client_id: 'c1',
  client_name: 'Smashack',
  tema: 'Lanzamiento',
  status: 'solicitada',
  submitted: true,
  lugar_tipo: 'locacion',
  place: 'Playa',
  pauta_date: '2026-10-10',
  salida: '09:00:00',
  llegada: null,
  formats: ['R', 'F'],
  recurso_ids: [],
  attendee_ids: [],
  created_by: 'j1',
  created_at: '2026-10-01T10:00:00Z',
  deleted_at: null,
  ...o,
})

// Pauta confirmada que ocupa el estudio 09:00–11:00 el día 10 (choque seguro).
const enEstudio = {
  id: 'x',
  client_id: 'c9',
  client_name: 'Alpitech',
  status: 'programada',
  lugar_tipo: 'estudio',
  pauta_date: '2026-10-10',
  salida: '09:00:00',
  llegada: '11:00:00',
  recurso_ids: ['r1'],
  deleted_at: null,
}

function setup({ solicitudes, pautas, ...props } = {}) {
  const onFields = vi.fn().mockResolvedValue({ error: null })
  const onPautaClick = vi.fn()
  const sols = solicitudes ?? [solicitud()]
  render(
    <ColaAprobacion
      solicitudes={sols}
      pautas={pautas ?? [...sols, enEstudio]}
      usersById={users}
      recursoUsers={recursos}
      allEmployees={recursos}
      canApprove
      onFields={onFields}
      onPautaClick={onPautaClick}
      {...props}
    />,
  )
  return { onFields, onPautaClick }
}

describe('ColaAprobacion', () => {
  it('vacía: muestra el estado "sin pendientes"', () => {
    setup({ solicitudes: [] })
    expect(screen.getByText(/No hay solicitudes pendientes/)).toBeInTheDocument()
  })

  it('cada tarjeta resume cliente, tema, fecha pedida, lugar y quién solicitó', () => {
    setup()
    const card = screen.getByRole('article', { name: /Solicitud Smashack/ })
    expect(card).toHaveTextContent('Smashack')
    expect(card).toHaveTextContent('Lanzamiento')
    expect(card).toHaveTextContent(/10 oct/)
    expect(card).toHaveTextContent(/9:00/)
    expect(card).toHaveTextContent('Playa')
    expect(card).toHaveTextContent('Georgina')
  })

  it('sin fecha deseada dice "Sin fecha fija"', () => {
    setup({ solicitudes: [solicitud({ pauta_date: null, salida: null })] })
    expect(screen.getByText('Sin fecha fija')).toBeInTheDocument()
  })

  it('avisa si pide el estudio a una hora ya ocupada por otra pauta confirmada', () => {
    setup({ solicitudes: [solicitud({ lugar_tipo: 'estudio', place: '' })] })
    expect(screen.getByText(/El estudio está ocupado a esa hora \(Alpitech\)/)).toBeInTheDocument()
  })

  it('Declinar guarda status declinada', async () => {
    const { onFields } = setup()
    fireEvent.click(screen.getByRole('button', { name: 'Declinar' }))
    await waitFor(() => expect(onFields).toHaveBeenCalled())
    expect(onFields.mock.calls[0][0].id).toBe('s1')
    expect(onFields.mock.calls[0][1]).toEqual({ status: 'declinada' })
  })

  it('Agendar abre el diálogo de agendar y confirma con status programada', async () => {
    const { onFields } = setup()
    fireEvent.click(screen.getByRole('button', { name: 'Agendar' }))
    // El diálogo trae su propio botón "Agendar" (el submit).
    const submits = await screen.findAllByRole('button', { name: /^Agendar$/ })
    fireEvent.click(submits[submits.length - 1])
    await waitFor(() => expect(onFields).toHaveBeenCalled())
    expect(onFields.mock.calls[0][1]).toMatchObject({ status: 'programada' })
  })

  it('"Ver detalle" entrega la pauta al padre', () => {
    const { onPautaClick } = setup()
    fireEvent.click(screen.getByRole('button', { name: 'Ver detalle' }))
    expect(onPautaClick).toHaveBeenCalledWith(expect.objectContaining({ id: 's1' }))
  })

  it('sin permiso de aprobar no muestra Agendar ni Declinar, pero sí Ver detalle', () => {
    setup({ canApprove: false })
    expect(screen.queryByRole('button', { name: 'Agendar' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Declinar' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Ver detalle' })).toBeInTheDocument()
  })

  it('si el guardado falla, muestra el error', async () => {
    const onFields = vi.fn().mockResolvedValue({ error: { message: 'boom' } })
    setup({ onFields })
    fireEvent.click(screen.getByRole('button', { name: 'Declinar' }))
    expect(await screen.findByRole('alert')).toBeInTheDocument()
  })
})
