import { describe, it, expect } from 'vitest'
import {
  ASSIGNMENT_ROLES,
  PIECE_STATUSES,
  addableTypes,
  allowedPieceTypes,
  clientsWithPending,
  computeTemporadaSummary,
  indexAssignments,
  indexPieces,
  mappiAssignee,
  resolveAssignee,
  isDone,
  piecesFor,
  slotsOf,
  statusLabel,
  statusMetaFor,
} from '../utils/temporada'

const POST = { key: '2026-12-24', label: '24/12', kind: 'post' }
const TARJETA = { key: 'tarjeta_navidad', label: 'Tarjeta navidad', kind: 'tarjeta' }

const piece = (over) => ({
  id: Math.random().toString(36).slice(2),
  client_id: 'c1',
  slot_key: POST.key,
  piece_type: 'diseno',
  status: 'pendiente',
  ...over,
})

describe('statusLabel', () => {
  it('«en producción» se llama «grabar» solo para Reel', () => {
    expect(statusLabel('en_produccion', 'reel')).toBe('Por grabar')
    expect(statusLabel('en_produccion', 'foto')).toBe('Por capturar')
    expect(statusLabel('en_produccion', 'diseno')).toBe('En diseño')
  })

  it('los demás estados no dependen del tipo', () => {
    expect(statusLabel('aprobado', 'reel')).toBe('Aprobado')
    expect(statusLabel('enviado_cliente', 'foto')).toBe('Enviado al cliente')
  })
})

describe('statusMetaFor', () => {
  it('trae todos los estados con clases literales y la etiqueta del tipo', () => {
    const meta = statusMetaFor('reel')
    expect(Object.keys(meta)).toEqual(PIECE_STATUSES)
    expect(meta.en_produccion.label).toBe('Por grabar')
    for (const m of Object.values(meta)) {
      expect(m.bg).toMatch(/^bg-\[#/)
      expect(m.dot).toMatch(/^bg-\[#/)
    }
  })
})

describe('isDone', () => {
  it('aprobado y publicado cuentan como terminados', () => {
    expect(isDone('aprobado')).toBe(true)
    expect(isDone('publicado')).toBe(true)
    expect(isDone('enviado_cliente')).toBe(false)
    expect(isDone('pendiente')).toBe(false)
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
      piece({ client_id: 'c1', piece_type: 'reel', status: 'pendiente' }),
      piece({ client_id: 'c1', slot_key: TARJETA.key, status: 'publicado' }),
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
  const client = {
    id: 'c1',
    social_manager_id: 'u-sm',
    designer_id: 'u-dis',
    audiovisual_ids: ['u-av', 'u-av2'],
  }
  const line = { id: 'l1', lead_user_id: 'u-jefe' }

  it('hay 4 casillas: jefe, SM, diseño y audiovisual', () => {
    expect(ASSIGNMENT_ROLES).toEqual(['jefe', 'sm', 'disenador', 'audiovisual'])
  })

  it('el valor de MAPPI sale de la línea (jefe) y del cliente (el resto)', () => {
    expect(mappiAssignee('jefe', client, line)).toBe('u-jefe')
    expect(mappiAssignee('sm', client, line)).toBe('u-sm')
    expect(mappiAssignee('disenador', client, line)).toBe('u-dis')
    expect(mappiAssignee('audiovisual', client, line)).toBe('u-av')
  })

  it('tolera línea o recursos ausentes', () => {
    expect(mappiAssignee('jefe', client, undefined)).toBeNull()
    expect(mappiAssignee('audiovisual', { id: 'c2', audiovisual_ids: [] }, line)).toBeNull()
    expect(mappiAssignee('audiovisual', { id: 'c2' }, line)).toBeNull()
    expect(mappiAssignee('otro', client, line)).toBeNull()
  })

  it('sin asignación manual usa MAPPI', () => {
    const r = resolveAssignee(indexAssignments([]), 'sm', client, line)
    expect(r).toEqual({ userId: 'u-sm', overridden: false, mappiUserId: 'u-sm' })
  })

  it('con asignación manual manda ella, y «sin asignar» (null) también', () => {
    const index = indexAssignments([
      { client_id: 'c1', role: 'sm', user_id: 'u-otro' },
      { client_id: 'c1', role: 'jefe', user_id: null },
      { client_id: 'c9', role: 'disenador', user_id: 'u-x' },
    ])
    expect(resolveAssignee(index, 'sm', client, line)).toEqual({
      userId: 'u-otro',
      overridden: true,
      mappiUserId: 'u-sm',
    })
    expect(resolveAssignee(index, 'jefe', client, line).userId).toBeNull()
    expect(resolveAssignee(index, 'jefe', client, line).overridden).toBe(true)
    // La asignación de otro cliente no se mezcla.
    expect(resolveAssignee(index, 'disenador', client, line).userId).toBe('u-dis')
  })
})
