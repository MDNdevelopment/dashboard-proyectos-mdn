/**
 * Smoke test de PautaDetailModal — modal de detalle que abre al hacer clic en una pauta
 * (calendario o tabla de seguimiento). Cubre: renderiza la info esperada, ya no usa emojis
 * literales como iconos (reemplazados por SVG), cierra al click en la ✕, y — para pautas
 * 'realizada' — muestra el checklist de piezas agrupado por editor, editable solo si
 * `canCoordinate`.
 */
import { render, screen, fireEvent } from '@testing-library/react'
import { vi } from 'vitest'
import PautaDetailModal from '../components/pautas/PautaDetailModal'

const mockCreatePiezas = vi.fn().mockResolvedValue({ data: [], error: null })

vi.mock('../components/pautas/avPautasApi', () => ({
  createPiezas: (...a) => mockCreatePiezas(...a),
  updatePieza: vi.fn().mockResolvedValue({ data: null, error: null }),
  deletePiezas: vi.fn().mockResolvedValue({ data: null, error: null }),
}))

const EMOJIS = ['⏩', '📅', '⏱️', '📍', '👥', '🎬']

const USERS_BY_ID = new Map([
  ['u1', { user_id: 'u1', first_name: 'Lizdania', last_name: 'Andrade' }],
  ['u2', { user_id: 'u2', first_name: 'Georgina', last_name: 'Ríos' }],
])

const AUDIOVISUAL_USERS = [...USERS_BY_ID.values()]

function pauta(overrides = {}) {
  return {
    id: 'p1',
    client_name: 'Cliente A',
    tema: 'Spot institucional',
    status: 'programada',
    pauta_date: '2026-08-20',
    salida: '09:00:00',
    llegada: '11:00:00',
    place: 'Estudio central',
    formats: ['V'],
    recurso_ids: ['u1'],
    attendee_ids: ['u2'],
    link: null,
    piezas_desc: null,
    piezas_totales: 0,
    ...overrides,
  }
}

function baseProps(overrides = {}) {
  return {
    pauta: pauta(),
    usersById: USERS_BY_ID,
    audiovisualUsers: AUDIOVISUAL_USERS,
    piezas: [],
    canCoordinate: true,
    companyId: 'c1',
    onFields: vi.fn(),
    onPiezaChanged: vi.fn(),
    onPiezaDeleted: vi.fn(),
    onClose: vi.fn(),
    ...overrides,
  }
}

describe('PautaDetailModal', () => {
  it('renderiza la info principal de la pauta', () => {
    render(<PautaDetailModal {...baseProps()} />)
    expect(screen.getByText('Cliente A')).toBeInTheDocument()
    expect(screen.getByText(/Estudio central/)).toBeInTheDocument()
    expect(screen.getByText(/Asiste: Georgina Ríos/)).toBeInTheDocument()
    expect(screen.getByText(/LIZDANIA ANDRADE/)).toBeInTheDocument()
  })

  it('ya no usa emojis literales como iconos (reemplazados por SVG)', () => {
    const { container } = render(<PautaDetailModal {...baseProps()} />)
    const text = container.textContent
    EMOJIS.forEach((emoji) => expect(text).not.toContain(emoji))
    expect(container.querySelectorAll('svg').length).toBeGreaterThanOrEqual(6)
  })

  it('null pauta no renderiza nada', () => {
    const { container } = render(<PautaDetailModal {...baseProps({ pauta: null })} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('click en la ✕ cierra el modal', () => {
    const onClose = vi.fn()
    render(<PautaDetailModal {...baseProps({ onClose })} />)
    fireEvent.click(screen.getByLabelText('Cerrar'))
    expect(onClose).toHaveBeenCalled()
  })

  it('pauta no realizada no muestra la sección de edición de piezas', () => {
    render(<PautaDetailModal {...baseProps()} />)
    expect(screen.queryByText('Edición de piezas')).not.toBeInTheDocument()
  })

  it('pauta realizada muestra el checklist agrupado por editor', () => {
    const piezas = [
      {
        id: 'pz1',
        pauta_id: 'p1',
        editor_user_id: 'u1',
        nombre: 'Video #1',
        status: 'listo',
        position: 0,
      },
      {
        id: 'pz2',
        pauta_id: 'p1',
        editor_user_id: 'u1',
        nombre: 'Video #2',
        status: 'pendiente',
        position: 1,
      },
    ]
    render(
      <PautaDetailModal
        {...baseProps({ pauta: pauta({ status: 'realizada', piezas_totales: 2 }), piezas })}
      />,
    )
    expect(screen.getByText('Edición de piezas')).toBeInTheDocument()
    expect(screen.getAllByText('Lizdania Andrade').length).toBeGreaterThan(0)
    expect(screen.getByDisplayValue('Video #1')).toBeInTheDocument()
    expect(screen.getByDisplayValue('Video #2')).toBeInTheDocument()
    expect(screen.getByText('1/2 listas')).toBeInTheDocument()
  })

  it('avisa cuando la suma repartida entre editores no cuadra con el total', () => {
    const piezas = [
      {
        id: 'pz1',
        pauta_id: 'p1',
        editor_user_id: 'u1',
        nombre: 'Video #1',
        status: 'pendiente',
        position: 0,
      },
    ]
    render(
      <PautaDetailModal
        {...baseProps({ pauta: pauta({ status: 'realizada', piezas_totales: 3 }), piezas })}
      />,
    )
    expect(screen.getByText(/1 de 3 piezas repartidas/)).toBeInTheDocument()
  })

  it('sin canCoordinate, el checklist es de solo lectura (sin inputs de texto ni AttendeePicker)', () => {
    const piezas = [
      {
        id: 'pz1',
        pauta_id: 'p1',
        editor_user_id: 'u1',
        nombre: 'Video #1',
        status: 'listo',
        position: 0,
      },
    ]
    render(
      <PautaDetailModal
        {...baseProps({
          pauta: pauta({ status: 'realizada', piezas_totales: 1 }),
          piezas,
          canCoordinate: false,
        })}
      />,
    )
    expect(screen.getByText('Video #1')).toBeInTheDocument()
    expect(screen.queryByDisplayValue('Video #1')).not.toBeInTheDocument()
    expect(screen.queryByPlaceholderText('Buscar empleado por nombre…')).not.toBeInTheDocument()
  })

  it('asignar un editor sin piezas previas le crea una pieza de entrada (regresión: antes desaparecía del picker)', async () => {
    mockCreatePiezas.mockResolvedValueOnce({
      data: [
        {
          id: 'pz-new',
          pauta_id: 'p1',
          editor_user_id: 'u1',
          nombre: 'Video #1',
          status: 'pendiente',
          position: 0,
        },
      ],
      error: null,
    })
    render(
      <PautaDetailModal
        {...baseProps({ pauta: pauta({ status: 'realizada', piezas_totales: 1 }), piezas: [] })}
      />,
    )
    fireEvent.change(screen.getByPlaceholderText('Buscar empleado por nombre…'), {
      target: { value: 'Lizdania' },
    })
    fireEvent.click(screen.getByText('Lizdania Andrade'))
    expect(mockCreatePiezas).toHaveBeenCalledWith('c1', 'p1', 'u1', ['Video #1'], 0)
  })

  it('si el insert falla (ej. la tabla av_pauta_piezas no existe todavía), muestra el error en vez de fallar en silencio', async () => {
    mockCreatePiezas.mockResolvedValueOnce({
      data: null,
      error: { message: 'relation "av_pauta_piezas" does not exist' },
    })
    render(
      <PautaDetailModal
        {...baseProps({ pauta: pauta({ status: 'realizada', piezas_totales: 1 }), piezas: [] })}
      />,
    )
    fireEvent.change(screen.getByPlaceholderText('Buscar empleado por nombre…'), {
      target: { value: 'Lizdania' },
    })
    fireEvent.click(screen.getByText('Lizdania Andrade'))
    expect(await screen.findByText(/No se pudo asignar el editor/)).toBeInTheDocument()
  })

  it('si onFields (piezas totales) devuelve error, lo muestra traducido en vez de fallar en silencio', async () => {
    const onFields = vi
      .fn()
      .mockResolvedValue({
        error: { code: '42883', message: 'operator does not exist: uuid = text' },
      })
    render(
      <PautaDetailModal
        {...baseProps({
          pauta: pauta({ status: 'realizada', piezas_totales: 1 }),
          piezas: [],
          onFields,
        })}
      />,
    )
    const input = document.querySelector('input[type="number"]')
    fireEvent.change(input, { target: { value: '5' } })
    fireEvent.blur(input)

    expect(onFields).toHaveBeenCalled()
    expect(
      await screen.findByText(
        'No se pudo guardar el cambio. Vuelve a intentarlo; si sigue pasando, avisa a soporte.',
      ),
    ).toBeInTheDocument()
  })
})
