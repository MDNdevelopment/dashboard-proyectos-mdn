import {
  ASSIGNMENT_ROLES,
  NO_STATUS,
  PIECE_LABELS,
  PIECE_STATUSES,
  STATUSES_BY_TYPE,
  addableTypes,
  allowedAssignees,
  allowedPieceTypes,
  clientsWithPending,
  computeTemporadaSummary,
  indexAssignments,
  indexPieces,
  isDone,
  mappiAssignee,
  piecesFor,
  resolveAssignee,
  slotsOf,
  statusLabel,
  statusMetaFor,
  statusOptionsFor,
} from '../utils/temporada'

const POST = { key: '2026-12-24', label: '24/12', kind: 'post' }
const TARJETA = { key: 'tarjeta_navidad', label: 'Tarjeta navidad', kind: 'tarjeta' }

const piece = (over) => ({
  id: Math.random().toString(36).slice(2),
  client_id: 'c1',
  slot_key: POST.key,
  piece_type: 'diseno',
  status: null,
  ...over,
})

describe('formatos y estados: los mismos que la hoja', () => {
  it('los formatos se llaman como en el desplegable FORMATO', () => {
    expect(PIECE_LABELS).toEqual({
      diseno: 'Diseño',
      foto: 'Audiovisual - Foto',
      reel: 'Audiovisual - Reel',
    })
  })

  it('DISEÑO (y las tarjetas) ofrece la lista de la hoja', () => {
    expect(STATUSES_BY_TYPE.diseno.map(statusLabel)).toEqual([
      'Pendiente por redes',
      'Enviado a diseño',
      'En modificación',
      'Enviado al cliente',
      'Aprobado',
      'Pendiente cliente',
    ])
  })

  it('AUDIOVISUAL (foto y reel) ofrece la lista de la hoja', () => {
    const esperado = [
      'Pendiente por grabar',
      'Agendado',
      'En edición',
      'Enviado al cliente',
      'Aprobado',
      'Pendiente cliente',
      'En diseño',
    ]
    expect(STATUSES_BY_TYPE.foto.map(statusLabel)).toEqual(esperado)
    expect(STATUSES_BY_TYPE.reel.map(statusLabel)).toEqual(esperado)
  })

  it('«N/A» no es un estado: es no tener la pieza', () => {
    expect(PIECE_STATUSES.map(statusLabel)).not.toContain('N/A')
  })

  it('el menú de cada tipo empieza por «Sin estado» (celda en blanco)', () => {
    expect(statusOptionsFor('reel')[0]).toBe(NO_STATUS)
    expect(statusLabel(NO_STATUS)).toBe('Sin estado')
    expect(statusLabel(null)).toBe('Sin estado')
    expect(statusOptionsFor('diseno')).toHaveLength(STATUSES_BY_TYPE.diseno.length + 1)
  })

  it('statusMetaFor trae clases literales para cada opción', () => {
    for (const type of ['diseno', 'foto', 'reel']) {
      const meta = statusMetaFor(type)
      expect(Object.keys(meta)).toEqual(statusOptionsFor(type))
      for (const m of Object.values(meta)) {
        expect(m.bg).toMatch(/^bg-\[#/)
        expect(m.dot).toMatch(/^bg-\[#/)
      }
    }
  })
})

describe('isDone', () => {
  it('solo «Aprobado» cuenta como terminado; sin estado no', () => {
    expect(isDone('aprobado')).toBe(true)
    expect(isDone('enviado_cliente')).toBe(false)
    expect(isDone('pendiente_cliente')).toBe(false)
    expect(isDone(null)).toBe(false)
  })
})

describe('slotsOf', () => {
  it('tolera una temporada sin slots o mal formada', () => {
    expect(slotsOf(null)).toEqual([])
    expect(slotsOf({ slots: null })).toEqual([])
    expect(slotsOf({ slots: [POST] })).toEqual([POST])
  })
})

describe('allowedPieceTypes / addableTypes', () => {
  it('una tarjeta solo admite diseño; una fecha admite los tres', () => {
    expect(allowedPieceTypes(TARJETA)).toEqual(['diseno'])
    expect(allowedPieceTypes(POST)).toEqual(['diseno', 'foto', 'reel'])
  })

  it('ofrece solo los tipos que todavía no existen en la celda', () => {
    expect(addableTypes(POST, [piece({ piece_type: 'foto' })])).toEqual(['diseno', 'reel'])
    expect(addableTypes(TARJETA, [piece({ slot_key: TARJETA.key })])).toEqual([])
  })
})

describe('indexPieces / piecesFor', () => {
  it('agrupa por cliente y slot, ordenado diseño → foto → reel', () => {
    const index = indexPieces([
      piece({ piece_type: 'reel' }),
      piece({ piece_type: 'diseno' }),
      piece({ client_id: 'c2', piece_type: 'foto' }),
    ])
    expect(piecesFor(index, 'c1', POST.key).map((p) => p.piece_type)).toEqual(['diseno', 'reel'])
    expect(piecesFor(index, 'c2', POST.key)).toHaveLength(1)
    expect(piecesFor(index, 'c3', POST.key)).toEqual([])
  })
})

describe('clientsWithPending', () => {
  it('deja solo las cuentas con alguna pieza sin terminar', () => {
    const clients = [{ id: 'c1' }, { id: 'c2' }, { id: 'c3' }]
    const pieces = [
      piece({ client_id: 'c1', status: 'aprobado' }),
      piece({ client_id: 'c2', status: 'aprobado' }),
      piece({ client_id: 'c2', piece_type: 'reel', status: 'en_edicion' }),
    ]
    expect(clientsWithPending(clients, pieces).map((c) => c.id)).toEqual(['c2'])
  })
})

describe('computeTemporadaSummary', () => {
  const slots = [POST, TARJETA]

  it('sin piezas el porcentaje es null, no 0%', () => {
    const s = computeTemporadaSummary([{ id: 'c1' }], [], slots)
    expect(s.totalPiezas).toBe(0)
    expect(s.pctAprobado).toBeNull()
    expect(s.bySlot.every((x) => x.pct === null)).toBe(true)
  })

  it('cuenta solo las piezas de las cuentas en alcance', () => {
    const pieces = [
      piece({ client_id: 'c1', status: 'aprobado' }),
      piece({ client_id: 'c1', piece_type: 'reel', status: 'enviado_cliente' }),
      piece({ client_id: 'c1', slot_key: TARJETA.key, status: 'aprobado' }),
      piece({ client_id: 'otra-linea', status: 'aprobado' }),
    ]
    const s = computeTemporadaSummary([{ id: 'c1' }], pieces, slots)
    expect(s.totalPiezas).toBe(3)
    expect(s.terminadas).toBe(2)
    expect(s.pendientes).toBe(1)
    expect(s.pctAprobado).toBe(67)
    expect(s.bySlot).toEqual([
      { key: POST.key, label: '24/12', total: 2, done: 1, pct: 50 },
      { key: TARJETA.key, label: 'Tarjeta navidad', total: 1, done: 1, pct: 100 },
    ])
  })
})

describe('personal asignado', () => {
  const client = { id: 'c1', social_manager_id: 'u-sm' }
  const line = { id: 'l1', lead_user_id: 'u-jefe' }

  it('hay 2 casillas con nombre, como la hoja: jefe y SM', () => {
    expect(ASSIGNMENT_ROLES).toEqual(['jefe', 'sm'])
  })

  it('el valor de MAPPI sale de la línea (jefe) y del cliente (SM)', () => {
    expect(mappiAssignee('jefe', client, line)).toBe('u-jefe')
    expect(mappiAssignee('sm', client, line)).toBe('u-sm')
  })

  it('tolera línea o cliente sin esos datos', () => {
    expect(mappiAssignee('jefe', client, undefined)).toBeNull()
    expect(mappiAssignee('sm', { id: 'c2' }, line)).toBeNull()
    expect(mappiAssignee('disenador', client, line)).toBeNull()
  })

  it('sin asignación manual usa MAPPI', () => {
    const r = resolveAssignee(indexAssignments([]), 'sm', client, line)
    expect(r).toEqual({ userId: 'u-sm', overridden: false, mappiUserId: 'u-sm' })
  })

  it('con asignación manual manda ella, y «sin asignar» (null) también', () => {
    const index = indexAssignments([
      { client_id: 'c1', role: 'sm', user_id: 'u-otro' },
      { client_id: 'c1', role: 'jefe', user_id: null },
      { client_id: 'c9', role: 'sm', user_id: 'u-x' },
    ])
    expect(resolveAssignee(index, 'sm', client, line)).toEqual({
      userId: 'u-otro',
      overridden: true,
      mappiUserId: 'u-sm',
    })
    expect(resolveAssignee(index, 'jefe', client, line).userId).toBeNull()
    expect(resolveAssignee(index, 'jefe', client, line).overridden).toBe(true)
    // La asignación de otro cliente no se mezcla.
    expect(resolveAssignee(index, 'sm', { id: 'c9' }, line).userId).toBe('u-x')
    expect(resolveAssignee(index, 'sm', { id: 'c3', social_manager_id: 'u-m3' }, line).userId).toBe(
      'u-m3',
    )
  })
})

describe('allowedAssignees: solo las personas del desplegable de la hoja', () => {
  const users = [
    { user_id: '1', first_name: 'Sabrina', last_name: 'B' },
    { user_id: '2', first_name: 'Jesús ', last_name: 'G' },
    { user_id: '3', first_name: 'Maria Fernanda', last_name: 'G' },
    { user_id: '4', first_name: 'Pedro', last_name: 'P' },
    { user_id: '5', first_name: 'Katherine', last_name: 'M', deleted_at: '2026-01-01' },
    { user_id: '6', first_name: 'Maria', last_name: 'Altuve' },
  ]
  const ids = (list) => list.map((u) => u.user_id)

  it('empareja por nombre de pila sin tildes ni espacios, y excluye archivados', () => {
    expect(ids(allowedAssignees('jefe', users))).toEqual(['1', '2'])
  })

  it('cada casilla tiene su propia lista (SM incluye a Maria Fernanda)', () => {
    expect(ids(allowedAssignees('sm', users))).toEqual(['1', '2', '3'])
  })

  it('no empareja nombres parciales', () => {
    expect(ids(allowedAssignees('sm', users))).not.toContain('6')
  })

  it('conserva a la persona ya asignada aunque esté fuera de la lista o archivada', () => {
    expect(ids(allowedAssignees('jefe', users, '4'))).toContain('4')
    expect(ids(allowedAssignees('jefe', users, '5'))).toContain('5')
  })

  it('un rol desconocido no ofrece a nadie', () => {
    expect(allowedAssignees('otro', users)).toEqual([])
  })
})
