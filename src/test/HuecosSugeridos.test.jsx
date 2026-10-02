import { render, screen, fireEvent, within } from '@testing-library/react'
import { vi } from 'vitest'
import HuecosSugeridos from '../components/pautas/HuecosSugeridos'

// Hoy sábado 3 oct 2026 → días hábiles desde el lunes 5 (10 fichas, sin domingos).
const TODAY = new Date(2026, 9, 3)

const base = {
  deleted_at: null,
  recurso_ids: ['r1'],
  attendee_ids: [],
}
const PAUTAS = [
  // Estudio ocupado por otro cliente el miércoles 7, 13:00–15:00.
  {
    ...base,
    id: 'x',
    client_id: 'otro',
    client_name: 'Fein',
    status: 'programada',
    lugar_tipo: 'estudio',
    pauta_date: '2026-10-07',
    salida: '13:00:00',
    llegada: '15:00:00',
  },
  // Otra solicitud pide el estudio el 7 a las 16:00.
  {
    ...base,
    id: 'y',
    client_id: 'push',
    client_name: 'Push',
    status: 'solicitada',
    submitted: true,
    lugar_tipo: 'estudio',
    pauta_date: '2026-10-07',
    salida: '16:00:00',
    llegada: null,
  },
]

function setup(props = {}) {
  const onPickDate = vi.fn()
  const onPickHora = vi.fn()
  const utils = render(
    <HuecosSugeridos
      pautas={PAUTAS}
      clientId="c1"
      lugarTipo="estudio"
      recursoIds={['r1']}
      date={null}
      salida={null}
      onPickDate={onPickDate}
      onPickHora={onPickHora}
      today={TODAY}
      {...props}
    />,
  )
  return { onPickDate, onPickHora, ...utils }
}

const dias = () => within(screen.getByRole('group', { name: 'Días sugeridos' }))
const horas = () => within(screen.getByRole('group', { name: 'Horas sugeridas' }))

describe('HuecosSugeridos', () => {
  it('ofrece 10 días hábiles desde mañana (sin domingos) más "Otra fecha"', () => {
    setup()
    const fichas = dias().getAllByRole('button')
    expect(fichas).toHaveLength(11)
    expect(fichas[0]).toHaveTextContent(/lun.*5 oct/)
    expect(fichas[5]).toHaveTextContent(/sáb.*10 oct/)
    expect(fichas[6]).toHaveTextContent(/lun.*12 oct/)
    expect(fichas[10]).toHaveTextContent('Otra fecha…')
    expect(screen.queryByRole('group', { name: 'Horas sugeridas' })).not.toBeInTheDocument()
  })

  it('elegir un día avisa al padre; con fecha pinta las horas con su estado', () => {
    const { onPickDate } = setup()
    fireEvent.click(dias().getByRole('button', { name: /mié.*7 oct/ }))
    expect(onPickDate).toHaveBeenCalledWith('2026-10-07')
  })

  it('en el estudio, las horas ocupadas no se pueden elegir y las avisadas sí', () => {
    const { onPickHora } = setup({ date: '2026-10-07' })
    expect(horas().getAllByRole('button')).toHaveLength(10) // 08:00 … 17:00
    const ocupada = horas().getByRole('button', { name: /^13:00 · Fein/ })
    expect(ocupada).toBeDisabled()
    expect(horas().getByRole('button', { name: /^12:00 · Fein/ })).toBeDisabled()
    const aviso = horas().getByRole('button', { name: /^16:00 · solicitud de Push/ })
    expect(aviso).toBeEnabled()
    fireEvent.click(aviso)
    expect(onPickHora).toHaveBeenCalledWith('16:00')
    fireEvent.click(horas().getByRole('button', { name: '09:00' }))
    expect(onPickHora).toHaveBeenCalledWith('09:00')
  })

  it('marca la hora ya elegida', () => {
    setup({ date: '2026-10-07', salida: '09:00' })
    expect(horas().getByRole('button', { name: '09:00' })).toHaveAttribute('aria-pressed', 'true')
    expect(horas().getByRole('button', { name: '10:00' })).toHaveAttribute('aria-pressed', 'false')
  })

  it('en locación no bloquea nada: solo avisa si todos los recursos están saturados', () => {
    const tres = ['a', 'b', 'c'].map((id) => ({
      ...base,
      id,
      client_id: 'z',
      status: 'programada',
      lugar_tipo: 'locacion',
      pauta_date: '2026-10-07',
      salida: '09:00:00',
      llegada: null,
    }))
    setup({ pautas: tres, lugarTipo: 'locacion', date: '2026-10-07', recursoIds: ['r1'] })
    const btns = horas().getAllByRole('button')
    expect(btns.every((b) => !b.disabled)).toBe(true)
    expect(btns[0]).toHaveAccessibleName(/todos los recursos ya tienen pautas/)
  })

  it('"Otra fecha" muestra el selector de fecha', () => {
    setup()
    fireEvent.click(dias().getByRole('button', { name: 'Otra fecha…' }))
    expect(screen.getByPlaceholderText('dd/mm/aaaa')).toBeInTheDocument()
  })
})
