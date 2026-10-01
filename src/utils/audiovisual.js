/**
 * Lógica pura del módulo «Tareas Fijas» (Gestión de Tareas → Tareas Fijas,
 * sub-sección Audiovisual). Todas las funciones son puras y testeables: no
 * tocan Supabase ni el DOM.
 *
 * Flujo de una pauta: 'solicitada' (jefa arma el brief y lo envía) →
 * 'programada' (coordinadora agenda fecha/recurso/asistentes) → 'realizada'
 * (se capturan piezas) | 'declinada' (no se agenda).
 */

import { cnpPiecesDelivered } from '../components/cnp/constants'

export const FORMAT_KEYS = ['V', 'R', 'F']

export const FORMAT_LABELS = {
  V: 'Video de marca',
  R: 'Reel',
  F: 'Foto',
}

export const FORMAT_ICONS = {
  V: '🎬',
  R: '🎞️',
  F: '📷',
}

/**
 * Agrupación de formatos para el panel de rendimiento (AvAnalytics): Video y Reel se ven
 * como "audiovisual" (misma disciplina de grabación/edición), Foto aparte — así 40 fotos
 * nunca se suman con 3 videos en un mismo número.
 */
export const FORMAT_GROUPS = { av: ['V', 'R'], foto: ['F'] }

export const FORMAT_GROUP_LABELS = { av: 'Video/Reel', foto: 'Foto' }

/** 'V'|'R' → 'av', 'F' → 'foto', cualquier otro código o null → null. */
export function formatGroupOf(code) {
  if (FORMAT_GROUPS.av.includes(code)) return 'av'
  if (FORMAT_GROUPS.foto.includes(code)) return 'foto'
  return null
}

export const LIFECYCLE_LABELS = {
  solicitada: 'Solicitada',
  programada: 'Programada',
  realizada: 'Realizada',
  declinada: 'Declinada',
}

export const GRILLA_STATUS_LABELS = {
  lista: 'A tiempo',
  pendiente: 'Pendiente',
  incumple: 'Incumple',
}

/**
 * Estados de una pieza individual dentro del checklist de edición (av_pauta_piezas).
 * `PIEZA_STATUS_META` sigue el contrato de StatusPill (common/StatusPill.jsx): clases
 * Tailwind LITERALES, nunca armadas en runtime (el JIT no las generaría). Misma paleta
 * base que STATUS_BADGE de PautaDetailModal para que el módulo se vea
 * consistente.
 */
export const PIEZA_STATUS_LABELS = {
  pendiente: 'Pendiente',
  en_edicion: 'En edición',
  espera_aprobacion: 'Espera de aprobación',
  listo: 'Listo',
  cancelado: 'Cancelado',
}

export const PIEZA_STATUS_META = {
  pendiente: {
    label: 'Pendiente',
    bg: 'bg-[#fdf4de]',
    text: 'text-[#9a7400]',
    dot: 'bg-[#e0b23d]',
  },
  en_edicion: {
    label: 'En edición',
    bg: 'bg-[#e6f0ff]',
    text: 'text-[#2563eb]',
    dot: 'bg-[#2563eb]',
  },
  espera_aprobacion: {
    label: 'Espera de aprobación',
    bg: 'bg-[#f3e8ff]',
    text: 'text-[#7c3aed]',
    dot: 'bg-[#7c3aed]',
  },
  listo: { label: 'Listo', bg: 'bg-[#e9f7ec]', text: 'text-[#1f8a43]', dot: 'bg-[#1f8a43]' },
  cancelado: { label: 'Cancelado', bg: 'bg-[#f2f0ea]', text: 'text-[#888]', dot: 'bg-[#999]' },
}

export const PIEZA_STATUS_ORDER = [
  'pendiente',
  'en_edicion',
  'espera_aprobacion',
  'listo',
  'cancelado',
]

const DAYNAMES = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado']
const MON3 = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']

// ─── Fechas ─────────────────────────────────────────────────────────────────

/** Parsea 'YYYY-MM-DD' a Date local (evita el desfase de un día de `new Date(str)` en UTC). */
export function parseISODate(value) {
  if (!value) return null
  const [y, m, d] = value.split('-').map(Number)
  return new Date(y, m - 1, d)
}

function startOfDay(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate())
}

const pad = (n) => String(n).padStart(2, '0')

/** Formatea una hora 'HH:MM[:SS]' (formato Postgres `time`) a 12h con A.M./P.M. */
export function formatTime12(value) {
  if (!value) return ''
  const [hStr, mStr] = value.split(':')
  let h = Number(hStr)
  const m = Number(mStr)
  const ap = h < 12 ? 'A.M.' : 'P.M.'
  h = h % 12
  if (h === 0) h = 12
  return `${pad(h)}:${pad(m)} ${ap}`
}

/** 'jue 17 jul' */
export function formatDayShort(dateStr) {
  const d = parseISODate(dateStr)
  if (!d) return '—'
  return `${d.getDate()} ${MON3[d.getMonth()]}`
}

// ─── Estado de la grilla (entrega de la pauta) ─────────────────────────────

/**
 * Estado de entrega de la grilla de una pauta: 'lista' (entregada a tiempo),
 * 'pendiente' (aún no vence), 'incumple' (venció sin grilla, o se entregó tarde).
 * Tope: la grilla debe entregarse hasta dos días antes de la fecha de la pauta.
 * @param {{pauta_date: string|null, grilla_delivered_at: string|null}} pauta
 * @param {Date} today
 */
export function grillaStatus(pauta, today = new Date()) {
  if (!pauta.pauta_date) return 'pendiente'
  const pautaDate = parseISODate(pauta.pauta_date)
  const deadline = new Date(pautaDate)
  deadline.setDate(pautaDate.getDate() - 2)

  if (pauta.grilla_delivered_at) {
    const delivered = parseISODate(pauta.grilla_delivered_at)
    return delivered <= deadline ? 'lista' : 'incumple'
  }
  return pautaDate < startOfDay(today) ? 'incumple' : 'pendiente'
}

/**
 * Próximo cierre de agenda: la agenda de la semana siguiente se arma el jueves,
 * máximo el viernes 05:00pm. Si hoy ya es jueves, el cierre es hoy.
 * @param {Date} today
 * @returns {{ deadline: Date, weekStart: Date, weekEnd: Date }}
 */
export function nextAgendaDeadline(today = new Date()) {
  const deadline = startOfDay(today)
  while (deadline.getDay() !== 4) deadline.setDate(deadline.getDate() + 1)
  const weekStart = new Date(deadline)
  weekStart.setDate(deadline.getDate() + 4) // lunes de la semana siguiente
  const weekEnd = new Date(weekStart)
  weekEnd.setDate(weekStart.getDate() + 6)
  return { deadline, weekStart, weekEnd }
}

// ─── Formatos y recursos ────────────────────────────────────────────────────

/** 'V/R' — códigos de formato de una pauta, en el orden fijo V/R/F. */
export function formatCodes(pauta) {
  return FORMAT_KEYS.filter((k) => (pauta.formats ?? []).includes(k)).join('/')
}

/**
 * Nombre a mostrar del recurso que graba/edita una pauta: el empleado asignado
 * (resuelto vía `usersById`) o el texto libre de tercero (`*_other`).
 * @param {object} pauta
 * @param {'graba'|'edita'} which
 * @param {Map<string,object>} usersById  user_id -> { first_name, last_name }
 */
export function resourceName(pauta, which, usersById) {
  const userId = which === 'graba' ? pauta.graba_user_id : pauta.edita_user_id
  const other = which === 'graba' ? pauta.graba_other : pauta.edita_other
  if (userId) {
    const u = usersById?.get(userId)
    const name = u ? `${u.first_name ?? ''} ${u.last_name ?? ''}`.trim() : ''
    return name || null
  }
  return other || null
}

/**
 * Nombres a mostrar de los recursos (empleados de Audiovisual) asignados a grabar fotos
 * y video de una pauta (`recurso_ids` — array, a diferencia de `edita_user_id` que sigue
 * siendo una sola persona). Sin fallback de texto libre para terceros (a diferencia de
 * `resourceName`): `recurso_ids` solo contiene user_ids de empleados.
 * @param {object} pauta
 * @param {Map<string,object>} usersById  user_id -> { first_name, last_name }
 * @returns {string[]}
 */
export function resourceNames(pauta, usersById) {
  return (pauta.recurso_ids ?? [])
    .map((id) => usersById?.get(id))
    .filter(Boolean)
    .map((u) => `${u.first_name ?? ''} ${u.last_name ?? ''}`.trim())
    .filter(Boolean)
}

/**
 * Determina si `userId` puede gestionar los recursos y la lista de piezas de una pauta:
 * quien coordina (admin o Lizdania, vía `audiovisual.coordina`), quien tenga la capability
 * configurable `audiovisual.pautas.gestion` (Empresa > Accesos), el recurso que grabó esa
 * pauta (`recurso_ids`), o la jefa de la línea a la que pertenece la pauta
 * (`metric_line_members.is_lead`). Reemplaza el booleano global que antes abría la edición
 * a todo el depto Audiovisual — ver commit 19e5bbc.
 *
 * El caso de la jefa es por ALCANCE, no por persona: cualquier jefa sobre las pautas de su
 * línea y solo de su línea, algo que una capability no puede expresar (el evaluador de
 * `module_permissions` solo mira el perfil del usuario, nunca la pauta). Las pautas sin
 * `line_id` (cuentas sin línea, agrupadas como "Independientes") no tienen jefa y quedan
 * fuera a propósito. Espejo en BD: policies de `av_pauta_piezas` +
 * `prevent_av_pautas_recurso_escalation`, vía `user_leads_line`
 * (20260930000000_av_pautas_jefa_de_linea.sql).
 * @param {object} params
 * @param {boolean} params.canCoordinate  — resultado de `can('audiovisual.coordina')`
 * @param {boolean} [params.canGestionPautas]  — resultado de `can('audiovisual.pautas.gestion')`
 * @param {string|null|undefined} params.userId  — user_id del usuario actual
 * @param {object|null|undefined} params.pauta
 * @param {string[]} [params.leadLineIds]  — ids de las líneas que `userId` lidera
 * @returns {boolean}
 */
export function canEditPiezasForPauta({
  canCoordinate,
  canGestionPautas,
  userId,
  pauta,
  leadLineIds,
}) {
  if (canCoordinate || canGestionPautas) return true
  if (!userId || !pauta) return false
  if ((pauta.recurso_ids ?? []).includes(userId)) return true
  return Boolean(pauta.line_id) && (leadLineIds ?? []).includes(pauta.line_id)
}

/**
 * Ids de las líneas que `userId` lidera (`lead_user_id`, derivado de
 * `metric_line_members.is_lead` por `loadLines`) — la entrada de `leadLineIds` en
 * `canEditPiezasForPauta`. Se calcula sobre las líneas que ya tiene cargadas la vista, sin
 * una query extra: quien no ve todas las líneas recibe únicamente la suya, y quien las ve
 * todas recibe solo aquellas donde efectivamente figura como jefa.
 * @param {Array} lines  — líneas con `{ id, lead_user_id }`
 * @param {string|null|undefined} userId
 * @returns {string[]}
 */
export function leadLineIdsFor(lines, userId) {
  if (!userId) return []
  return (lines ?? []).filter((l) => l?.lead_user_id === userId).map((l) => l.id)
}

/**
 * Determina si `userId` puede accionar el checklist de UN editor concreto dentro de una
 * pauta: además de quien ya puede editar toda la pauta (`canEditPiezas` — coordina o el
 * recurso/grabador de la pauta), el propio editor asignado a ese bloque (`editor_user_id`)
 * puede marcar el estado de sus piezas, aunque no sea el recurso que grabó la pauta. Antes
 * el gate único `canEditPiezasForPauta` dejaba a un editor sin `recurso_ids` en modo solo
 * lectura sobre sus propias piezas (caso: grabadora/editora sin acceso a marcar estado).
 * @param {object} params
 * @param {boolean} params.canEditPiezas — ya resuelto por canEditPiezasForPauta
 * @param {string|null|undefined} params.userId
 * @param {string|null|undefined} params.editorId — editor_user_id del bloque/pieza
 * @returns {boolean}
 */
export function canActOnEditorGroup({ canEditPiezas, userId, editorId }) {
  if (canEditPiezas) return true
  return Boolean(userId) && Boolean(editorId) && userId === editorId
}

/**
 * Nombres únicos de los editores asignados a las piezas de una pauta (`editor_user_id`,
 * empleados o recursos externos con rol `edicion`) — complemento de `resourceNames`, que
 * solo resuelve quién graba (`recurso_ids`). Usa `piezasByEditor` para agrupar y descarta
 * la clave `null` (piezas sin editor asignado).
 * @param {Array} piezas — piezas de UNA pauta
 * @param {Map<string,object>} usersById  user_id -> { first_name, last_name }
 * @returns {string[]}
 */
export function editorNames(piezas, usersById) {
  const names = [...piezasByEditor(piezas).keys()]
    .filter(Boolean)
    .map((id) => usersById?.get(id))
    .filter(Boolean)
    .map((u) => `${u.first_name ?? ''} ${u.last_name ?? ''}`.trim())
    .filter(Boolean)
  return [...new Set(names)]
}

/**
 * Etiqueta a mostrar de un `editor_user_id`: distingue "nadie asignado" de "asignado a
 * alguien que ya no resuelve" — antes ambos casos se pintaban igual como "Sin asignar" y
 * era imposible saber si el bloque tenía dueño o no.
 * @param {string|null|undefined} editorId
 * @param {Map<string,object>} usersById
 */
export function editorLabel(editorId, usersById) {
  if (!editorId) return 'Sin asignar'
  const u = usersById?.get(editorId)
  if (!u) return isExternalId(editorId) ? 'Editor no disponible (externo)' : 'Editor no disponible'
  return `${u.first_name ?? ''} ${u.last_name ?? ''}`.trim() || 'Editor no disponible'
}

/** Pseudo-usuario mínimo para pintar un Avatar cuando `editorId` no resuelve en `usersById`. */
export function unresolvedEditorUser(editorId) {
  return { user_id: editorId, first_name: '?', last_name: '', avatar_url: null }
}

/**
 * Nombre a mostrar de quien solicitó/creó la pauta (`created_by`), resuelto vía
 * `usersById`. A diferencia de `resourceName`, no tiene fallback de texto libre:
 * `created_by` siempre es un user_id o null (pauta creada antes de este campo, o
 * borrador local aún no guardado).
 * @param {object} pauta
 * @param {Map<string,object>} usersById  user_id -> { first_name, last_name }
 */
export function requesterName(pauta, usersById) {
  const u = usersById?.get(pauta.created_by)
  if (!u) return null
  return `${u.first_name ?? ''} ${u.last_name ?? ''}`.trim() || null
}

// ─── Recursos externos (grabación/edición/ads, no son empleados) ──────────

/** Prefijo que distingue un id de recurso externo de un `user_id` real de empleado. */
export const EXTERNAL_PREFIX = 'ext:'

/** true si `id` corresponde a un recurso externo (`ext:<uuid>`), no a un empleado. */
export function isExternalId(id) {
  return typeof id === 'string' && id.startsWith(EXTERNAL_PREFIX)
}

/**
 * Da forma de "pseudo-usuario" a un recurso externo (fila de `external_resources`) para
 * poder inyectarlo en las mismas listas/`usersById` que usan `AttendeePicker`,
 * `resourceNames`, `piezasByEditor`, etc. — así esos helpers no necesitan una rama
 * "es externo" propia: solo ven otro objeto con `user_id`/`first_name`/`last_name`.
 * El `user_id` se prefija con `EXTERNAL_PREFIX` para no poder colisionar nunca con un
 * uuid real de `users`.
 * @param {{id:string, full_name:string, roles:string[], deleted_at:string|null}} resource
 */
export function externalAsUser(resource) {
  const name = (resource.full_name ?? '').trim()
  const [first, ...rest] = name.split(/\s+/)
  return {
    user_id: EXTERNAL_PREFIX + resource.id,
    first_name: first ?? '',
    last_name: rest.join(' '),
    avatar_url: null,
    is_external: true,
    roles: resource.roles ?? [],
    deleted_at: resource.deleted_at ?? null,
  }
}

/**
 * Recursos externos activos con un rol dado, ya en forma de pseudo-usuario — listos
 * para concatenar a `audiovisualUsers` antes de pasarlos a un `AttendeePicker`.
 * @param {Array} externalResources  filas crudas de `external_resources`
 * @param {'grabacion'|'edicion'|'ads'} role
 */
export function externalUsersForRole(externalResources, role) {
  return (externalResources ?? [])
    .filter((r) => !r.deleted_at && (r.roles ?? []).includes(role))
    .map(externalAsUser)
}

// ─── Disponibilidad de recursos (Agenda) ───────────────────────────────────

/** A partir de cuántas pautas del mismo día se avisa que un recurso está sobrecargado. */
export const RESOURCE_DAILY_LIMIT = 3

/**
 * Duración que se ASUME para una pauta sin hora de llegada. No es un dato real: muchas
 * pautas se agendan sin cierre, así que para poder detectar choques probables se les
 * atribuye esta ventana. Al ser una suposición, un choque que dependa de ella nunca
 * bloquea — solo avisa (ver `resourceConflicts`).
 */
export const ASSUMED_DURATION_HOURS = 3

/** Normaliza 'HH:MM:SS' (formato `time` de Postgres) a 'HH:MM' para comparar como string. */
function hhmm(value) {
  return value ? String(value).slice(0, 5) : value
}

/**
 * Fin asumido de una pauta sin `llegada`: `salida` + ASSUMED_DURATION_HOURS, topado al
 * final del día (una pauta no se derrama al día siguiente a efectos de disponibilidad).
 * @param {string|null} salida  'HH:MM' o 'HH:MM:SS'
 * @returns {string|null} 'HH:MM', o null si no hay salida
 */
export function assumedEnd(salida) {
  if (!salida) return null
  const [h, m] = hhmm(salida).split(':').map(Number)
  const end = h + ASSUMED_DURATION_HOURS
  return end >= 24 ? '24:00' : `${pad(end)}:${pad(m)}`
}

/**
 * Compara dos rangos horarios ('HH:MM' o 'HH:MM:SS') y devuelve true si se solapan. Los
 * rangos son SEMIABIERTOS [inicio, fin): una pauta que llega a las 11:00 y otra que sale a
 * las 11:00 NO se consideran solapadas (la agenda se arma en bloques consecutivos).
 *
 * Un rango con inicio pero SIN fin se trata como un instante — solo se afirma lo que se
 * sabe con certeza: que el recurso está ocupado en ese momento exacto. Rellenar el fin con
 * una duración estimada es responsabilidad del llamador (ver `assumedEnd`), justamente para
 * que "seguro" y "probable" no se confundan.
 */
export function timeRangesOverlap(aStart, aEnd, bStart, bEnd) {
  const [as, ae, bs, be] = [aStart, aEnd, bStart, bEnd].map(hhmm)
  const missing = (start, end) => !start && !end
  const isInstant = (start, end) => Boolean(start) && !end

  if (missing(as, ae) || missing(bs, be)) return false

  if (isInstant(as, ae) && isInstant(bs, be)) return as === bs
  if (isInstant(as, ae)) return as >= bs && as < be
  if (isInstant(bs, be)) return bs >= as && bs < ae

  return as < be && bs < ae
}

/** Solapamiento usando la ventana asumida de 3 h cuando falta la hora de llegada. */
function assumedRangesOverlap(a, b) {
  return timeRangesOverlap(
    a.salida,
    a.llegada ?? assumedEnd(a.salida),
    b.salida,
    b.llegada ?? assumedEnd(b.salida),
  )
}

/**
 * Conflictos de disponibilidad al asignar `candidate.recurso_ids` (la pauta YA con los
 * cambios propuestos aplicados, no la pauta original). `sameDayPautas` son las demás
 * pautas activas ('programada'|'realizada') del mismo `pauta_date`, en CUALQUIER línea
 * (la disponibilidad de un recurso no respeta el alcance por línea que ve la coordinadora)
 * y sin incluir a `candidate` mismo.
 *
 * Hay DOS niveles de certeza, y de ahí que un choque de horario a veces bloquee y a veces
 * solo avise:
 *
 * - `blocking`: el choque es un HECHO, porque se deduce solo de horas reales guardadas
 *   (`timeRangesOverlap` trata una pauta sin `llegada` como el instante de su salida —
 *   no inventa duración). Basta un choque para bloquear el guardado completo.
 * - `warnings` de tipo `probable_overlap`: los rangos NO chocan con las horas reales, pero
 *   sí al rellenar la `llegada` faltante con `ASSUMED_DURATION_HOURS`. Como el choque
 *   depende de una suposición, se pregunta en vez de bloquear.
 * - `warnings` de tipo `daily_limit`: el recurso alcanza `RESOURCE_DAILY_LIMIT` pautas ese
 *   día. Solo se avisa por recursos nuevos respecto a `previousRecursoIds`, para no repetir
 *   el aviso al tocar otro campo de una pauta que ya tenía 3+ y no cambió sus recursos.
 *   `probable_overlap` NO se filtra por `previousRecursoIds`: mover la hora de una pauta con
 *   recursos ya asignados es justamente cuando puede nacer un choque nuevo.
 * @param {object} candidate  { recurso_ids, pauta_date, salida, llegada, ... }
 * @param {Array} sameDayPautas
 * @param {Map<string,object>} usersById
 * @param {string[]} [previousRecursoIds]  recurso_ids antes del cambio (para no repetir avisos)
 * @returns {{blocking: Array<{resourceId:string,name:string,pauta:object}>, warnings: Array<object>}}
 */
export function resourceConflicts(candidate, sameDayPautas, usersById, previousRecursoIds = []) {
  const recursos = candidate.recurso_ids ?? []
  const prevSet = new Set(previousRecursoIds)
  const nameOf = (id) => {
    const u = usersById?.get(id)
    return u ? `${u.first_name ?? ''} ${u.last_name ?? ''}`.trim() : id
  }

  const blocking = []
  const warnings = []

  recursos.forEach((resourceId) => {
    const pautasDelRecurso = sameDayPautas.filter((p) => (p.recurso_ids ?? []).includes(resourceId))
    const name = nameOf(resourceId)

    const clash = pautasDelRecurso.find((p) =>
      timeRangesOverlap(candidate.salida, candidate.llegada, p.salida, p.llegada),
    )
    if (clash) {
      blocking.push({ resourceId, name, pauta: clash })
      return // un choque seguro ya bloquea; no hace falta además avisar nada más
    }

    const probable = pautasDelRecurso.find((p) => assumedRangesOverlap(candidate, p))
    if (probable) {
      warnings.push({ kind: 'probable_overlap', resourceId, name, pauta: probable })
    }

    if (!prevSet.has(resourceId)) {
      const count = pautasDelRecurso.length + 1 // + la propia `candidate`
      if (count >= RESOURCE_DAILY_LIMIT) {
        warnings.push({ kind: 'daily_limit', resourceId, name, count })
      }
    }
  })

  return { blocking, warnings }
}

// ─── Alcance por línea ──────────────────────────────────────────────────────

/**
 * Pautas dentro del alcance de una línea, o todas si `lineId` es null/undefined.
 *
 * `generalLineId` es el id de la línea general "Independientes" (`metric_lines.is_general`):
 * las pautas sin línea (cuentas con `line_id = null`) se resuelven a ella en lectura, igual
 * que hace Chequeo con las cuentas (ver `effectiveLineId` en utils/lineFilters.js). El
 * snapshot guardado en `av_pautas.line_id` no cambia — sigue siendo null.
 */
export function pautasInScope(pautas, lineId, generalLineId = null) {
  if (!lineId) return pautas
  return pautas.filter((p) => (p.line_id ?? generalLineId) === lineId)
}

/**
 * Pautas del mes que se está viendo en el calendario (`year`/`month`, 1-12): la tabla de
 * seguimiento y los recuadros de resumen deben reflejar el mes navegado, no siempre el
 * total general. Las pautas sin `pauta_date` (solicitudes sin fecha deseada, o agendadas
 * "por agendar") no pertenecen a ningún mes todavía, así que se mantienen visibles sin
 * importar el mes — de lo contrario desaparecerían de la tabla hasta que alguien les
 * ponga fecha, escondiendo justo lo que falta agendar.
 */
export function pautasInMonth(pautas, year, month, pinnedIds = null) {
  return pautas.filter((p) => {
    if (!p.pauta_date) return true
    if (pinnedIds?.has(p.id)) return true
    const [y, m] = p.pauta_date.split('-').map(Number)
    return y === year && m === month
  })
}

/** true si la pauta tiene fecha y esa fecha cae fuera del año/mes que se está viendo. */
export function isOutOfMonth(pauta, year, month) {
  if (!pauta.pauta_date) return false
  const [y, m] = pauta.pauta_date.split('-').map(Number)
  return y !== year || m !== month
}

/** Nombre del mes+año de una fecha 'YYYY-MM-DD', para el aviso "↗ mes" de una fila anclada. */
export function monthLabel(dateStr) {
  if (!dateStr) return ''
  const [y, m, d] = dateStr.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('es-VE', { month: 'long', year: 'numeric' })
}

/** Clave de orden de la Agenda: fecha + hora de salida, sin fecha al final. */
export function agendaSortKey(p) {
  return `${p.pauta_date || '9999-99-99'}T${(p.salida || '99:99:99').padEnd(8, '0')}`
}

/**
 * Orden estable de la Agenda por fecha+salida, desempatando por id — evita que dos pautas
 * con la misma clave (p. ej. sin fecha) intercambien posición entre renders sin haber
 * cambiado nada.
 */
export function sortAgenda(pautas) {
  return [...pautas].sort((a, b) => {
    const ka = agendaSortKey(a)
    const kb = agendaSortKey(b)
    if (ka !== kb) return ka < kb ? -1 : 1
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0
  })
}

// ─── Flujo de aprobación ────────────────────────────────────────────────────

/**
 * Modo de edición de la sub-sección según capabilities del usuario:
 *  - 'coordina'  → agenda/aprueba solicitudes, edita Agenda y Realizadas (cualquier línea)
 *  - 'solicita'  → arma y envía el brief de Solicitudes (solo su línea)
 *  - 'lectura'   → solo ve
 */
export function avEditMode({ canCoordinate, canManage }) {
  if (canCoordinate) return 'coordina'
  if (canManage) return 'solicita'
  return 'lectura'
}

/**
 * Brief mínimo completo para poder solicitar una pauta: cliente + algo que diga de qué va
 * (tema, enlace de grilla o descripción de piezas). Antes exigía grilla o descripción; el
 * formulario nuevo pide el tema como campo principal.
 */
export function briefComplete(pauta) {
  const filled = (v) => Boolean(v && String(v).trim())
  return Boolean(
    pauta.client_id && (filled(pauta.tema) || filled(pauta.link) || filled(pauta.piezas_desc)),
  )
}

/**
 * Traduce el error crudo de Supabase/Postgres de una operación sobre `av_pautas` a un
 * mensaje en español apto para mostrar en la tabla — sin jerga técnica ni el texto del
 * motor (ver AvPhaseTable.jsx/PautaDetailModal.jsx, banners que antes mostraban
 * `err.message` tal cual, p. ej. "operator does not exist: uuid = text").
 */
export function pautaErrorMessage(err) {
  if (!err) return null
  const raw = err.message || ''
  if (
    err.code === '42501' ||
    /row-level security/i.test(raw) ||
    /no autorizado para modificar los recursos/i.test(raw)
  ) {
    return 'No tienes permiso para editar esta pauta.'
  }
  if (err.code === '23P01' || /av_pautas_estudio_sin_solape/.test(raw)) {
    return 'El estudio ya está ocupado en ese horario. Elige otra hora o cambia el lugar.'
  }
  if (err.code === '23505' && /lote_unico/.test(raw)) {
    return 'Ese editor ya tiene ese formato asignado en esta pauta. Recarga la página.'
  }
  return 'No se pudo guardar el cambio. Vuelve a intentarlo; si sigue pasando, avisa a soporte.'
}

/**
 * Solicitudes visibles en la pestaña «Solicitudes»: la coordinadora solo ve las
 * ya enviadas (`submitted`); quien solicita ve las suyas en cualquier estado de
 * borrador/enviado (el alcance por línea ya viene acotado en `pautas`).
 */
export function visibleSolicitudes(pautas, { canCoordinate }) {
  const base = pautas.filter((p) => p.status === 'solicitada')
  return canCoordinate ? base.filter((p) => p.submitted) : base
}

// ─── Analítica (piezas por línea / rendimiento por recurso) ────────────────

/** true si `piezas_por_formato` trae datos reales (camino "formato"), no el legacy '{}'. */
function hasFormatoBreakdown(pauta) {
  return Object.keys(pauta.piezas_por_formato ?? {}).length > 0
}

/**
 * Agrega piezas totales/editadas de las pautas 'realizada' por línea. `totales`/`editadas`
 * son la suma cruda de las columnas (video + foto) — esta analítica sigue mostrando el
 * total sin filtrar, a diferencia del indicador «6. Nº Piezas vs Piezas editadas» de
 * Reportes → Operaciones (avPautasApi.countPiezasForLine → sumPiezasVideoForLine), que
 * desde el ajuste de solo-video cuenta menos que este `totales`/`editadas` cuando hay
 * piezas de foto en el mes — a propósito, ambos números miden cosas distintas.
 * `porGrupo` es el desglose adicional Video/Reel vs Foto: pautas con desglose por formato
 * reparten ahí; pautas legacy (sin `piezas_por_formato`) caen enteras en `sinDesglose`.
 * @param {Array} pautas
 * @param {Array<{id:string,name:string}>} lines
 * @returns {Array<{lineId:string, label:string, totales:number, editadas:number,
 *   porGrupo: {av:{totales:number,editadas:number}, foto:{totales:number,editadas:number},
 *              sinDesglose:{totales:number,editadas:number}}}>}
 */
export function aggregatePiezasByLine(pautas, lines, generalLineId = null) {
  const byLine = new Map()
  const emptyGrupo = () => ({ totales: 0, editadas: 0 })
  pautas.forEach((p) => {
    // Las pautas sin línea cuentan para la línea general "Independientes" (si la empresa la
    // tiene); sin ella se siguen ignorando, como antes.
    const lineId = p.line_id ?? generalLineId
    if (p.status !== 'realizada' || !lineId) return
    if (!byLine.has(lineId)) {
      const line = lines.find((l) => l.id === lineId)
      byLine.set(lineId, {
        lineId,
        label: line?.name ?? 'Sin línea',
        totales: 0,
        editadas: 0,
        porGrupo: { av: emptyGrupo(), foto: emptyGrupo(), sinDesglose: emptyGrupo() },
      })
    }
    const entry = byLine.get(lineId)
    entry.totales += Number(p.piezas_totales) || 0
    entry.editadas += Number(p.piezas_editadas) || 0

    if (hasFormatoBreakdown(p)) {
      const breakdown = piezasPorFormato(p)
      Object.entries(breakdown).forEach(([code, { salieron, editadas }]) => {
        const group = formatGroupOf(code)
        if (!group) return
        entry.porGrupo[group].totales += salieron
        entry.porGrupo[group].editadas += editadas
      })
    } else {
      entry.porGrupo.sinDesglose.totales += Number(p.piezas_totales) || 0
      entry.porGrupo.sinDesglose.editadas += Number(p.piezas_editadas) || 0
    }
  })
  return [...byLine.values()]
}

/**
 * Rendimiento por recurso, separado por grupo de formato (Video/Reel vs Foto) — reemplaza
 * a la antigua `aggregateByResource`, que le atribuía el total COMPLETO de la pauta a cada
 * recurso de `recurso_ids` (dos camarógrafos en una pauta de 10 piezas daban 20 "grabadas"
 * cada uno) y sumaba fotos con videos en un solo número.
 *
 * `graba*` sale, en orden de preferencia, de tres caminos — los tres marcan `grabaEstimado`
 * salvo el primero, porque solo el reparto explícito dice con certeza quién hizo qué:
 *   1. Reparto explícito por persona (`grabacion_por_formato`, ver `grabacionPorFormato`) —
 *      exacto, no estimado.
 *   2. Sin reparto por persona pero con desglose por formato de la pauta
 *      (`piezas_por_formato`, lo que el coordinador carga como "Salieron" en el detalle):
 *      se le atribuye a CADA recurso de `recurso_ids` el desglose completo de la pauta
 *      (video/foto), no solo un total ciego — sigue siendo estimado porque no reparte
 *      entre varios recursos, pero ya distingue formato.
 *   3. Ni reparto ni desglose por formato (pauta completamente legacy): el total ciego de
 *      siempre, en `grabaSinDesglose` (`recurso_ids` × `piezas_totales`).
 *
 * `edita*` sigue siendo pieza por pieza (`editor_user_id`/`piezaListas`), ahora ruteado por
 * `pz.formato` a través de `formatGroupOf`; si la pauta tiene un solo formato activo, las
 * piezas sin `formato` propio se imputan a ese grupo (determinista) en vez de cargarlas
 * todas a `editaOtro`. Pautas sin filas en `piezasByPauta` caen al camino legacy
 * (`edita_user_id`/`piezas_editadas`), igual que antes.
 *
 * Agrupa por ID de recurso, no por nombre — dos personas homónimas ya no se fusionan.
 *
 * `cnpAv` (opcional) suma además las piezas editadas de CNP de audiovisual (`cnp_requests`
 * con `is_audiovisual = true`) — un pedido espontáneo de cliente para editar un clip, que NO
 * pasa por una pauta. Se contabilizan en `editaCnp`, incluido en el total `edita`, pero se
 * mantienen separadas del resto de `edita*` para poder mostrar cuántas de las piezas
 * editadas de un recurso vienen de CNP vs. de pautas. Deliberadamente NO tocan
 * `sumPiezasVideoForLine`/`sumPiezasVideoBreakdownForLine` (indicador «6» del reporte por
 * línea): ese indicador sigue leyendo solo `av_pauta_piezas`, para que el trabajo de CNP
 * cuente en el rendimiento del recurso sin inflar el score de la línea en Reportes.
 * @param {Array} pautas
 * @param {Map<string,object>} usersById
 * @param {Map<string,Array>} [piezasByPauta] — pauta_id → piezas de esa pauta
 * @param {Array} [cnpAv] — CNP de audiovisual (`is_audiovisual = true`) a incluir
 * @returns {Array<{id:string, name:string, grabaAv:number, grabaFoto:number,
 *   grabaSinDesglose:number, grabaEstimado:boolean, editaAv:number, editaFoto:number,
 *   editaOtro:number, editaCnp:number, graba:number, edita:number}>}
 */
export function aggregateResourcePerformance(pautas, usersById, piezasByPauta, cnpAv = []) {
  const byId = new Map()
  const ensure = (id, name) => {
    if (!byId.has(id)) {
      byId.set(id, {
        id,
        name,
        grabaV: 0,
        grabaR: 0,
        grabaAv: 0,
        grabaFoto: 0,
        grabaSinDesglose: 0,
        grabaEstimado: false,
        editaV: 0,
        editaR: 0,
        editaAv: 0,
        editaFoto: 0,
        editaOtro: 0,
        editaCnp: 0,
      })
    }
    return byId.get(id)
  }
  const nameOf = (id) => {
    if (isExternalId(id)) return usersById?.get(id) ? editorLabel(id, usersById) : id
    const u = usersById?.get(id)
    return u ? `${u.first_name ?? ''} ${u.last_name ?? ''}`.trim() || id : id
  }
  // Suma a grabaAv/grabaFoto y, además, al subtipo exacto (grabaV/grabaR) cuando se conoce.
  const addGraba = (entry, code, n) => {
    const group = formatGroupOf(code)
    if (!group) return
    entry[group === 'av' ? 'grabaAv' : 'grabaFoto'] += n
    if (code === 'V') entry.grabaV += n
    if (code === 'R') entry.grabaR += n
  }

  pautas.forEach((p) => {
    if (p.status !== 'realizada') return

    // ─ Grabación ─
    if (hasGrabacionReparto(p)) {
      const reparto = grabacionPorFormato(p)
      FORMAT_KEYS.forEach((code) => {
        Object.entries(reparto[code] ?? {}).forEach(([id, n]) => {
          addGraba(ensure(id, nameOf(id)), code, n)
        })
      })
    } else if (hasFormatoBreakdown(p)) {
      // Sin reparto por persona, pero la pauta sí sabe cuánto "salió" de cada formato
      // (piezas_por_formato, cargado a mano en el detalle desde antes de esta función) —
      // se usa ese desglose en vez de tirar todo a "sin desglosar". Sigue siendo una
      // estimación (se le atribuye el total completo a cada recurso, sin saber quién hizo
      // qué), por eso sigue marcando grabaEstimado.
      const breakdown = piezasPorFormato(p)
      ;(p.recurso_ids ?? []).forEach((id) => {
        const entry = ensure(id, nameOf(id))
        Object.entries(breakdown).forEach(([code, { salieron }]) => addGraba(entry, code, salieron))
        entry.grabaEstimado = true
      })
    } else {
      const piezasTotales = Number(p.piezas_totales) || 0
      ;(p.recurso_ids ?? []).forEach((id) => {
        const entry = ensure(id, nameOf(id))
        entry.grabaSinDesglose += piezasTotales
        entry.grabaEstimado = true
      })
    }

    // ─ Edición ─
    const piezas = piezasByPauta?.get(p.id)
    if (piezas?.length) {
      const soloFormato = (p.formats ?? []).length === 1 ? p.formats[0] : null
      piezas
        .filter((pz) => pz.status !== 'cancelado')
        .forEach((pz) => {
          if (!pz.editor_user_id) return
          const entry = ensure(pz.editor_user_id, nameOf(pz.editor_user_id))
          const code = pz.formato ?? soloFormato
          const group = formatGroupOf(code)
          const n = piezaListas(pz)
          if (group === 'av') {
            entry.editaAv += n
            if (code === 'V') entry.editaV += n
            if (code === 'R') entry.editaR += n
          } else if (group === 'foto') entry.editaFoto += n
          else entry.editaOtro += n
        })
    } else if (p.edita_user_id || p.edita_other) {
      const id = p.edita_user_id ?? `other:${p.edita_other}`
      const entry = ensure(id, p.edita_user_id ? nameOf(id) : p.edita_other)
      entry.editaOtro += Number(p.piezas_editadas) || 0
    }
  })

  cnpAv.forEach((cnp) => {
    if (!cnp?.assignee_id) return
    const entry = ensure(cnp.assignee_id, nameOf(cnp.assignee_id))
    entry.editaCnp += cnpPiecesDelivered(cnp)
  })

  return [...byId.values()]
    .map((r) => ({
      ...r,
      graba: r.grabaAv + r.grabaFoto + r.grabaSinDesglose,
      edita: r.editaAv + r.editaFoto + r.editaOtro + r.editaCnp,
    }))
    .sort((a, b) => b.graba + b.edita - (a.graba + a.edita))
}

/** Suma piezas totales/editadas de las pautas 'realizada' de una línea en un período. */
export function sumPiezasForLine(pautas) {
  return pautas.reduce(
    (acc, p) => {
      if (p.status !== 'realizada') return acc
      acc.piezas += Number(p.piezas_totales) || 0
      acc.editadas += Number(p.piezas_editadas) || 0
      return acc
    },
    { piezas: 0, editadas: 0 },
  )
}

/**
 * Suma de piezas de VIDEO (grupo `av` = Video de marca + Reel, `FORMAT_GROUPS.av`) de las
 * pautas 'realizada' de una línea en un período — alimenta el indicador «6. Nº Piezas vs
 * Piezas editadas» del reporte, que solo mide video (las fotos dejaron de contar). Total
 * combinado de `sumPiezasVideoBreakdownForLine` (video4k + reel + sinDesglose) — ver esa
 * función para el criterio exacto de qué pauta cuenta y cómo se reparte entre subtipos.
 * @param {Array} pautas
 * @returns {{piezas:number, editadas:number}}
 */
export function sumPiezasVideoForLine(pautas) {
  const { video4k, reel, sinDesglose } = sumPiezasVideoBreakdownForLine(pautas)
  return {
    piezas: video4k.piezas + reel.piezas + sinDesglose.piezas,
    editadas: video4k.editadas + reel.editadas + sinDesglose.editadas,
  }
}

/**
 * Igual que `sumPiezasVideoForLine`, pero desglosada por subtipo de video — Video 4K
 * (formato `V`, "Video de marca") vs Reel (formato `R`) — para mostrar la distinción en el
 * indicador «6. Nº Piezas vs Piezas editadas» del reporte, además del total combinado.
 * - Pauta con desglose por formato: V va a `video4k`, R va a `reel` (Foto sigue sin contar).
 * - Pauta legacy (sin desglose) de un solo subtipo (`formats` = solo V, o solo R, sin F):
 *   se atribuye entera a ese subtipo.
 * - Pauta legacy con AMBOS V y R (sin desglose ni forma de saber cuánto es de cada uno):
 *   cae en `sinDesglose` — sigue siendo video (cuenta en el total de `sumPiezasVideoForLine`
 *   y en `calcPiezas`), pero no se puede repartir entre las dos columnas visibles.
 * @param {Array} pautas
 * @returns {{video4k:{piezas:number,editadas:number}, reel:{piezas:number,editadas:number},
 *   sinDesglose:{piezas:number,editadas:number}}}
 */
export function sumPiezasVideoBreakdownForLine(pautas) {
  const emptyGrupo = () => ({ piezas: 0, editadas: 0 })
  const out = { video4k: emptyGrupo(), reel: emptyGrupo(), sinDesglose: emptyGrupo() }
  pautas.forEach((p) => {
    if (p.status !== 'realizada') return
    if (hasFormatoBreakdown(p)) {
      const breakdown = piezasPorFormato(p)
      if (breakdown.V) {
        out.video4k.piezas += breakdown.V.salieron
        out.video4k.editadas += breakdown.V.editadas
      }
      if (breakdown.R) {
        out.reel.piezas += breakdown.R.salieron
        out.reel.editadas += breakdown.R.editadas
      }
      return
    }
    const formats = p.formats ?? []
    const hasV = formats.includes('V')
    const hasR = formats.includes('R')
    if (formats.includes('F') || (!hasV && !hasR)) return
    const piezas = Number(p.piezas_totales) || 0
    const editadas = Number(p.piezas_editadas) || 0
    const target = hasV && hasR ? out.sinDesglose : hasV ? out.video4k : out.reel
    target.piezas += piezas
    target.editadas += editadas
  })
  return out
}

// ─── Checklist de piezas por editor (av_pauta_piezas) ──────────────────────

/**
 * Cuántas unidades representa una fila del checklist: 1 para una pieza normal (video/reel/
 * foto suelta), `cantidad` para un lote (ej. "Fotos" repartidas a un editor). Único lugar
 * donde vive la dualidad fila/lote — el resto del código pregunta por unidades, no por
 * filas.
 */
export function piezaUnidades(pz) {
  return pz?.es_lote ? Number(pz.cantidad) || 1 : 1
}

/** Cuántas de las unidades de una fila ya están terminadas (ver `piezaUnidades`). */
export function piezaListas(pz) {
  if (!pz) return 0
  return pz.es_lote ? Number(pz.listas) || 0 : pz.status === 'listo' ? 1 : 0
}

/**
 * Unidades de trabajo VIVO de un conjunto de piezas: suma `piezaUnidades` excluyendo las
 * 'cancelado' (no son trabajo pendiente ni hecho). Única fuente de esta regla — la usan
 * `piezasProgress`, el cupo `faltantes` del modal de detalle y `distributePiezas`, para que
 * una pieza cancelada no quede ocupando su lugar para siempre.
 * @param {Array} piezas
 * @returns {number}
 */
export function piezasUnidadesActivas(piezas) {
  return (piezas ?? [])
    .filter((pz) => pz.status !== 'cancelado')
    .reduce((sum, pz) => sum + piezaUnidades(pz), 0)
}

/**
 * Progreso del checklist de una pauta: unidades terminadas sobre el total de unidades
 * activas (las canceladas no cuentan ni para el numerador ni para el denominador — no son
 * trabajo pendiente ni trabajo hecho). Un lote de 50 fotos con 32 listas cuenta como 50/32,
 * no como 1 fila.
 * @param {Array} piezas — piezas de UNA pauta
 * @returns {{total:number, listas:number, canceladas:number, pct:number}}
 */
export function piezasProgress(piezas) {
  const activas = (piezas ?? []).filter((pz) => pz.status !== 'cancelado')
  const total = piezasUnidadesActivas(piezas)
  const listas = activas.reduce((sum, pz) => sum + piezaListas(pz), 0)
  const canceladas = (piezas ?? []).length - activas.length
  return {
    total,
    listas,
    canceladas,
    pct: total ? Math.round((listas / total) * 100) : 0,
  }
}

/**
 * Agrupa las piezas de una pauta por editor asignado, ordenadas por `position` dentro de
 * cada grupo. La clave `null` agrupa las piezas sin editor (recién creadas por reparto, o
 * huérfanas porque se quitó a su editor del modal).
 * @param {Array} piezas — piezas de UNA pauta
 * @returns {Map<string|null, Array>}
 */
export function piezasByEditor(piezas) {
  const sorted = [...(piezas ?? [])].sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
  const grouped = new Map()
  sorted.forEach((pz) => {
    const key = pz.editor_user_id ?? null
    if (!grouped.has(key)) grouped.set(key, [])
    grouped.get(key).push(pz)
  })
  return grouped
}

/**
 * Ordinal 1..N de cada pieza NO-lote dentro de una pauta, ordenado por `position` (empate
 * desempatado por `id` para que el resultado sea estable). Los lotes ('Fotos') no numeran
 * ni consumen número — no tiene sentido "Foto #1" cuando la fila representa 40 unidades.
 * Reemplaza a `piezas.length` como base de la numeración: ese conteo de filas crecía con
 * cada pieza creada pero nunca bajaba al borrar, así que el siguiente nombre/`position`
 * repetía uno ya existente (ver `createForEditor` en PautaDetailModal.jsx).
 * @param {Array} piezas — piezas de UNA pauta
 * @returns {Map<string, number>} piezaId -> ordinal (1-indexado)
 */
export function piezaOrdinals(piezas) {
  const sorted = (piezas ?? [])
    .filter((pz) => !pz.es_lote)
    .sort((a, b) => (a.position ?? 0) - (b.position ?? 0) || String(a.id).localeCompare(b.id))
  const ordinals = new Map()
  sorted.forEach((pz, i) => ordinals.set(pz.id, i + 1))
  return ordinals
}

/**
 * Etiqueta a mostrar de una pieza: el `nombre` que el coordinador escribió a mano manda
 * siempre; si está vacío se DERIVA del formato + ordinal ('Video #1', 'Reel #2', 'Foto #3'
 * si es una foto suelta sin lote, 'Pieza #4' sin formato). Nunca se persiste — así un
 * borrado no puede volver a producir nombres repetidos, a diferencia del viejo
 * `defaultPiezaName` que sí se guardaba en `nombre`.
 * @param {{nombre?:string, formato?:string}} pieza
 * @param {number} ordinal — de `piezaOrdinals`
 */
export function piezaDisplayName(pieza, ordinal) {
  if (pieza?.nombre) return pieza.nombre
  const label = pieza?.formato ? FORMAT_LABELS[pieza.formato] : 'Pieza'
  return `${label} #${ordinal}`
}

/** Siguiente `position` libre de una pauta: `max(position) + 1`, o 0 si no hay piezas. */
export function nextPosition(piezas) {
  const positions = (piezas ?? []).map((pz) => Number(pz.position) || 0)
  return positions.length ? Math.max(...positions) + 1 : 0
}

/** Código de formato que siempre se reparte como lote (ver createLotePieza en avPautasApi.js). */
export const FOTO_FORMAT = 'F'

/** Nombre fijo del lote de fotos de un editor — no es editable, a diferencia de una pieza. */
export function defaultLoteName() {
  return 'Fotos'
}

// ─── Piezas por formato (Video/Reel/Foto) de una pauta 'realizada' ─────────

/**
 * Desglose de piezas por formato de una pauta, acotado a los formatos marcados en
 * `pauta.formats` (en el orden fijo V/R/F) — si un formato marcado todavía no tiene
 * conteo se completa con ceros, y los formatos no marcados no aparecen aunque quedara
 * basura de un desmarcado anterior en la columna.
 * @param {{formats?: string[], piezas_por_formato?: object}} pauta
 * @returns {Record<'V'|'R'|'F', {salieron:number, editadas:number}>}
 */
export function piezasPorFormato(pauta) {
  const formats = pauta.formats ?? []
  const raw = pauta.piezas_por_formato ?? {}
  const out = {}
  FORMAT_KEYS.filter((code) => formats.includes(code)).forEach((code) => {
    const entry = raw[code] ?? {}
    out[code] = {
      salieron: Math.max(0, Number(entry.salieron) || 0),
      editadas: Math.max(0, Number(entry.editadas) || 0),
    }
  })
  return out
}

/**
 * Siguiente valor de `piezas_por_formato` tras editar un campo de un formato — listo
 * para mandar a `onFields(pauta, { piezas_por_formato: ... })`. Poda a los formatos
 * actualmente marcados en la pauta (si se desmarca un formato, su conteo desaparece) y
 * clampea el valor editado a un entero >= 0.
 * @param {object} pauta
 * @param {'V'|'R'|'F'} code
 * @param {'salieron'|'editadas'} key
 * @param {number|string} value
 */
export function setPiezaFormatoCount(pauta, code, key, value) {
  const next = piezasPorFormato(pauta)
  const current = next[code] ?? { salieron: 0, editadas: 0 }
  next[code] = { ...current, [key]: Math.max(0, Math.round(Number(value)) || 0) }
  return next
}

/**
 * Clasifica las piezas de una pauta en un bucket por formato activo + `sinClasificar`, para
 * que el checklist de cada editor pueda separar Video/Reel/Foto en secciones propias en vez
 * de una lista mezclada. Opera sobre TODA la pauta (no por editor) — el llamador filtra por
 * `editor_user_id` dentro de cada bucket si lo necesita.
 * Reglas:
 *  - `es_lote` (siempre Foto hoy) → bucket de su `formato`.
 *  - no-lote con `formato` en un formato activo → ese bucket.
 *  - no-lote con `formato: null`: si la pauta tiene un SOLO formato de video activo, se
 *    adopta ahí (no hay nada que adivinar); si tiene DOS (V+R) no hay forma honesta de saber
 *    cuál era → `sinClasificar`, para que el coordinador la reclasifique una vez a mano.
 *  - no-lote con un `formato` que ya no está entre los activos (basura de un formato
 *    desmarcado) → `sinClasificar`.
 * Solo tiene sentido en el camino con formatos marcados (`pauta.formats` no vacío); el
 * camino legacy (pautas sin formato) no lo usa.
 * @param {{formats?: string[]}} pauta
 * @param {Array} piezas
 * @returns {{V?:Array,R?:Array,F?:Array,sinClasificar:Array}}
 */
export function piezasPorBucket(pauta, piezas) {
  const activeFormats = FORMAT_KEYS.filter((code) => (pauta.formats ?? []).includes(code))
  const nonFoto = activeFormats.filter((code) => code !== FOTO_FORMAT)
  const out = { sinClasificar: [] }
  activeFormats.forEach((code) => {
    out[code] = []
  })
  ;(piezas ?? []).forEach((pz) => {
    const formato = pz.es_lote ? (pz.formato ?? FOTO_FORMAT) : pz.formato
    if (formato && activeFormats.includes(formato)) {
      out[formato].push(pz)
    } else if (!formato && !pz.es_lote && nonFoto.length === 1) {
      out[nonFoto[0]].push(pz)
    } else {
      out.sinClasificar.push(pz)
    }
  })
  return out
}

/**
 * `{salieron, repartido, faltan}` por formato activo — gemelo de `grabacionBalance` pero
 * sobre el checklist de EDICIÓN (`av_pauta_piezas`) en vez de `grabacion_por_formato`. Cada
 * formato tiene su propio cupo real, independiente de los demás: antes todos competían por
 * un único pool (`piezas_totales - asignadas`), así que repartir fotos le quitaba cupo a los
 * videos y viceversa aunque cada uno tuviera su propio "Salieron".
 * Fallback: si el desglose `piezas_por_formato` está vacío (camino legacy del trigger de BD,
 * donde `piezas_totales` es un número manual sin desglose cargado) pero `piezas_totales > 0`,
 * `salieron` de cada formato se completa con `piezas_totales` como TECHO (no como verdad por
 * formato) — el llamador debe seguir clampeando contra el remanente global para no repartir
 * de más mientras no haya desglose real cargado.
 * @param {object} pauta
 * @param {Array} piezas
 * @returns {Record<'V'|'R'|'F', {salieron:number, repartido:number, faltan:number}>}
 */
export function piezasBalancePorFormato(pauta, piezas) {
  const breakdown = piezasPorFormato(pauta)
  const buckets = piezasPorBucket(pauta, piezas)
  const totales = Number(pauta.piezas_totales) || 0
  const sinDesglose = Object.values(breakdown).every((entry) => entry.salieron === 0)
  const out = {}
  Object.keys(breakdown).forEach((code) => {
    const salieron = sinDesglose && totales > 0 ? totales : breakdown[code].salieron
    const repartido = piezasUnidadesActivas(buckets[code])
    out[code] = { salieron, repartido, faltan: salieron - repartido }
  })
  return out
}

/**
 * Decide qué piezas borrar al bajar la cantidad de un editor con el stepper `−`. Solo se
 * tocan piezas 'pendiente' (nunca trabajo con avance), empezando por el final del grupo
 * para no reordenar las que sí se conservan. Si no alcanzan las 'pendiente' para cubrir
 * `cantidad`, `toDelete` trae las que sí se pueden borrar y `blocked` las que impiden
 * llegar al número pedido — el llamador decide cómo avisarlo (nunca se borra en silencio
 * una pieza con avance).
 * @param {Array} piezasDelEditor — piezas de un solo editor, en el orden mostrado
 * @param {number} cantidad — piezas a quitar (entero positivo)
 * @returns {{ toDelete: string[], blocked: Array }}
 */
export function planPiezaRemoval(piezasDelEditor, cantidad) {
  const lista = piezasDelEditor ?? []
  const removable = lista.filter((pz) => pz.status === 'pendiente')
  const toDelete = removable.slice(Math.max(0, removable.length - cantidad))
  const blocked = lista
    .filter((pz) => pz.status !== 'pendiente')
    .slice(0, cantidad - toDelete.length)
  return { toDelete: toDelete.map((pz) => pz.id), blocked }
}

/**
 * Reparte `faltantes` piezas nuevas entre `editorIds`, una por turno empezando por quien
 * menos piezas tiene ya asignadas — así "Repartir automáticamente" empareja las cargas en
 * vez de amontonar todo en el primer editor de la lista. Sin editores, no reparte nada
 * (el llamador debe pedir agregar uno primero).
 * @param {number} faltantes — piezas por crear (`totales - asignadas`, ya positivo)
 * @param {string[]} editorIds
 * @param {Map<string, Array>} grouped — piezasByEditor(piezas), para partir de la carga real
 * @returns {{ editorId: string, count: number }[]}
 */
export function distributePiezas(faltantes, editorIds, grouped) {
  if (!editorIds?.length || faltantes <= 0) return []
  // piezasUnidadesActivas (no piezaUnidades a secas): una pieza 'cancelado' no es carga real
  // de ese editor, así que no debe pesar al decidir a quién le toca la siguiente.
  const unitsOf = (id) => piezasUnidadesActivas(grouped?.get(id))
  const counts = new Map(editorIds.map((id) => [id, unitsOf(id)]))
  for (let i = 0; i < faltantes; i++) {
    const minId = editorIds.reduce((a, b) => (counts.get(b) < counts.get(a) ? b : a))
    counts.set(minId, counts.get(minId) + 1)
  }
  return editorIds
    .map((id) => ({ editorId: id, count: counts.get(id) - unitsOf(id) }))
    .filter((e) => e.count > 0)
}

/** Suma `salieron`/`editadas` de un objeto `piezas_por_formato` (ya acotado o crudo). */
export function sumPiezasPorFormato(obj) {
  return Object.values(obj ?? {}).reduce(
    (acc, entry) => ({
      salieron: acc.salieron + (Number(entry?.salieron) || 0),
      editadas: acc.editadas + (Number(entry?.editadas) || 0),
    }),
    { salieron: 0, editadas: 0 },
  )
}

/** 'Reel 3/2 · Foto 5/5' (salieron/editadas) — '' si la pauta no usa el desglose por formato. */
export function formatoBreakdownLabel(pauta) {
  const breakdown = piezasPorFormato(pauta)
  return FORMAT_KEYS.filter((code) => code in breakdown)
    .map((code) => `${FORMAT_LABELS[code]} ${breakdown[code].salieron}/${breakdown[code].editadas}`)
    .join(' · ')
}

// ─── Grabación por formato y por persona (av_pautas.grabacion_por_formato) ─

/**
 * Reparto de la GRABACIÓN de una pauta: cuántas unidades de cada formato grabó cada
 * persona. Antes solo existía `recurso_ids` (quién fue) sin cuánto ni de qué formato —
 * `aggregateResourcePerformance` le atribuía a cada recurso el total completo de la pauta.
 * Acotado a `pauta.formats` (igual criterio que `piezasPorFormato`): un formato desmarcado
 * no aparece aunque quedara basura de un desmarcado anterior en la columna.
 * @param {{formats?: string[], grabacion_por_formato?: object}} pauta
 * @returns {Record<'V'|'R'|'F', Record<string, number>>}  formato -> resourceId -> cantidad
 */
export function grabacionPorFormato(pauta) {
  const formats = pauta.formats ?? []
  const raw = pauta.grabacion_por_formato ?? {}
  const out = {}
  FORMAT_KEYS.filter((code) => formats.includes(code)).forEach((code) => {
    const entry = raw[code] ?? {}
    const byResource = {}
    Object.entries(entry).forEach(([resourceId, value]) => {
      const n = Math.max(0, Math.round(Number(value)) || 0)
      if (n > 0) byResource[resourceId] = n
    })
    out[code] = byResource
  })
  return out
}

/**
 * Siguiente valor de `grabacion_por_formato` tras cambiar la cantidad de un recurso en un
 * formato — listo para `onFields(pauta, { grabacion_por_formato: ... })`. Si la cantidad
 * queda en 0 se BORRA la clave (no deja ceros basura arrastrados de un recurso quitado), y
 * se poda a los formatos actualmente marcados.
 * @param {object} pauta
 * @param {'V'|'R'|'F'} code
 * @param {string} resourceId  user_id de empleado, o `ext:<uuid>`
 * @param {number|string} value
 */
export function setGrabacionCount(pauta, code, resourceId, value) {
  const next = grabacionPorFormato(pauta)
  const current = { ...(next[code] ?? {}) }
  const n = Math.max(0, Math.round(Number(value)) || 0)
  if (n > 0) current[resourceId] = n
  else delete current[resourceId]
  next[code] = current
  return next
}

/**
 * Cuánto se ha repartido vs. cuánto "salió" (`piezas_por_formato[code].salieron`, el dato
 * manual y maestro) de cada formato. `faltan` puede ser negativo si se repartió de más —
 * p. ej. porque alguien bajó "Salieron" después de repartir — y el llamador debe avisarlo,
 * nunca ocultarlo ni corregirlo solo.
 * @param {object} pauta
 * @returns {Record<'V'|'R'|'F', {salieron:number, repartido:number, faltan:number}>}
 */
export function grabacionBalance(pauta) {
  const breakdown = piezasPorFormato(pauta)
  const reparto = grabacionPorFormato(pauta)
  const out = {}
  Object.keys(breakdown).forEach((code) => {
    const salieron = breakdown[code].salieron
    const repartido = Object.values(reparto[code] ?? {}).reduce((sum, n) => sum + n, 0)
    out[code] = { salieron, repartido, faltan: salieron - repartido }
  })
  return out
}

/** Ids (empleados o `ext:<uuid>`) con cantidad repartida > 0 en algún formato, orden V/R/F. */
export function grabacionResourceIds(pauta) {
  const reparto = grabacionPorFormato(pauta)
  const ids = []
  FORMAT_KEYS.forEach((code) => {
    Object.keys(reparto[code] ?? {}).forEach((id) => {
      if (!ids.includes(id)) ids.push(id)
    })
  })
  return ids
}

/** true si la pauta ya tiene algún reparto de grabación cargado (vs. el camino histórico). */
export function hasGrabacionReparto(pauta) {
  return grabacionResourceIds(pauta).length > 0
}

/**
 * Próximo valor de `recurso_ids` tras repartir grabación a gente nueva — unión ADITIVA,
 * nunca quita a nadie (quitar rompería la RLS de av_pauta_piezas, que autoriza por
 * `any(recurso_ids)`, y el historial de disponibilidad de `resourceConflicts`). Devuelve
 * `null` si no hay ids nuevos que agregar, para no disparar un UPDATE ni un evento de
 * realtime de más.
 * @param {{recurso_ids?: string[]}} pauta
 * @param {object} nextGrabacion  valor ya calculado de `grabacion_por_formato`
 * @returns {string[]|null}
 */
export function syncRecursoIds(pauta, nextGrabacion) {
  const current = pauta.recurso_ids ?? []
  const currentSet = new Set(current)
  const ids = []
  FORMAT_KEYS.forEach((code) => {
    Object.keys(nextGrabacion[code] ?? {}).forEach((id) => {
      if (!currentSet.has(id) && !ids.includes(id)) ids.push(id)
    })
  })
  return ids.length ? [...current, ...ids] : null
}

/**
 * Siguiente `piezas_por_formato` con `salieron` DERIVADO de la captura: para cada formato
 * activo, salieron = Σ de lo que registró cada recurso en `grabacion` (ya calculado con
 * `setGrabacionCount`). Conserva `editadas` tal cual (lo recalcula el trigger de BD desde
 * los lotes). Es el único origen de "Salieron" en el módulo rediseñado: no existe un campo
 * aparte que alguien escriba a mano.
 * @param {object} pauta
 * @param {object} grabacion  valor ya calculado de `grabacion_por_formato`
 * @returns {Record<'V'|'R'|'F', {salieron:number, editadas:number}>}
 */
export function syncSalieronFromGrabacion(pauta, grabacion) {
  const next = piezasPorFormato(pauta)
  Object.keys(next).forEach((code) => {
    const salieron = Object.values(grabacion?.[code] ?? {}).reduce(
      (sum, n) => sum + (Math.max(0, Math.round(Number(n))) || 0),
      0,
    )
    next[code] = { ...next[code], salieron }
  })
  return next
}

// ─── Lugar y estudio ────────────────────────────────────────────────────────

export const LUGAR_TIPOS = ['estudio', 'locacion']
export const LUGAR_LABELS = { estudio: 'Estudio MDN', locacion: 'Locación' }
export const ESTUDIO_NOMBRE = 'Estudio MDN'
/** Cuántas horas ocupa una pauta en el estudio desde su hora de salida. */
export const STUDIO_WINDOW_HOURS = 2

/** 'Estudio MDN' | texto de la locación | 'Por definir'. */
export function lugarLabel(pauta) {
  if (pauta?.lugar_tipo === 'estudio') return ESTUDIO_NOMBRE
  return (pauta?.place && pauta.place.trim()) || 'Por definir'
}

/**
 * Ventana que ocupa una pauta en el estudio: [salida, salida + STUDIO_WINDOW_HOURS),
 * topada a '24:00' (una pauta no se derrama al día siguiente).
 * @param {string|null} salida 'HH:MM' o 'HH:MM:SS'
 * @returns {{start:string, end:string}|null}
 */
export function studioWindow(salida) {
  if (!salida) return null
  const start = hhmm(salida)
  const [h, m] = start.split(':').map(Number)
  const endH = h + STUDIO_WINDOW_HOURS
  return { start, end: endH >= 24 ? '24:00' : `${pad(endH)}:${pad(m)}` }
}

/**
 * Pautas de estudio del mismo día que chocan con una pauta candidata. Dos niveles:
 *  - `blocking`: pautas 'programada'|'realizada' con hora cuya ventana de 2h se cruza con
 *    la de la candidata. Son hechos confirmados → no se deja guardar.
 *  - `warnings`: 'solicitada' con fecha deseada en ese horario (`kind: 'solicitada'` — una
 *    solicitud no puede vetar a otra; decide quien agenda) y pautas confirmadas de estudio
 *    sin hora (`kind: 'sin_hora'` — no se puede saber si chocan).
 * El mismo cliente (`clientId`) puede solaparse consigo mismo: una sesión partida en dos
 * pautas. Ignora borradas, declinadas, locaciones y la propia pauta (`excludeId`).
 * Espejo en BD: constraint `av_pautas_estudio_sin_solape` (20261002000001).
 * @param {Array} pautas  todas las pautas en memoria (cualquier línea)
 * @param {{date:string, salida:string|null, clientId?:string|null, excludeId?:string|null}} c
 * @returns {{blocking: Array<{pauta:object}>, warnings: Array<{kind:string, pauta:object}>}}
 */
export function estudioConflicts(pautas, { date, salida, clientId = null, excludeId = null }) {
  const out = { blocking: [], warnings: [] }
  if (!date) return out
  const mine = studioWindow(salida)
  ;(pautas ?? []).forEach((p) => {
    if (p.id === excludeId || p.deleted_at) return
    if (p.lugar_tipo !== 'estudio' || p.pauta_date !== date) return
    if (!['programada', 'realizada', 'solicitada'].includes(p.status)) return
    if (clientId && p.client_id && p.client_id === clientId) return
    const theirs = studioWindow(p.salida)
    const confirmed = p.status !== 'solicitada'
    if (!theirs || !mine) {
      if (confirmed) out.warnings.push({ kind: 'sin_hora', pauta: p })
      return
    }
    if (!timeRangesOverlap(mine.start, mine.end, theirs.start, theirs.end)) return
    if (confirmed) out.blocking.push({ pauta: p })
    else out.warnings.push({ kind: 'solicitada', pauta: p })
  })
  return out
}

/**
 * Ocupación del estudio en un día, ordenada por hora, para pintar la línea de tiempo de
 * disponibilidad. Incluye solicitadas (con `status`) para que se distingan visualmente.
 * @returns {Array<{pauta:object, start:string|null, end:string|null, status:string}>}
 */
export function estudioSlotsForDay(pautas, date, excludeId = null) {
  return (pautas ?? [])
    .filter(
      (p) =>
        p.id !== excludeId &&
        !p.deleted_at &&
        p.lugar_tipo === 'estudio' &&
        p.pauta_date === date &&
        ['programada', 'realizada', 'solicitada'].includes(p.status),
    )
    .map((p) => {
      const w = studioWindow(p.salida)
      return { pauta: p, start: w?.start ?? null, end: w?.end ?? null, status: p.status }
    })
    .sort((a, b) => (a.start ?? '99:99').localeCompare(b.start ?? '99:99'))
}

// ─── Lotes por editor × formato (Edición rediseñada) ───────────────────────

/**
 * Matriz editor × formato de los LOTES de una pauta. Solo mira `es_lote` (las filas
 * sueltas del modelo viejo se tratan en `isLegacyPiezas`/`legacyEditorSummary`). La clave
 * `null` agrupa los lotes huérfanos (sin editor).
 * @param {Array} piezas — piezas de UNA pauta
 * @returns {{editorIds: Array<string|null>, byEditor: Map<string|null, Record<string, object>>}}
 */
export function lotesMatrix(piezas) {
  const byEditor = new Map()
  ;(piezas ?? [])
    .filter((pz) => pz.es_lote)
    .forEach((pz) => {
      const key = pz.editor_user_id ?? null
      if (!byEditor.has(key)) byEditor.set(key, {})
      byEditor.get(key)[pz.formato ?? 'null'] = pz
    })
  return { editorIds: [...byEditor.keys()], byEditor }
}

/** Lote de un editor en un formato, o null. */
export function loteFor(piezas, editorId, formato) {
  return (
    (piezas ?? []).find(
      (pz) =>
        pz.es_lote && (pz.editor_user_id ?? null) === (editorId ?? null) && pz.formato === formato,
    ) ?? null
  )
}

/**
 * Qué hacer con un lote al mover `cantidad` (asignadas) o `listas` en `delta`, respetando
 * los checks de BD (`cantidad >= 1`, `0 <= listas <= cantidad`) y el cupo `max` del formato
 * (salieron − asignadas a otros). `cantidad` que llega a 0 → se borra el lote. Devuelve el
 * delta efectivamente aplicado para que el Stepper pueda avisar si se recortó.
 * @param {{lote:object|null, key:'cantidad'|'listas', delta:number, max?:number}} p
 * @returns {{action:'insert'|'update'|'delete'|'noop', fields:object, applied:number}}
 */
export function planLoteChange({ lote, key, delta, max = Infinity }) {
  const d = Math.round(Number(delta)) || 0
  const cantidad = Number(lote?.cantidad) || 0
  const listas = Number(lote?.listas) || 0
  if (key === 'listas') {
    if (!lote) return { action: 'noop', fields: {}, applied: 0 }
    const next = Math.max(0, Math.min(cantidad, listas + d))
    if (next === listas) return { action: 'noop', fields: {}, applied: 0 }
    return { action: 'update', fields: { listas: next }, applied: next - listas }
  }
  // El cupo solo limita subidas; nunca se baja por debajo de lo ya entregado.
  const next = Math.max(listas, Math.min(cantidad + d, cantidad + Math.max(0, max)))
  if (next === cantidad) return { action: 'noop', fields: {}, applied: 0 }
  if (next <= 0) {
    if (!lote) return { action: 'noop', fields: {}, applied: 0 }
    return { action: 'delete', fields: {}, applied: -cantidad }
  }
  if (!lote) return { action: 'insert', fields: { cantidad: next, listas: 0 }, applied: next }
  return { action: 'update', fields: { cantidad: next }, applied: next - cantidad }
}

/** true si la pauta tiene filas del modelo viejo (una pieza por fila) → Edición en solo lectura. */
export function isLegacyPiezas(piezas) {
  return (piezas ?? []).some((pz) => !pz.es_lote)
}

/**
 * Resumen por (editor, formato) de las piezas de una pauta vieja, leyendo filas sueltas y
 * lotes por igual (`piezaUnidades`/`piezaListas`). Las canceladas no cuentan.
 * @returns {Array<{editorId:string|null, name:string, formato:string|null, unidades:number, listas:number}>}
 */
export function legacyEditorSummary(piezas, usersById) {
  const acc = new Map()
  ;(piezas ?? [])
    .filter((pz) => pz.status !== 'cancelado')
    .forEach((pz) => {
      const editorId = pz.editor_user_id ?? null
      const formato = pz.formato ?? null
      const key = `${editorId ?? ''}|${formato ?? ''}`
      if (!acc.has(key)) {
        acc.set(key, {
          editorId,
          name: editorLabel(editorId, usersById),
          formato,
          unidades: 0,
          listas: 0,
        })
      }
      const e = acc.get(key)
      e.unidades += piezaUnidades(pz)
      e.listas += piezaListas(pz)
    })
  return [...acc.values()]
}

/** Un editor se puede quitar de una pauta solo si ninguno de sus lotes tiene entregas. */
export function editorRemovable(lotes) {
  return (lotes ?? []).every((l) => (Number(l?.listas) || 0) === 0)
}

// ─── Permisos por pauta (UI) ───────────────────────────────────────────────

/**
 * Qué puede hacer el usuario con UNA pauta. Centraliza lo que antes estaba repartido entre
 * `avEditMode` y condiciones sueltas en la tabla/modal. Espejo de las RLS (ver
 * ARQUITECTURA.md §Permisos): coordina manda en agenda; el brief lo corrige quien lo
 * solicitó (mientras siga solicitada), la jefa de esa línea o coordina; captura/edición
 * siguen `canEditPiezasForPauta`. Reagendar queda en coordina/gestión porque mueve el
 * estudio y los recursos de otras líneas.
 */
export function pautaPermissions({
  canCoordinate = false,
  canGestionPautas = false,
  canManage = false,
  userId = null,
  pauta,
  leadLineIds = [],
}) {
  if (!pauta) {
    return {
      canEditBrief: false,
      canApprove: false,
      canReagendar: false,
      canMarkRealizada: false,
      canEditPiezas: false,
      canDelete: false,
      canRestore: false,
      canReopen: false,
    }
  }
  const isLead = Boolean(pauta.line_id) && (leadLineIds ?? []).includes(pauta.line_id)
  const isCreator = Boolean(userId) && pauta.created_by === userId
  const solicitada = pauta.status === 'solicitada'
  const deleted = Boolean(pauta.deleted_at)
  const canEditPiezas = canEditPiezasForPauta({
    canCoordinate,
    canGestionPautas,
    userId,
    pauta,
    leadLineIds,
  })
  return {
    canEditBrief: !deleted && (canCoordinate || isLead || (solicitada && isCreator && canManage)),
    canApprove: !deleted && canCoordinate && solicitada,
    canReagendar: !deleted && (canCoordinate || canGestionPautas) && pauta.status === 'programada',
    canMarkRealizada: !deleted && canCoordinate && pauta.status === 'programada',
    canEditPiezas: !deleted && canEditPiezas && ['programada', 'realizada'].includes(pauta.status),
    canDelete: !deleted && (canCoordinate || (solicitada && isCreator)),
    canRestore: deleted && canCoordinate,
    canReopen: !deleted && canCoordinate && pauta.status === 'declinada',
  }
}

/** Solicitudes enviadas que esperan aprobación (badge de la pestaña). */
export function pendingApprovalCount(pautas) {
  return (pautas ?? []).filter((p) => p.status === 'solicitada' && p.submitted && !p.deleted_at)
    .length
}

// ─── Vista Lista: filtros y orden ──────────────────────────────────────────

export const LIST_FILTERS = ['solicitadas', 'agendadas', 'realizadas', 'declinadas', 'papelera']
export const LIST_FILTER_LABELS = {
  solicitadas: 'Solicitadas',
  agendadas: 'Agendadas',
  realizadas: 'Realizadas',
  declinadas: 'Declinadas',
  papelera: 'Papelera',
}

const LIST_FILTER_STATUS = {
  solicitadas: 'solicitada',
  agendadas: 'programada',
  realizadas: 'realizada',
  declinadas: 'declinada',
}

/** true si la pauta pertenece al filtro de estado de la lista. 'papelera' = borradas. */
export function pautaMatchesList(pauta, filter) {
  if (filter === 'papelera') return Boolean(pauta.deleted_at)
  if (pauta.deleted_at) return false
  const status = LIST_FILTER_STATUS[filter]
  return status ? pauta.status === status : true
}

/**
 * Filtro secundario de la lista: recurso asignado y texto libre (cliente, tema, lugar,
 * nombre del solicitante o de un recurso).
 */
export function pautaMatchesQuery(pauta, { recursoId = null, query = '', usersById } = {}) {
  if (recursoId && !(pauta.recurso_ids ?? []).includes(recursoId)) return false
  const q = (query ?? '').trim().toLowerCase()
  if (!q) return true
  const hay = [
    pauta.client_name,
    pauta.tema,
    pauta.place,
    lugarLabel(pauta),
    requesterName(pauta, usersById),
    ...resourceNames(pauta, usersById),
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
  return hay.includes(q)
}

/** Orden de la lista: agenda ascendente por fecha/hora; realizadas y papelera, descendente. */
export function sortForList(pautas, filter) {
  const sorted = sortAgenda(pautas)
  return filter === 'realizadas' || filter === 'papelera' || filter === 'declinadas'
    ? sorted.reverse()
    : sorted
}

// ─── Reagendamientos ───────────────────────────────────────────────────────

/** Historial de reagendados de una pauta, el más reciente primero. */
export function reagendamientosOf(pauta) {
  const raw = Array.isArray(pauta?.reagendamientos) ? pauta.reagendamientos : []
  return raw
    .filter((e) => e && typeof e === 'object')
    .map((e) => ({
      from_date: e.from_date ?? null,
      from_salida: e.from_salida ?? null,
      to_date: e.to_date ?? null,
      to_salida: e.to_salida ?? null,
      at: e.at ?? null,
      by: e.by ?? null,
    }))
    .sort((a, b) => String(b.at ?? '').localeCompare(String(a.at ?? '')))
}

/** 'Reagendada desde 12 oct 10:00 AM · por Ana · 05 oct' */
export function formatReagendamiento(entry, usersById) {
  const from = `${formatDayShort(entry.from_date)}${entry.from_salida ? ` ${formatTime12(entry.from_salida)}` : ''}`
  const u = entry.by ? usersById?.get(entry.by) : null
  const by = u ? `${u.first_name ?? ''} ${u.last_name ?? ''}`.trim() : null
  const at = entry.at ? formatDayShort(String(entry.at).slice(0, 10)) : null
  return [`Reagendada desde ${from}`, by && `por ${by}`, at].filter(Boolean).join(' · ')
}

// ─── Rankings y pendientes (vista Rendimiento) ─────────────────────────────

/**
 * Ranking de Fotos por persona a partir de `aggregateResourcePerformance`. Sin filas en 0.
 * @returns {Array<{id:string, name:string, capturadas:number, editadas:number, estimado:boolean}>}
 */
export function rankingFotos(perf) {
  return (perf ?? [])
    .map((r) => ({
      id: r.id,
      name: r.name,
      capturadas: r.grabaFoto,
      editadas: r.editaFoto,
      estimado: Boolean(r.grabaEstimado && r.grabaFoto > 0),
    }))
    .filter((r) => r.capturadas + r.editadas > 0)
    .sort((a, b) => b.capturadas + b.editadas - (a.capturadas + a.editadas))
}

/**
 * Ranking de Videos (4K + Reel) por persona. `editadas` incluye las piezas de CNP de
 * audiovisual (`editaCnp`); `capturadas` incluye lo sin desglosar (pautas legacy), marcado
 * como estimado. `desglose` deja ver de dónde sale cada número.
 */
export function rankingVideos(perf) {
  return (perf ?? [])
    .map((r) => ({
      id: r.id,
      name: r.name,
      capturadas: r.grabaAv + r.grabaSinDesglose,
      editadas: r.editaAv + r.editaCnp + r.editaOtro,
      estimado: Boolean(r.grabaEstimado && r.grabaAv + r.grabaSinDesglose > 0),
      desglose: {
        video4k: { capturadas: r.grabaV, editadas: r.editaV },
        reel: { capturadas: r.grabaR, editadas: r.editaR },
        cnp: r.editaCnp,
        sinDesglose: { capturadas: r.grabaSinDesglose, editadas: r.editaOtro },
      },
    }))
    .filter((r) => r.capturadas + r.editadas > 0)
    .sort((a, b) => b.capturadas + b.editadas - (a.capturadas + a.editadas))
}

/**
 * Piezas PENDIENTES por editar, por línea y por formato, de las pautas confirmadas
 * ('programada'|'realizada', no borradas). Pendiente de un formato = salieron − listas (de
 * lotes y, en pautas viejas, de filas sueltas), nunca negativo. Las pautas sin desglose por
 * formato aportan `piezas_totales − piezas_editadas` a `sinDesglose`.
 * `porPauta` permite filtrar la lista a las pautas que aportan a una celda.
 * @returns {{porLinea: Array<{lineId:string, name:string, V:number, R:number, F:number,
 *   sinDesglose:number, total:number}>, porPauta: Map<string, {V:number,R:number,F:number,sinDesglose:number}>}}
 */
export function pendientesPorEditar(pautas, piezasByPauta, lines, generalLineId = null) {
  const porLinea = new Map()
  const porPauta = new Map()
  const empty = () => ({ V: 0, R: 0, F: 0, sinDesglose: 0 })
  ;(pautas ?? []).forEach((p) => {
    if (p.deleted_at || !['programada', 'realizada'].includes(p.status)) return
    const piezas = (piezasByPauta?.get(p.id) ?? []).filter((pz) => pz.status !== 'cancelado')
    const pend = empty()
    if (hasFormatoBreakdown(p)) {
      const breakdown = piezasPorFormato(p)
      Object.entries(breakdown).forEach(([code, { salieron }]) => {
        const listas = piezas
          .filter((pz) => pz.formato === code)
          .reduce((sum, pz) => sum + piezaListas(pz), 0)
        pend[code] = Math.max(0, salieron - listas)
      })
    } else {
      pend.sinDesglose = Math.max(
        0,
        (Number(p.piezas_totales) || 0) - (Number(p.piezas_editadas) || 0),
      )
    }
    const total = pend.V + pend.R + pend.F + pend.sinDesglose
    if (total === 0) return
    porPauta.set(p.id, pend)
    const lineId = p.line_id ?? generalLineId
    if (!lineId) return
    if (!porLinea.has(lineId)) {
      const line = (lines ?? []).find((l) => l.id === lineId)
      porLinea.set(lineId, { lineId, name: line?.name ?? 'Sin línea', ...empty(), total: 0 })
    }
    const entry = porLinea.get(lineId)
    entry.V += pend.V
    entry.R += pend.R
    entry.F += pend.F
    entry.sinDesglose += pend.sinDesglose
    entry.total += total
  })
  return { porLinea: [...porLinea.values()].sort((a, b) => b.total - a.total), porPauta }
}

/**
 * true si la pauta aporta pendiente al filtro `{lineId, formato}` ('V'|'R'|'F'|'sinDesglose'|
 * null = cualquier formato). `lineId` null = cualquier línea.
 */
export function pautaMatchesPendiente(
  pauta,
  porPauta,
  { lineId = null, formato = null } = {},
  generalLineId = null,
) {
  const pend = porPauta?.get(pauta.id)
  if (!pend) return false
  if (lineId && (pauta.line_id ?? generalLineId) !== lineId) return false
  if (!formato) return true
  return (pend[formato] ?? 0) > 0
}

// ─── Generador de agenda para WhatsApp ─────────────────────────────────────

/** 'YYYY-MM-DD' local, mismo formato que `pauta_date` — comparable lexicográficamente. */
function isoDateKey(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

function attendeeNames(pauta, usersById) {
  return (pauta.attendee_ids ?? [])
    .map((id) => usersById?.get(id))
    .filter(Boolean)
    .map((u) => `${u.first_name ?? ''} ${u.last_name ?? ''}`.trim())
    .filter(Boolean)
}

function pautaLine(pauta, usersById) {
  const codes = formatCodes(pauta) || '—'
  const recs = resourceNames(pauta, usersById)
  const rec = recs.length ? recs.join(', ') : 'sin asignar'
  let head = `⏩ - ${(pauta.client_name || 'SIN CLIENTE').toUpperCase()} (${codes}: ${rec.toUpperCase()})`
  if (pauta.tema) head += ` ${pauta.tema.toUpperCase()}`
  const attendees = attendeeNames(pauta, usersById)
  if (attendees.length) head += ` ASISTE ${attendees.join(', ').toUpperCase()}`
  const times =
    pauta.salida || pauta.llegada
      ? `⏱️ SALIDA: ${formatTime12(pauta.salida) || '—'} / LLEGADA: ${formatTime12(pauta.llegada) || '—'}`
      : '⏱️ POR DEFINIR'
  const place = `📍 ${(pauta.place || 'POR DEFINIR').toUpperCase()}`
  return `${head}\n${times}\n${place}`
}

/**
 * Genera el texto de agenda semanal para copiar a WhatsApp: pautas 'programada'
 * agrupadas por fecha, resumen por línea y sección de "por agendar" (sin fecha).
 * Los días con fecha ya pasada (anteriores a hoy) se omiten: la agenda es para lo
 * que viene, no para lo que ya ocurrió.
 * @param {Array} pautas          en el alcance activo (ya filtradas por línea si aplica)
 * @param {Array<{id:string,name:string}>} lines  líneas a resumir en "Pautas por Team"
 * @param {Map<string,object>} usersById
 * @param {Date} today
 * @returns {string}
 */
export function generateAgendaText(
  pautas,
  lines,
  usersById,
  today = new Date(),
  generalLineId = null,
) {
  const todayKey = isoDateKey(today)
  const programadas = pautas.filter((p) => p.status === 'programada')
  const dated = programadas.filter((p) => p.pauta_date && p.pauta_date >= todayKey)
  const undated = programadas.filter((p) => !p.pauta_date)

  const byDate = new Map()
  dated.forEach((p) => {
    if (!byDate.has(p.pauta_date)) byDate.set(p.pauta_date, [])
    byDate.get(p.pauta_date).push(p)
  })
  const dates = [...byDate.keys()].sort()

  let out = ''
  dates.forEach((dateKey) => {
    const d = parseISODate(dateKey)
    const items = [...byDate.get(dateKey)].sort((a, b) =>
      (a.salida || '').localeCompare(b.salida || ''),
    )
    out += `${DAYNAMES[d.getDay()]} ${d.getDate()} ${MON3[d.getMonth()]}\n`
    items.forEach((p) => {
      out += pautaLine(p, usersById) + '\n'
    })
    out += `TOTAL DE PAUTAS: ${items.length}\n\n`
  })
  if (!dates.length) out += '(Sin pautas agendadas con fecha en este alcance)\n\n'

  out += '⏩ Pautas por Team\n'
  lines.forEach((l) => {
    // Fallback a la línea general para las pautas de cuentas sin línea (ver pautasInScope).
    const agendadas = dated.filter((p) => (p.line_id ?? generalLineId) === l.id).length
    const porAgendar = undated.filter((p) => (p.line_id ?? generalLineId) === l.id).length
    out += `🔵 - ${l.name.toUpperCase()}: ${agendadas}${porAgendar ? ` Y ${porAgendar} P.A` : ''}\n`
  })
  out += `⏩ TOTAL DE PAUTAS: ${dated.length + undated.length}\n`

  if (undated.length) {
    out += '\n⏳ POR AGENDAR\n'
    undated.forEach((p) => {
      out += pautaLine(p, usersById) + '\n'
    })
  }
  return out.trim()
}

/**
 * Genera el texto de agenda de un solo día para copiar a WhatsApp: pautas
 * 'programada' de esa fecha exacta, sin resumen por línea.
 * @param {string} dateKey  'YYYY-MM-DD'
 * @param {Array} pautas
 * @param {Map<string,object>} usersById
 * @returns {string}
 */
export function generateDayAgendaText(dateKey, pautas, usersById) {
  const items = pautas
    .filter((p) => p.pauta_date === dateKey && p.status === 'programada')
    .sort((a, b) => (a.salida || '').localeCompare(b.salida || ''))

  const d = parseISODate(dateKey)
  let out = `${DAYNAMES[d.getDay()]} ${d.getDate()} ${MON3[d.getMonth()]}\n`
  if (!items.length) {
    out += '(Sin pautas agendadas este día)'
    return out
  }
  items.forEach((p) => {
    out += pautaLine(p, usersById) + '\n'
  })
  out += `TOTAL DE PAUTAS: ${items.length}`
  return out.trim()
}
