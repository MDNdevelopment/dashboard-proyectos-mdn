/**
 * Lógica pura del «Chequeo de temporada» (Gestión de Tareas → Chequeo → Temporada).
 *
 * Una temporada (`seasonal_campaigns`) define sus slots: fechas de publicación (`post`) y
 * tarjetas (`tarjeta`). Cada cliente tiene, por slot, UNA fila (`seasonal_pieces`) con tres
 * columnas, igual que la hoja: `formato` (diseño / foto / reel), `diseno_status` y
 * `audiovisual_status`. Las tarjetas solo usan `diseno_status`. «N/A» es un valor guardado
 * (`na`); una columna sin tocar es null (celda en blanco).
 * Todo es puro y testeable: no toca Supabase ni el DOM.
 */

export const FORMATOS = ['diseno', 'foto', 'reel']

/** Textos tal cual el desplegable FORMATO de la hoja. */
export const FORMATO_LABELS = {
  diseno: 'Diseño',
  foto: 'Audiovisual - Foto',
  reel: 'Audiovisual - Reel',
}

/** «N/A»: la columna no aplica a ese cliente en esa fecha. No cuenta como pieza. */
export const NA_STATUS = 'na'

/**
 * Estados que ofrece la hoja. DISEÑO (y las tarjetas) y AUDIOVISUAL tienen listas distintas;
 * las dos empiezan por «N/A». Una columna sin estado (null) equivale a la celda en blanco.
 */
const DESIGN_STATUSES = [
  NA_STATUS,
  'pendiente_redes',
  'enviado_diseno',
  'en_modificacion',
  'enviado_cliente',
  'aprobado',
  'pendiente_cliente',
]
const AUDIOVISUAL_STATUSES = [
  NA_STATUS,
  'pendiente_grabar',
  'agendado',
  'en_edicion',
  'enviado_cliente',
  'aprobado',
  'pendiente_cliente',
  'en_diseno',
]

/** Opciones del menú de cada columna de estado. */
export const STATUSES_BY_FIELD = {
  diseno_status: DESIGN_STATUSES,
  audiovisual_status: AUDIOVISUAL_STATUSES,
}

/** Todos los estados posibles (filtro de la página), sin repetir. */
export const ALL_STATUSES = [...new Set([...DESIGN_STATUSES, ...AUDIOVISUAL_STATUSES])]

/** Valor del menú para «sin valor» (celda en blanco); se guarda como null. */
export const NO_STATUS = ''

/** Estados que cuentan como pieza terminada para los KPIs. */
export const DONE_STATUSES = ['aprobado']

// Clases Tailwind LITERALES (StatusPill no admite clases armadas en runtime).
/** `meta` de `StatusPill` para los estados (incluida la celda en blanco, que se muestra pero no se elige). */
export const STATUS_META = {
  [NO_STATUS]: {
    label: 'Sin estado',
    bg: 'bg-[#f5f3eb]',
    text: 'text-[#888]',
    dot: 'bg-[#ccc]',
  },
  [NA_STATUS]: { label: 'N/A', bg: 'bg-[#eceae0]', text: 'text-[#555]', dot: 'bg-[#999]' },
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
  // Verde sólido con letras blancas (el punto es claro para verse sobre el verde y en el menú).
  aprobado: { label: 'Aprobado', bg: 'bg-[#16a34a]', text: 'text-white', dot: 'bg-[#4ade80]' },
  pendiente_cliente: {
    label: 'Pendiente cliente',
    bg: 'bg-[#fee2e2]',
    text: 'text-[#dc2626]',
    dot: 'bg-[#dc2626]',
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

/** `meta` de `StatusPill` para la columna FORMATO. */
export const FORMATO_META = {
  [NO_STATUS]: {
    label: 'Sin formato',
    bg: 'bg-[#f5f3eb]',
    text: 'text-[#888]',
    dot: 'bg-[#ccc]',
  },
  diseno: { label: 'Diseño', bg: 'bg-[#e0e7ff]', text: 'text-[#4338ca]', dot: 'bg-[#6366f1]' },
  foto: {
    label: 'Audiovisual - Foto',
    bg: 'bg-[#ffedd5]',
    text: 'text-[#9a3412]',
    dot: 'bg-[#f97316]',
  },
  reel: {
    label: 'Audiovisual - Reel',
    bg: 'bg-[#fce7f3]',
    text: 'text-[#be185d]',
    dot: 'bg-[#ec4899]',
  },
}

/** Etiqueta legible de un estado (null/'' = «Sin estado»). */
export function statusLabel(status) {
  return STATUS_META[status ?? NO_STATUS]?.label ?? status
}

export function isDone(status) {
  return DONE_STATUSES.includes(status)
}

/** Slots de la temporada, tolerando `slots` nulo o mal formado. */
export function slotsOf(campaign) {
  return Array.isArray(campaign?.slots) ? campaign.slots : []
}

/** Una fecha de publicación lleva Formato + Diseño + Audiovisual; una tarjeta solo un estado. */
export function isTarjeta(slot) {
  return slot?.kind === 'tarjeta'
}

/** Columnas de estado que usa un slot (las tarjetas son siempre una pieza de diseño). */
export function statusFieldsFor(slot) {
  return isTarjeta(slot) ? ['diseno_status'] : ['diseno_status', 'audiovisual_status']
}

/**
 * Estados que cuentan como pieza en una fila: los de las columnas del slot que tienen valor
 * y no son N/A.
 */
export function countedStatuses(row, slot) {
  return statusFieldsFor(slot)
    .map((f) => row?.[f])
    .filter((s) => s && s !== NA_STATUS)
}

/** Índice `clientId|slotKey` → fila. */
export function indexRows(rows) {
  const index = new Map()
  for (const r of rows) index.set(`${r.client_id}|${r.slot_key}`, r)
  return index
}

export function rowFor(index, clientId, slotKey) {
  return index.get(`${clientId}|${slotKey}`) ?? null
}

/** Estados (con valor) de todas las columnas de una cuenta, para filtrar por estado. */
function clientStatuses(rows, slotsByKey, clientId, { counted }) {
  const out = []
  for (const r of rows) {
    if (r.client_id !== clientId) continue
    const slot = slotsByKey.get(r.slot_key)
    if (!slot) continue
    if (counted) out.push(...countedStatuses(r, slot))
    else
      out.push(
        ...statusFieldsFor(slot)
          .map((f) => r[f])
          .filter(Boolean),
      )
  }
  return out
}

/** ¿La cuenta tiene alguna columna en ese estado (incluido N/A)? */
export function clientHasStatus(rows, slots, clientId, status) {
  const slotsByKey = new Map(slots.map((s) => [s.key, s]))
  return clientStatuses(rows, slotsByKey, clientId, { counted: false }).includes(status)
}

/** ¿La cuenta tiene alguna pieza (no N/A) sin terminar? */
export function clientHasPending(rows, slots, clientId) {
  const slotsByKey = new Map(slots.map((s) => [s.key, s]))
  return clientStatuses(rows, slotsByKey, clientId, { counted: true }).some((s) => !isDone(s))
}

/** Clientes con al menos una pieza sin terminar (filtro «solo pendientes»). */
export function clientsWithPending(clients, rows, slots) {
  return clients.filter((c) => clientHasPending(rows, slots, c.id))
}

/**
 * KPIs de la temporada para las cuentas en alcance. Cada columna de estado con valor (que no
 * sea N/A) es una pieza. `pctAprobado` es null si todavía no hay piezas (evita mostrar 0%
 * como si fuera avance real).
 * @returns {{ totalPiezas, terminadas, pendientes, pctAprobado, bySlot: Array }}
 */
export function computeTemporadaSummary(clients, rows, slots) {
  const ids = new Set(clients.map((c) => c.id))
  const scoped = rows.filter((r) => ids.has(r.client_id))
  const bySlot = slots.map((slot) => {
    const statuses = scoped
      .filter((r) => r.slot_key === slot.key)
      .flatMap((r) => countedStatuses(r, slot))
    const done = statuses.filter(isDone).length
    return {
      key: slot.key,
      label: slot.label,
      total: statuses.length,
      done,
      pct: statuses.length ? Math.round((done / statuses.length) * 100) : null,
    }
  })
  const totalPiezas = bySlot.reduce((n, s) => n + s.total, 0)
  const terminadas = bySlot.reduce((n, s) => n + s.done, 0)
  return {
    totalPiezas,
    terminadas,
    pendientes: totalPiezas - terminadas,
    pctAprobado: totalPiezas ? Math.round((terminadas / totalPiezas) * 100) : null,
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
