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

/** Textos tal cual el desplegable FORMATO de la hoja. */
export const PIECE_LABELS = {
  diseno: 'Diseño',
  foto: 'Audiovisual - Foto',
  reel: 'Audiovisual - Reel',
}

/**
 * Estados que ofrece la hoja. La columna DISEÑO (y las tarjetas) y la columna AUDIOVISUAL
 * tienen listas distintas. «N/A» no es un estado: es no tener la pieza (se quita con la ×).
 * Una pieza sin estado equivale a la celda en blanco de la hoja.
 */
const DESIGN_STATUSES = [
  'pendiente_redes',
  'enviado_diseno',
  'en_modificacion',
  'enviado_cliente',
  'aprobado',
  'pendiente_cliente',
]
const AUDIOVISUAL_STATUSES = [
  'pendiente_grabar',
  'agendado',
  'en_edicion',
  'enviado_cliente',
  'aprobado',
  'pendiente_cliente',
  'en_diseno',
]

/** Estados permitidos por tipo de pieza (foto y reel comparten la lista AUDIOVISUAL). */
export const STATUSES_BY_TYPE = {
  diseno: DESIGN_STATUSES,
  foto: AUDIOVISUAL_STATUSES,
  reel: AUDIOVISUAL_STATUSES,
}

/** Todos los estados posibles (filtros y validación), sin repetir. */
export const PIECE_STATUSES = [...new Set([...DESIGN_STATUSES, ...AUDIOVISUAL_STATUSES])]

/** Valor del menú para «sin estado» (celda en blanco); se guarda como null. */
export const NO_STATUS = ''

/** Estados que cuentan como pieza terminada para los KPIs. */
export const DONE_STATUSES = ['aprobado']

// Clases Tailwind LITERALES (StatusPill no admite clases armadas en runtime).
const STATUS_STYLE = {
  [NO_STATUS]: {
    label: 'Sin estado',
    bg: 'bg-[#f5f3eb]',
    text: 'text-[#888]',
    dot: 'bg-[#ccc]',
  },
  pendiente_redes: {
    label: 'Pendiente por redes',
    bg: 'bg-[#fff4d6]',
    text: 'text-[#8a6100]',
    dot: 'bg-[#FFB800]',
  },
  enviado_diseno: {
    label: 'Enviado a diseño',
    bg: 'bg-[#e0e7ff]',
    text: 'text-[#4338ca]',
    dot: 'bg-[#6366f1]',
  },
  en_modificacion: {
    label: 'En modificación',
    bg: 'bg-[#ffe4e6]',
    text: 'text-[#be123c]',
    dot: 'bg-[#f43f5e]',
  },
  enviado_cliente: {
    label: 'Enviado al cliente',
    bg: 'bg-[#f3e8ff]',
    text: 'text-[#7e22ce]',
    dot: 'bg-[#a855f7]',
  },
  aprobado: { label: 'Aprobado', bg: 'bg-[#dcfce7]', text: 'text-[#15803d]', dot: 'bg-[#22c55e]' },
  pendiente_cliente: {
    label: 'Pendiente cliente',
    bg: 'bg-[#ffedd5]',
    text: 'text-[#c2410c]',
    dot: 'bg-[#f97316]',
  },
  pendiente_grabar: {
    label: 'Pendiente por grabar',
    bg: 'bg-[#fff4d6]',
    text: 'text-[#8a6100]',
    dot: 'bg-[#FFB800]',
  },
  agendado: { label: 'Agendado', bg: 'bg-[#ccfbf1]', text: 'text-[#0f766e]', dot: 'bg-[#14b8a6]' },
  en_edicion: {
    label: 'En edición',
    bg: 'bg-[#e8f0fe]',
    text: 'text-[#1d4ed8]',
    dot: 'bg-[#3b82f6]',
  },
  en_diseno: {
    label: 'En diseño',
    bg: 'bg-[#e0e7ff]',
    text: 'text-[#4338ca]',
    dot: 'bg-[#6366f1]',
  },
}

/** Etiqueta legible de un estado (null/'' = «Sin estado»). */
export function statusLabel(status) {
  return STATUS_STYLE[status ?? NO_STATUS]?.label ?? status
}

/** Opciones del menú de estado de un tipo de pieza: «Sin estado» + los de la hoja. */
export function statusOptionsFor(pieceType) {
  return [NO_STATUS, ...(STATUSES_BY_TYPE[pieceType] ?? [])]
}

/** Mapa `meta` para `StatusPill` con los estados de ese tipo de pieza. */
export function statusMetaFor(pieceType) {
  const meta = {}
  for (const key of statusOptionsFor(pieceType)) meta[key] = STATUS_STYLE[key]
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

// ─── Personal asignado a mano ──────────────────────────────────────────────────────────

/**
 * Casillas con nombre de empleado: las dos que tiene la hoja (JEFE y SM). Cada una arranca
 * con lo que ya hay en MAPPI y se puede cambiar solo para la temporada
 * (`seasonal_assignments`).
 */
export const ASSIGNMENT_ROLES = ['jefe', 'sm']

export const ASSIGNMENT_LABELS = { jefe: 'Jefe', sm: 'SM' }

/** Sentinela: «volver a la persona de MAPPI» (quita la asignación manual). */
export const USE_MAPPI = '__mappi__'

/** Personas que ofrecen los desplegables JEFE y SM de la hoja (por nombre de pila). */
export const SHEET_ASSIGNEES = {
  jefe: [
    'Mayber',
    'Sabrina',
    'Georgina',
    'Katherine',
    'Paola',
    'Stephanie',
    'Jesus',
    'Daniellys',
    'Bianca',
  ],
  sm: [
    'Celeste',
    'Valeria',
    'Daniellys',
    'Bianca',
    'Nairim',
    'Mayber',
    'Sabrina',
    'Georgina',
    'Katherine',
    'Paola',
    'Stephanie',
    'Jesus',
    'Maria Jose',
    'Madeleine',
    'Maria Fernanda',
    'Luisa Fernanda',
    'Damilis',
    'Carlos',
  ],
}

const normalizeName = (name) =>
  (name ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase()

/**
 * Empleados que se pueden elegir en una casilla: los activos cuyo nombre de pila está en el
 * desplegable de la hoja, más la persona ya asignada (aunque esté fuera de la lista o
 * archivada) para no perderla.
 */
export function allowedAssignees(role, users, keepUserId = null) {
  const names = new Set((SHEET_ASSIGNEES[role] ?? []).map(normalizeName))
  return users.filter(
    (u) => u.user_id === keepUserId || (!u.deleted_at && names.has(normalizeName(u.first_name))),
  )
}

/**
 * Valor de MAPPI para una casilla: jefe = líder de la línea; SM = el del cliente.
 * @returns {string|null} user_id
 */
export function mappiAssignee(role, client, line) {
  if (role === 'jefe') return line?.lead_user_id ?? null
  if (role === 'sm') return client?.social_manager_id ?? null
  return null
}

/** Índice `clientId|role` → asignación manual. */
export function indexAssignments(assignments) {
  const index = new Map()
  for (const a of assignments) index.set(`${a.client_id}|${a.role}`, a)
  return index
}

/**
 * Quién va en la casilla: la asignación manual si existe (aunque sea «sin asignar»); si no,
 * el valor de MAPPI.
 * @returns {{ userId: string|null, overridden: boolean, mappiUserId: string|null }}
 */
export function resolveAssignee(index, role, client, line) {
  const mappiUserId = mappiAssignee(role, client, line)
  const manual = index.get(`${client.id}|${role}`)
  if (manual) return { userId: manual.user_id ?? null, overridden: true, mappiUserId }
  return { userId: mappiUserId, overridden: false, mappiUserId }
}
