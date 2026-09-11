/**
 * Smoke test de PautaDetailModal — modal de detalle que abre al hacer clic en una pauta
 * (calendario o tabla de seguimiento). Cubre: renderiza la info esperada, ya no usa emojis
 * literales como iconos (reemplazados por SVG), cierra al click en la ✕, y — para pautas
 * 'realizada' — muestra el checklist de piezas agrupado por editor, editable solo si
 * `canEditPiezas`.
 */
import { render, screen, fireEvent } from '@testing-library/react'
import { vi } from 'vitest'
import PautaDetailModal from '../components/pautas/PautaDetailModal'

const mockCreatePiezas = vi.fn().mockResolvedValue({ data: [], error: null })
const mockCreateLotePieza = vi.fn().mockResolvedValue({ data: null, error: null })
const mockUpdatePieza = vi.fn().mockResolvedValue({ data: null, error: null })
const mockDeletePiezas = vi.fn().mockResolvedValue({ data: null, error: null })

vi.mock('../components/pautas/avPautasApi', () => ({
  createPiezas: (...a) => mockCreatePiezas(...a),
  createLotePieza: (...a) => mockCreateLotePieza(...a),
  updatePieza: (...a) => mockUpdatePieza(...a),
  deletePiezas: (...a) => mockDeletePiezas(...a),
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
    canEditPiezas: true,
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

  it('sin canEditPiezas, el checklist es de solo lectura (sin inputs de texto ni AttendeePicker)', () => {
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
          canEditPiezas: false,
        })}
      />,
    )
    expect(screen.getByText('Video #1')).toBeInTheDocument()
    expect(screen.queryByDisplayValue('Video #1')).not.toBeInTheDocument()
    expect(screen.queryByPlaceholderText('Buscar empleado por nombre…')).not.toBeInTheDocument()
  })

  it('sin canEditPiezas y sin editores, muestra "Sin editores asignados todavía" (el bloque "Editores" no se renderiza)', () => {
    render(
      <PautaDetailModal
        {...baseProps({
          pauta: pauta({ status: 'realizada', piezas_totales: 1 }),
          piezas: [],
          canEditPiezas: false,
        })}
      />,
    )
    expect(screen.queryByText('Editores')).not.toBeInTheDocument()
    expect(screen.getByText('Sin editores asignados todavía.')).toBeInTheDocument()
  })

  it('el picker de editores arranca cerrado: muestra "Aún no se han agregado editores" y se abre con el botón', () => {
    render(
      <PautaDetailModal
        {...baseProps({ pauta: pauta({ status: 'realizada', piezas_totales: 1 }), piezas: [] })}
      />,
    )
    expect(screen.getByText('Editores')).toBeInTheDocument()
    expect(screen.getByText('Aún no se han agregado editores.')).toBeInTheDocument()
    // Un solo mensaje de "vacío" — no se duplica con el de la lista de checklists de abajo.
    expect(screen.queryByText('Sin editores asignados todavía.')).not.toBeInTheDocument()
    expect(screen.queryByPlaceholderText('Buscar empleado por nombre…')).not.toBeInTheDocument()

    fireEvent.click(screen.getByText('+ Agregar editor'))
    expect(screen.getByPlaceholderText('Buscar empleado por nombre…')).toBeInTheDocument()
    expect(screen.queryByText('Aún no se han agregado editores.')).not.toBeInTheDocument()

    fireEvent.click(screen.getByLabelText('Cerrar selector de editores'))
    expect(screen.queryByPlaceholderText('Buscar empleado por nombre…')).not.toBeInTheDocument()
  })

  it('asignar un editor sin piezas previas NO crea ninguna pieza automáticamente (se reparte con el stepper)', async () => {
    render(
      <PautaDetailModal
        {...baseProps({ pauta: pauta({ status: 'realizada', piezas_totales: 1 }), piezas: [] })}
      />,
    )
    expect(screen.getByText('Aún no se han agregado editores.')).toBeInTheDocument()
    fireEvent.click(screen.getByText('+ Agregar editor'))
    fireEvent.change(screen.getByPlaceholderText('Buscar empleado por nombre…'), {
      target: { value: 'Lizdania' },
    })
    fireEvent.click(screen.getByText('Lizdania Andrade'))
    expect(mockCreatePiezas).not.toHaveBeenCalled()
    // El editor entra a la lista con un bloque vacío, listo para repartirle piezas.
    expect(screen.getByText('Sin piezas asignadas.')).toBeInTheDocument()

    // La pauta base tiene un único formato marcado ('V'), así que se autoasigna sin
    // pedirlo pieza por pieza.
    fireEvent.click(screen.getByLabelText('Agregar piezas de Lizdania'))
    expect(mockCreatePiezas).toHaveBeenCalledWith('c1', 'p1', 'u1', ['Video #1'], 0, 'V')
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
    fireEvent.click(screen.getByText('+ Agregar editor'))
    fireEvent.change(screen.getByPlaceholderText('Buscar empleado por nombre…'), {
      target: { value: 'Lizdania' },
    })
    fireEvent.click(screen.getByText('Lizdania Andrade'))
    fireEvent.click(screen.getByLabelText('Agregar piezas de Lizdania'))
    expect(await screen.findByText(/No se pudieron crear las piezas/)).toBeInTheDocument()
  })

  it('si onFields (piezas totales) devuelve error, lo muestra traducido en vez de fallar en silencio', async () => {
    const onFields = vi.fn().mockResolvedValue({
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
    // La pauta base marca el formato 'V', así que el control es "Salieron" de ese
    // formato (el camino legacy de "Piezas totales" solo aparece sin formatos marcados).
    fireEvent.click(screen.getByLabelText('Agregar salieron de Video de marca'))

    expect(onFields).toHaveBeenCalled()
    expect(
      await screen.findByText(
        'No se pudo guardar el cambio. Vuelve a intentarlo; si sigue pasando, avisa a soporte.',
      ),
    ).toBeInTheDocument()
  })

  describe('piezas por formato', () => {
    it('pauta con Reel y Foto marcados: pide "Salieron" de cada uno y ninguno de Video; "Editadas" es solo lectura', () => {
      render(
        <PautaDetailModal
          {...baseProps({ pauta: pauta({ status: 'realizada', formats: ['R', 'F'] }) })}
        />,
      )
      expect(screen.getByText('Reel')).toBeInTheDocument()
      expect(screen.getByText('Foto')).toBeInTheDocument()
      expect(screen.queryByText('Video de marca')).not.toBeInTheDocument()
      // Un stepper "Salieron" por formato (2); "Editadas" ya no es editable — lo deriva
      // el checklist de piezas por formato, así que no tiene botones +/−.
      expect(screen.getByLabelText('Agregar salieron de Reel')).toBeInTheDocument()
      expect(screen.getByLabelText('Agregar salieron de Foto')).toBeInTheDocument()
      expect(screen.queryByLabelText(/editadas/i)).not.toBeInTheDocument()
    })

    it('el stepper "Salieron" de Foto llama a onFields con el piezas_por_formato correcto', () => {
      const onFields = vi.fn().mockResolvedValue({ error: null })
      render(
        <PautaDetailModal
          {...baseProps({
            pauta: pauta({
              status: 'realizada',
              formats: ['R', 'F'],
              piezas_por_formato: {
                R: { salieron: 3, editadas: 2 },
                F: { salieron: 4, editadas: 0 },
              },
            }),
            onFields,
          })}
        />,
      )
      fireEvent.click(screen.getByLabelText('Agregar salieron de Foto'))
      expect(onFields).toHaveBeenCalledWith(expect.objectContaining({ id: 'p1' }), {
        piezas_por_formato: { R: { salieron: 3, editadas: 2 }, F: { salieron: 5, editadas: 0 } },
      })
    })

    it('"Editadas" se muestra de solo lectura, tomada de piezas_por_formato (la deriva el checklist)', () => {
      render(
        <PautaDetailModal
          {...baseProps({
            pauta: pauta({
              status: 'realizada',
              formats: ['F'],
              piezas_por_formato: { F: { salieron: 5, editadas: 3 } },
            }),
          })}
        />,
      )
      expect(screen.getByText('3')).toBeInTheDocument()
      // No hay ningún control editable para "Editadas": solo el stepper de "Salieron".
      expect(screen.getByLabelText('Agregar salieron de Foto')).toBeInTheDocument()
      expect(screen.queryByLabelText(/editadas/i)).not.toBeInTheDocument()
    })

    it('muestra el total ya sincronizado por el trigger de BD, no una suma recalculada en cliente', () => {
      render(
        <PautaDetailModal
          {...baseProps({
            pauta: pauta({
              status: 'realizada',
              formats: ['R', 'F'],
              piezas_por_formato: {
                R: { salieron: 3, editadas: 2 },
                F: { salieron: 5, editadas: 5 },
              },
              piezas_totales: 8,
              piezas_editadas: 7,
            }),
          })}
        />,
      )
      expect(screen.getByText('8/7')).toBeInTheDocument()
    })

    it('pauta sin formatos marcados conserva el input único "Piezas totales" (camino legacy)', () => {
      render(
        <PautaDetailModal
          {...baseProps({ pauta: pauta({ status: 'realizada', formats: [], piezas_totales: 4 }) })}
        />,
      )
      expect(screen.getByText('Piezas totales')).toBeInTheDocument()
      expect(screen.queryByText('Piezas por formato')).not.toBeInTheDocument()
      expect(screen.getByLabelText('Agregar piezas totales')).toBeInTheDocument()
    })
  })

  describe('checklist de piezas ligado a formato', () => {
    it('con un único formato marcado, la pieza se etiqueta sola sin mostrar selector', () => {
      const piezas = [
        {
          id: 'pz1',
          pauta_id: 'p1',
          editor_user_id: 'u1',
          nombre: 'Video #1',
          status: 'listo',
          formato: 'V',
          position: 0,
        },
      ]
      render(
        <PautaDetailModal
          {...baseProps({
            pauta: pauta({ status: 'realizada', formats: ['V'], piezas_totales: 1 }),
            piezas,
          })}
        />,
      )
      expect(document.querySelector('select[aria-label="Formato de Video #1"]')).toBeNull()
    })

    it('con varios formatos marcados, elegir el formato de una pieza llama a updatePieza', async () => {
      mockUpdatePieza.mockResolvedValueOnce({
        data: {
          id: 'pz1',
          pauta_id: 'p1',
          editor_user_id: 'u1',
          nombre: 'Video #1',
          status: 'listo',
          formato: 'F',
        },
        error: null,
      })
      const piezas = [
        {
          id: 'pz1',
          pauta_id: 'p1',
          editor_user_id: 'u1',
          nombre: 'Video #1',
          status: 'listo',
          formato: null,
          position: 0,
        },
      ]
      render(
        <PautaDetailModal
          {...baseProps({
            pauta: pauta({ status: 'realizada', formats: ['R', 'F'], piezas_totales: 1 }),
            piezas,
          })}
        />,
      )
      const select = screen.getByLabelText('Formato de Video #1')
      fireEvent.change(select, { target: { value: 'F' } })
      expect(mockUpdatePieza).toHaveBeenCalledWith('pz1', { formato: 'F' })
    })

    it('sin canEditPiezas, el formato de la pieza se muestra como texto, no como selector', () => {
      const piezas = [
        {
          id: 'pz1',
          pauta_id: 'p1',
          editor_user_id: 'u1',
          nombre: 'Video #1',
          status: 'listo',
          formato: 'R',
          position: 0,
        },
      ]
      render(
        <PautaDetailModal
          {...baseProps({
            pauta: pauta({ status: 'realizada', formats: ['R', 'F'], piezas_totales: 1 }),
            piezas,
            canEditPiezas: false,
          })}
        />,
      )
      expect(screen.queryByLabelText('Formato de Video #1')).not.toBeInTheDocument()
      // "Reel" aparece también en el bloque "Piezas por formato" — basta con confirmar
      // que la etiqueta de la pieza (no un <select>) está presente.
      expect(screen.getAllByText('Reel').length).toBeGreaterThan(0)
    })
  })

  describe('reparto de piezas (steppers y reasignación)', () => {
    it('el stepper "+" de un editor crea una pieza para él', () => {
      mockCreatePiezas.mockResolvedValueOnce({
        data: [{ id: 'pz-new', editor_user_id: 'u1', nombre: 'Video #1', status: 'pendiente' }],
        error: null,
      })
      const piezas = [
        { id: 'pz1', editor_user_id: 'u1', nombre: 'Video #1', status: 'pendiente', position: 0 },
      ]
      render(
        <PautaDetailModal
          {...baseProps({
            pauta: pauta({ status: 'realizada', piezas_totales: 2 }),
            piezas,
          })}
        />,
      )
      fireEvent.click(screen.getByLabelText('Agregar piezas de Lizdania'))
      expect(mockCreatePiezas).toHaveBeenCalledWith('c1', 'p1', 'u1', ['Video #2'], 1, 'V')
    })

    it('el stepper "+" se deshabilita cuando ya se repartieron todas las piezas que salieron', () => {
      mockCreatePiezas.mockClear()
      const piezas = [
        { id: 'pz1', editor_user_id: 'u1', nombre: 'Video #1', status: 'pendiente', position: 0 },
      ]
      render(
        <PautaDetailModal
          {...baseProps({
            // piezas_totales: 1 y ya hay 1 pieza repartida → no queda nada por repartir.
            pauta: pauta({ status: 'realizada', piezas_totales: 1 }),
            piezas,
          })}
        />,
      )
      const stepper = screen.getByLabelText('Agregar piezas de Lizdania')
      expect(stepper).toBeDisabled()
      fireEvent.click(stepper)
      // Un botón disabled no dispara su onClick — esto confirma que ni siquiera se intenta.
      expect(mockCreatePiezas).not.toHaveBeenCalled()
    })

    it('el "+" de dos editores comparte el mismo tope: sin faltantes, ambos quedan deshabilitados', () => {
      const piezas = [
        { id: 'pz1', editor_user_id: 'u1', nombre: 'Video #1', status: 'pendiente', position: 0 },
        { id: 'pz2', editor_user_id: 'u2', nombre: 'Video #1', status: 'pendiente', position: 1 },
      ]
      render(
        <PautaDetailModal
          {...baseProps({
            // 2 asignadas, totales 2 → nada por repartir, sin importar entre cuántos editores.
            pauta: pauta({ status: 'realizada', piezas_totales: 2 }),
            piezas,
          })}
        />,
      )
      expect(screen.getByLabelText('Agregar piezas de Lizdania')).toBeDisabled()
      expect(screen.getByLabelText('Agregar piezas de Georgina')).toBeDisabled()
      // El "−" sigue disponible: bajar la cantidad no está limitado por el total.
      expect(screen.getByLabelText('Quitar piezas de Lizdania')).not.toBeDisabled()
    })

    it('con piezas por repartir, el "+" clampea la creación a lo que realmente falta (resguardo del handler)', () => {
      mockCreatePiezas.mockClear()
      const piezas = [
        { id: 'pz1', editor_user_id: 'u1', nombre: 'Video #1', status: 'pendiente', position: 0 },
      ]
      render(
        <PautaDetailModal
          {...baseProps({
            // 1 asignada, totales 2 → queda 1 por repartir.
            pauta: pauta({ status: 'realizada', piezas_totales: 2 }),
            piezas,
          })}
        />,
      )
      const stepper = screen.getByLabelText('Agregar piezas de Lizdania')
      expect(stepper).not.toBeDisabled()
      fireEvent.click(stepper)
      // Crea exactamente 1 pieza (lo que faltaba), no más.
      expect(mockCreatePiezas).toHaveBeenCalledTimes(1)
      expect(mockCreatePiezas).toHaveBeenCalledWith('c1', 'p1', 'u1', ['Video #2'], 1, 'V')
    })

    it('el stepper "−" de un editor borra la pieza pendiente más reciente', () => {
      const piezas = [
        { id: 'pz1', editor_user_id: 'u1', nombre: 'Video #1', status: 'listo', position: 0 },
        { id: 'pz2', editor_user_id: 'u1', nombre: 'Video #2', status: 'pendiente', position: 1 },
      ]
      render(
        <PautaDetailModal
          {...baseProps({
            pauta: pauta({ status: 'realizada', piezas_totales: 2 }),
            piezas,
          })}
        />,
      )
      fireEvent.click(screen.getByLabelText('Quitar piezas de Lizdania'))
      expect(mockDeletePiezas).toHaveBeenCalledWith(['pz2'])
    })

    it('el stepper "−" con piezas ya avanzadas muestra un aviso en línea en vez de un alert del navegador', () => {
      const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {})
      const piezas = [
        { id: 'pz1', editor_user_id: 'u1', nombre: 'Video #1', status: 'listo', position: 0 },
      ]
      render(
        <PautaDetailModal
          {...baseProps({
            pauta: pauta({ status: 'realizada', piezas_totales: 1 }),
            piezas,
          })}
        />,
      )
      fireEvent.click(screen.getByLabelText('Quitar piezas de Lizdania'))
      expect(alertSpy).not.toHaveBeenCalled()
      expect(screen.getByText(/1 pieza con avance en este bloque/)).toBeInTheDocument()
      // La pieza con avance sigue ahí — nunca se borra en silencio.
      expect(mockDeletePiezas).not.toHaveBeenCalledWith(['pz1'])
      alertSpy.mockRestore()
    })

    it('"Repartir automáticamente" crea exactamente las piezas faltantes', () => {
      mockCreatePiezas.mockResolvedValueOnce({
        data: [{ id: 'pz-a', editor_user_id: 'u1', nombre: 'Video #1', status: 'pendiente' }],
        error: null,
      })
      const piezas = [
        { id: 'pz0', editor_user_id: 'u2', nombre: 'Video #1', status: 'pendiente', position: 0 },
      ]
      render(
        <PautaDetailModal
          {...baseProps({
            pauta: pauta({ status: 'realizada', piezas_totales: 2, recurso_ids: ['u2'] }),
            piezas,
          })}
        />,
      )
      fireEvent.click(screen.getByText('Repartir automáticamente'))
      // Único editor visible ('u2', el que ya tiene una pieza) recibe la 1 que falta.
      expect(mockCreatePiezas).toHaveBeenCalledWith('c1', 'p1', 'u2', ['Video #2'], 1, 'V')
    })

    it('la pieza NO repite un selector de editor — ya está agrupada bajo la tarjeta de su editor', () => {
      const piezas = [
        { id: 'pz1', editor_user_id: 'u1', nombre: 'Video #1', status: 'pendiente', position: 0 },
        { id: 'pz2', editor_user_id: 'u2', nombre: 'Video #1', status: 'pendiente', position: 1 },
      ]
      render(
        <PautaDetailModal
          {...baseProps({
            pauta: pauta({ status: 'realizada', piezas_totales: 2 }),
            piezas,
          })}
        />,
      )
      expect(screen.queryByLabelText(/^Editor de /)).not.toBeInTheDocument()
    })
  })

  describe('piezas en lote (Fotos)', () => {
    it('una pauta solo-Foto con 50 fotos repartidas muestra un único bloque "Fotos", no 50 filas', () => {
      const piezas = [
        {
          id: 'lote1',
          editor_user_id: 'u1',
          nombre: 'Fotos',
          status: 'en_edicion',
          position: 0,
          es_lote: true,
          cantidad: 50,
          listas: 32,
        },
      ]
      render(
        <PautaDetailModal
          {...baseProps({
            pauta: pauta({ status: 'realizada', formats: ['F'], piezas_totales: 50 }),
            piezas,
          })}
        />,
      )
      expect(screen.getByText('📷 Fotos')).toBeInTheDocument()
      expect(screen.queryByText('Video #1')).not.toBeInTheDocument()
      expect(screen.queryByText('Video #50')).not.toBeInTheDocument()
      expect(screen.getByText('32/50 listas')).toBeInTheDocument()
    })

    it('el stepper "asignadas" del lote actualiza `cantidad` con una sola llamada', () => {
      mockUpdatePieza.mockClear()
      const piezas = [
        {
          id: 'lote1',
          editor_user_id: 'u1',
          nombre: 'Fotos',
          status: 'pendiente',
          position: 0,
          es_lote: true,
          cantidad: 10,
          listas: 0,
        },
      ]
      render(
        <PautaDetailModal
          {...baseProps({
            // 10 asignadas, totales 20 → quedan 10 por repartir.
            pauta: pauta({ status: 'realizada', formats: ['F'], piezas_totales: 20 }),
            piezas,
          })}
        />,
      )
      fireEvent.click(screen.getByLabelText('Agregar fotos asignadas a Lizdania'))
      expect(mockUpdatePieza).toHaveBeenCalledTimes(1)
      expect(mockUpdatePieza).toHaveBeenCalledWith('lote1', { cantidad: 11 })
    })

    it('"completar todas" deja `listas` igual a `cantidad`', () => {
      mockUpdatePieza.mockClear()
      const piezas = [
        {
          id: 'lote1',
          editor_user_id: 'u1',
          nombre: 'Fotos',
          status: 'en_edicion',
          position: 0,
          es_lote: true,
          cantidad: 5,
          listas: 2,
        },
      ]
      render(
        <PautaDetailModal
          {...baseProps({
            pauta: pauta({ status: 'realizada', formats: ['F'], piezas_totales: 5 }),
            piezas,
          })}
        />,
      )
      fireEvent.click(screen.getByText('✓ completar todas'))
      expect(mockUpdatePieza).toHaveBeenCalledWith('lote1', { listas: 5 })
    })

    it('bajar "asignadas" por debajo de lo ya listo no se permite — muestra aviso en vez de reducir', () => {
      mockUpdatePieza.mockClear()
      const piezas = [
        {
          id: 'lote1',
          editor_user_id: 'u1',
          nombre: 'Fotos',
          status: 'listo',
          position: 0,
          es_lote: true,
          cantidad: 5,
          listas: 5,
        },
      ]
      render(
        <PautaDetailModal
          {...baseProps({
            pauta: pauta({ status: 'realizada', formats: ['F'], piezas_totales: 5 }),
            piezas,
          })}
        />,
      )
      fireEvent.click(screen.getByLabelText('Quitar fotos asignadas a Lizdania'))
      expect(mockUpdatePieza).not.toHaveBeenCalled()
      expect(
        screen.getByText('No se puede bajar de las fotos ya marcadas como listas en este lote.'),
      ).toBeInTheDocument()
    })

    it('una pauta mixta Video+Foto muestra el checklist de video y además el bloque de Fotos', () => {
      const piezas = [
        { id: 'pz1', editor_user_id: 'u1', nombre: 'Video #1', status: 'pendiente', position: 0 },
        {
          id: 'lote1',
          editor_user_id: 'u1',
          nombre: 'Fotos',
          status: 'pendiente',
          position: 1,
          es_lote: true,
          cantidad: 3,
          listas: 0,
        },
      ]
      render(
        <PautaDetailModal
          {...baseProps({
            pauta: pauta({ status: 'realizada', formats: ['V', 'F'], piezas_totales: 5 }),
            piezas,
          })}
        />,
      )
      expect(screen.getByDisplayValue('Video #1')).toBeInTheDocument()
      expect(screen.getByText('📷 Fotos')).toBeInTheDocument()
    })
  })
})
