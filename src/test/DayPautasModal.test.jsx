/**
 * Tests de DayPautasModal — modal de detalle de un día del calendario de pautas (se abre al
 * hacer clic en el día o en "+N más"). Cubre: lista solo las pautas de esa fecha exacta, clic
 * en una pauta llama a onPautaClick, y el botón "Generar mensaje WhatsApp" muestra el texto de
 * agenda de ese día con opción de volver a la lista.
 */
import { render, screen, fireEvent } from '@testing-library/react'
import { vi } from 'vitest'
import DayPautasModal from '../components/pautas/DayPautasModal'

const USERS_BY_ID = new Map([['u1', { user_id: 'u1', first_name: 'Lizdania', last_name: '' }]])

function pauta(overrides = {}) {
  return {
    id: 'p1',
    client_name: 'Cliente A',
    status: 'programada',
    pauta_date: '2026-08-20',
    salida: '09:00:00',
    formats: ['V'],
    recurso_ids: ['u1'],
    ...overrides,
  }
}

const DATE = new Date(2026, 7, 20) // 20 ago 2026

function renderModal(props = {}) {
  return render(
    <DayPautasModal
      date={DATE}
      pautas={[]}
      usersById={USERS_BY_ID}
      onPautaClick={vi.fn()}
      onClose={vi.fn()}
      {...props}
    />,
  )
}

describe('DayPautasModal', () => {
  it('lista solo las pautas de la fecha exacta (programada/realizada)', () => {
    renderModal({
      pautas: [
        pauta({ id: 'p1', client_name: 'Del Día', pauta_date: '2026-08-20' }),
        pauta({ id: 'p2', client_name: 'Otro Día', pauta_date: '2026-08-21' }),
        pauta({ id: 'p3', client_name: 'Sin Confirmar', status: 'solicitada' }),
      ],
    })
    expect(screen.getByText('Del Día')).toBeInTheDocument()
    expect(screen.queryByText('Otro Día')).not.toBeInTheDocument()
    expect(screen.queryByText('Sin Confirmar')).not.toBeInTheDocument()
  })

  it('sin pautas ese día, muestra el mensaje vacío', () => {
    renderModal({ pautas: [] })
    expect(screen.getByText('Sin pautas agendadas este día.')).toBeInTheDocument()
  })

  it('clic en una pauta llama a onPautaClick con esa pauta', () => {
    const onPautaClick = vi.fn()
    renderModal({
      pautas: [pauta({ id: 'p1', client_name: 'Del Día' })],
      onPautaClick,
    })
    fireEvent.click(screen.getByText('Del Día'))
    expect(onPautaClick).toHaveBeenCalledWith(expect.objectContaining({ id: 'p1' }))
  })

  it('"Generar mensaje WhatsApp" muestra el texto del día y permite volver a la lista', () => {
    renderModal({
      pautas: [pauta({ id: 'p1', client_name: 'Del Día', pauta_date: '2026-08-20' })],
    })
    fireEvent.click(screen.getByText('Generar mensaje WhatsApp'))
    expect(screen.getByText('DEL DÍA', { exact: false })).toBeInTheDocument()
    expect(screen.getByText('Copiar texto')).toBeInTheDocument()

    fireEvent.click(screen.getByText('Volver'))
    expect(screen.getByText('Del Día')).toBeInTheDocument()
  })
})
