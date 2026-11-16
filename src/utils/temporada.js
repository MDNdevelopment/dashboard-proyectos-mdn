/**
 * Lógica pura del «Chequeo de temporada» (Gestión de Tareas → Chequeo → Temporada).
 *
 * Una temporada (`seasonal_campaigns`) define sus slots: fechas de publicación (`post`) y
 * tarjetas (`tarjeta`). Cada cliente tiene, por slot, cero o más piezas
 * (`seasonal_pieces`: diseño, foto o reel) con su propio estado. La grilla se deriva de las
 * piezas que existen: no hay "N/A" guardado, una pieza que no aplica simplemente no existe.
 * Todo es puro y testeable: no toca Supabase ni el DOM.
 */

export const PIECE_TYPES = ['diseno', 'foto', 'reel']

export const PIECE_LABELS = { diseno: 'Diseño', foto: 'Foto', reel: 'Reel' }

/** Orden de avance de una pieza; también el orden del menú de StatusPill. */
export const PIECE_STATUSES = [
  'pendiente',
  'en_produccion',
  'en_edicion',
  'enviado_cliente',
  'ajustes',
  'aprobado',
  'publicado',
]

/** Estados que cuentan como pieza terminada para los KPIs. */
export const DONE_STATUSES = ['aprobado', 'publicado']

/**
 * La etiqueta del estado "en producción" depende del tipo de pieza: «grabar» es solo para
 * video (Reel); una foto se «captura» y un diseño «está en diseño».
 */
const PRODUCTION_LABEL = {
  reel: 'Por grabar',
  foto: 'Por capturar',
  diseno: 'En diseño',
}

// Clases Tailwind LITERALES (StatusPill no admite clases armadas en runtime).
const STATUS_STYLE = {
  pendiente: { label: 'Pendiente', bg: 'bg-[#f5f3eb]', text: 'text-[#666]', dot: 'bg-[#bbb]' },
  en_produccion: { bg: 'bg-[#fff4d6]', text: 'text-[#8a6100]', dot: 'bg-[#FFB800]' },
  en_edicion: {
    label: 'En edición',
    bg: 'bg-[#e8f0fe]',
    text: 'text-[#1d4ed8]',
    dot: 'bg-[#3b82f6]',
  },
  enviado_cliente: {
    label: 'Enviado al cliente',
    bg: 'bg-[#f3e8ff]',
    text: 'text-[#7e22ce]',
    dot: 'bg-[#a855f7]',
  },
  ajustes: { label: 'Ajustes', bg: 'bg-[#ffe4e6]', text: 'text-[#be123c]', dot: 'bg-[#f43f5e]' },
  aprobado: { label: 'Aprobado', bg: 'bg-[#dcfce7]', text: 'text-[#15803d]', dot: 'bg-[#22c55e]' },
  publicado: {
    label: 'Publicado',
    bg: 'bg-[#d1fae5]',
    text: 'text-[#047857]',
    dot: 'bg-[#10b981]',
  },
}

/** Etiqueta legible de un estado para un tipo de pieza dado. */
export function statusLabel(status, pieceType) {
  if (status === 'en_produccion') return PRODUCTION_LABEL[pieceType] ?? 'En producción'
  return STATUS_STYLE[status]?.label ?? status
}

/** Mapa `meta` para `StatusPill` ya con las etiquetas del tipo de pieza. */
export function statusMetaFor(pieceType) {
  const meta = {}
  for (const key of PIECE_STATUSES) {
    meta[key] = { ...STATUS_STYLE[key], label: statusLabel(key, pieceType) }
  }
  return meta
}

export function isDone(status) {
  return DONE_STATUSES.includes(status)
}

/** Slots de la temporada, tolerando `slots` nulo o mal formado. */
export function slotsOf(campaign) {
  return Array.isArray(campaign?.slots) ? campaign.slots : []
}

/**
 * Tipos de pieza que admite un slot: las tarjetas son siempre una pieza de diseño; las
 * fechas de publicación admiten diseño, foto y reel.
 */
export function allowedPieceTypes(slot) {
  return slot?.kind === 'tarjeta' ? ['diseno'] : PIECE_TYPES
}

/** Índice `clientId|slotKey` → piezas, ordenadas por tipo (diseño, foto, reel). */
export function indexPieces(pieces) {
  const index = new Map()
  for (const p of pieces) {
    const key = `${p.client_id}|${p.slot_key}`
    if (!index.has(key)) index.set(key, [])
    index.get(key).push(p)
  }
  for (const list of index.values()) {
    list.sort((a, b) => PIECE_TYPES.indexOf(a.piece_type) - PIECE_TYPES.indexOf(b.piece_type))
  }
  return index
}

export function piecesFor(index, clientId, slotKey) {
  return index.get(`${clientId}|${slotKey}`) ?? []
}

/** Tipos que aún se pueden agregar a una celda (los que admite el slot y no existen ya). */
export function addableTypes(slot, existingPieces) {
  const taken = new Set(existingPieces.map((p) => p.piece_type))
  return allowedPieceTypes(slot).filter((t) => !taken.has(t))
}

/** Clientes con al menos una pieza sin terminar (filtro «solo pendientes»). */
export function clientsWithPending(clients, pieces) {
  const pendingIds = new Set(pieces.filter((p) => !isDone(p.status)).map((p) => p.client_id))
  return clients.filter((c) => pendingIds.has(c.id))
}

/**
 * KPIs de la temporada para las cuentas en alcance. `pctAprobado` es null si todavía no hay
 * piezas (evita mostrar 0% como si fuera avance real).
 * @returns {{ totalPiezas, terminadas, pendientes, pctAprobado, bySlot: Array }}
 */
export function computeTemporadaSummary(clients, pieces, slots) {
  const ids = new Set(clients.map((c) => c.id))
  const scoped = pieces.filter((p) => ids.has(p.client_id))
  const terminadas = scoped.filter((p) => isDone(p.status)).length
  const bySlot = slots.map((slot) => {
    const slotPieces = scoped.filter((p) => p.slot_key === slot.key)
    const done = slotPieces.filter((p) => isDone(p.status)).length
    return {
      key: slot.key,
      label: slot.label,
      total: slotPieces.length,
      done,
      pct: slotPieces.length ? Math.round((done / slotPieces.length) * 100) : null,
    }
  })
  return {
    totalPiezas: scoped.length,
    terminadas,
    pendientes: scoped.length - terminadas,
    pctAprobado: scoped.length ? Math.round((terminadas / scoped.length) * 100) : null,
    bySlot,
  }
}
