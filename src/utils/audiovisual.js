/**
 * Lógica pura del módulo «Tareas Fijas» (Gestión de Tareas → Tareas Fijas,
 * sub-sección Audiovisual). Todas las funciones son puras y testeables: no
 * tocan Supabase ni el DOM.
 *
 * Flujo de una pauta: 'solicitada' (jefa arma el brief y lo envía) →
 * 'programada' (coordinadora agenda fecha/recurso/asistentes) → 'realizada'
 * (se capturan piezas) | 'declinada' (no se agenda).
 */

export const FORMAT_KEYS = ['V', 'R', 'F']

export const FORMAT_LABELS = {
  V: 'Video de marca',
  R: 'Reel',
  F: 'Foto',
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

/** Pautas dentro del alcance de una línea, o todas si `lineId` es null/undefined. */
export function pautasInScope(pautas, lineId) {
  if (!lineId) return pautas
  return pautas.filter((p) => p.line_id === lineId)
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
 * Brief mínimo completo para poder solicitar una pauta: cliente + (enlace de
 * grilla O descripción de piezas).
 */
export function briefComplete(pauta) {
  return Boolean(
    pauta.client_id &&
    ((pauta.link && pauta.link.trim()) || (pauta.piezas_desc && pauta.piezas_desc.trim())),
  )
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

/**
 * Agrega piezas totales/editadas de las pautas 'realizada' por línea.
 * @param {Array} pautas
 * @param {Array<{id:string,name:string}>} lines
 * @returns {Array<{lineId:string, label:string, totales:number, editadas:number}>}
 */
export function aggregatePiezasByLine(pautas, lines) {
  const byLine = new Map()
  pautas.forEach((p) => {
    if (p.status !== 'realizada' || !p.line_id) return
    if (!byLine.has(p.line_id)) {
      const line = lines.find((l) => l.id === p.line_id)
      byLine.set(p.line_id, {
        lineId: p.line_id,
        label: line?.name ?? 'Sin línea',
        totales: 0,
        editadas: 0,
      })
    }
    const entry = byLine.get(p.line_id)
    entry.totales += Number(p.piezas_totales) || 0
    entry.editadas += Number(p.piezas_editadas) || 0
  })
  return [...byLine.values()]
}

/**
 * Rendimiento por recurso: quienes graban producen piezas totales (una pauta puede tener
 * varios recursos asignados — a cada uno se le atribuye el total completo, sin repartir),
 * quien edita produce piezas editadas — solo de pautas 'realizada'. Ordenado de mayor a
 * menor producción total.
 *
 * Cuando la pauta tiene piezas en el checklist (av_pauta_piezas), la edición se atribuye
 * pieza por pieza a cada editor real (`editor_user_id`) en vez de al único
 * `edita_user_id`/`edita_other` legacy — así el rendimiento no queda todo apilado en una
 * sola persona cuando la pauta se repartió entre varios editores. Pautas anteriores a esta
 * tabla (sin filas en `piezasByPauta`) caen al camino legacy.
 * @param {Array} pautas
 * @param {Map<string,object>} usersById
 * @param {Map<string,Array>} [piezasByPauta] — pauta_id → piezas de esa pauta
 * @returns {Array<{name:string, graba:number, edita:number}>}
 */
export function aggregateByResource(pautas, usersById, piezasByPauta) {
  const byRes = new Map()
  const add = (name, key, n) => {
    if (!name) return
    if (!byRes.has(name)) byRes.set(name, { name, graba: 0, edita: 0 })
    byRes.get(name)[key] += n
  }
  pautas.forEach((p) => {
    if (p.status !== 'realizada') return
    const piezasTotales = Number(p.piezas_totales) || 0
    resourceNames(p, usersById).forEach((name) => add(name, 'graba', piezasTotales))

    const piezas = piezasByPauta?.get(p.id)
    if (piezas?.length) {
      piezas
        .filter((pz) => pz.status === 'listo')
        .forEach((pz) => {
          const editor = pz.editor_user_id ? usersById.get(pz.editor_user_id) : null
          const name = editor ? `${editor.first_name ?? ''} ${editor.last_name ?? ''}`.trim() : null
          add(name, 'edita', 1)
        })
    } else {
      add(resourceName(p, 'edita', usersById), 'edita', Number(p.piezas_editadas) || 0)
    }
  })
  return [...byRes.values()].sort((a, b) => b.graba + b.edita - (a.graba + a.edita))
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

// ─── Checklist de piezas por editor (av_pauta_piezas) ──────────────────────

/**
 * Progreso del checklist de una pauta: piezas 'listo' sobre el total de piezas activas
 * (las canceladas no cuentan ni para el numerador ni para el denominador — no son trabajo
 * pendiente ni trabajo hecho).
 * @param {Array} piezas — piezas de UNA pauta
 * @returns {{total:number, listas:number, canceladas:number, pct:number}}
 */
export function piezasProgress(piezas) {
  const activas = (piezas ?? []).filter((pz) => pz.status !== 'cancelado')
  const listas = activas.filter((pz) => pz.status === 'listo').length
  const canceladas = (piezas ?? []).length - activas.length
  return {
    total: activas.length,
    listas,
    canceladas,
    pct: activas.length ? Math.round((listas / activas.length) * 100) : 0,
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

/** Nombre por defecto de una pieza nueva, 1-indexado — editable después por el coordinador. */
export function defaultPiezaName(index) {
  return `Video #${index + 1}`
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
export function generateAgendaText(pautas, lines, usersById, today = new Date()) {
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
    const agendadas = dated.filter((p) => p.line_id === l.id).length
    const porAgendar = undated.filter((p) => p.line_id === l.id).length
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
