// Lógica pura de Tácticas por marca (tab Tácticas de /ads). Sin React ni Supabase,
// para poder testearla y reutilizar `parseDriveId` desde netlify/functions.

const MS_DAY = 24 * 60 * 60 * 1000

// Estados que cuentan como "en marcha". `Descartado` es legado y no cubre a la marca.
const ACTIVE_STATUSES = ['Pendiente', 'En Curso']

// Umbrales de la pill de días (rojo ≤ 3 o vencida, amarillo ≤ 10, verde el resto).
export const DAYS_RED = 3
export const DAYS_YELLOW = 10

/** Hoy en Caracas como YYYY-MM-DD (el mismo "hoy" que usa el cron de cierre). */
export function todayCaracas(now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Caracas',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now)
}

function toUtcMs(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number)
  return Date.UTC(y, m - 1, d)
}

/** Días enteros de `from` a `to` (YYYY-MM-DD). Negativo si `to` ya pasó. */
export function diffDays(from, to) {
  return Math.round((toUtcMs(to) - toUtcMs(from)) / MS_DAY)
}

/** Vigente = en marcha (Pendiente/En Curso) y con la fecha de fin sin vencer. */
export function isVigente(campaign, today = todayCaracas()) {
  if (!campaign?.end_date) return false
  return ACTIVE_STATUSES.includes(campaign.status) && campaign.end_date >= today
}

/** Vigente que todavía no empezó: cubre a la marca, pero se muestra como "programada". */
export function isProgramada(campaign, today = todayCaracas()) {
  return isVigente(campaign, today) && !!campaign.start_date && campaign.start_date > today
}

/** Días que le quedan a la táctica (0 = vence hoy, negativo = ya venció). null sin fecha. */
export function daysLeft(campaign, today = todayCaracas()) {
  if (!campaign?.end_date) return null
  return diffDays(today, campaign.end_date)
}

/** 'red' | 'yellow' | 'green' según los días que quedan. */
export function daysPillTone(days) {
  if (days == null) return 'green'
  if (days <= DAYS_RED) return 'red'
  if (days <= DAYS_YELLOW) return 'yellow'
  return 'green'
}

/** Texto de la pill: "Vence hoy", "1 día", "13 días", "Venció hace 2 días". */
export function daysLabel(days) {
  if (days == null) return '—'
  if (days === 0) return 'Vence hoy'
  if (days === 1) return '1 día'
  if (days > 1) return `${days} días`
  const ago = Math.abs(days)
  return `Venció hace ${ago} ${ago === 1 ? 'día' : 'días'}`
}

/** % (0-100) del período transcurrido entre start_date y end_date, acotado. */
export function periodProgress(campaign, today = todayCaracas()) {
  if (!campaign?.start_date || !campaign?.end_date) return 0
  const total = diffDays(campaign.start_date, campaign.end_date)
  if (total <= 0) return today >= campaign.end_date ? 100 : 0
  const elapsed = diffDays(campaign.start_date, today)
  return Math.min(100, Math.max(0, Math.round((elapsed / total) * 100)))
}

/**
 * La táctica más reciente de cada marca: max(start_date), desempate por created_at.
 * Las tácticas sin client_id no pertenecen a ninguna marca y se ignoran.
 * @returns {Map<string, object>} client_id → táctica
 */
export function latestByBrand(campaigns) {
  const latest = new Map()
  for (const c of campaigns ?? []) {
    if (!c.client_id) continue
    const prev = latest.get(c.client_id)
    if (!prev) {
      latest.set(c.client_id, c)
      continue
    }
    const a = `${c.start_date ?? ''}|${c.created_at ?? ''}`
    const b = `${prev.start_date ?? ''}|${prev.created_at ?? ''}`
    if (a > b) latest.set(c.client_id, c)
  }
  return latest
}

/** Marcas (clientes) sin ninguna táctica vigente ni programada. */
export function brandsWithoutVigente(clients, campaigns, today = todayCaracas()) {
  const covered = new Set(
    (campaigns ?? []).filter((c) => c.client_id && isVigente(c, today)).map((c) => c.client_id),
  )
  return (clients ?? []).filter((cl) => !covered.has(cl.id))
}

/** Ítems de checklist hechos y totales. */
export function checklistCounts(checklist) {
  const items = Array.isArray(checklist) ? checklist : []
  return { done: items.filter((it) => it?.done).length, total: items.length }
}

/** % de cumplimiento de las acciones. null si no hay checklist (no es lo mismo que 0 %). */
export function completionPct(checklist) {
  const { done, total } = checklistCounts(checklist)
  return total ? Math.round((done / total) * 100) : null
}

/**
 * Agrupa ítems por mes ('YYYY-MM'). Los que no traen mes van al grupo ''.
 * @returns {Array<{ month: string, items: object[] }>} ordenado por mes; '' al final.
 */
export function groupByMonth(items) {
  const groups = new Map()
  for (const it of Array.isArray(items) ? items : []) {
    const key = it?.month || ''
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key).push(it)
  }
  return [...groups.entries()]
    .sort(([a], [b]) => {
      if (a === b) return 0
      if (a === '') return 1
      if (b === '') return -1
      return a < b ? -1 : 1
    })
    .map(([month, list]) => ({ month, items: list }))
}

const MONTH_NAMES = [
  'Enero',
  'Febrero',
  'Marzo',
  'Abril',
  'Mayo',
  'Junio',
  'Julio',
  'Agosto',
  'Septiembre',
  'Octubre',
  'Noviembre',
  'Diciembre',
]

/** 'YYYY-MM' → 'Noviembre 2026'. '' → 'Sin mes'. */
export function monthLabel(month) {
  if (!month) return 'Sin mes'
  const [y, m] = month.split('-').map(Number)
  return MONTH_NAMES[m - 1] ? `${MONTH_NAMES[m - 1]} ${y}` : month
}

/**
 * Saca el id de un link de Drive: carpeta, archivo o Google Doc.
 * Acepta /folders/<id>, /drive/u/N/folders/<id>, /file/d/<id>, /document/d/<id> y ?id=<id>.
 * @returns {{ id: string, kind: 'folder' | 'file' | 'document' | 'unknown' } | null}
 */
export function parseDriveId(url) {
  if (typeof url !== 'string') return null
  let u
  try {
    u = new URL(url.trim())
  } catch {
    return null
  }
  if (u.hostname !== 'drive.google.com' && u.hostname !== 'docs.google.com') return null
  const ID = '([A-Za-z0-9_-]{10,})'
  const folder = u.pathname.match(new RegExp(`/folders/${ID}`))
  if (folder) return { id: folder[1], kind: 'folder' }
  const file = u.pathname.match(new RegExp(`/file/d/${ID}`))
  if (file) return { id: file[1], kind: 'file' }
  const doc = u.pathname.match(new RegExp(`/document/d/${ID}`))
  if (doc) return { id: doc[1], kind: 'document' }
  const param = u.searchParams.get('id')
  if (param && new RegExp(`^${ID}$`).test(param)) return { id: param, kind: 'unknown' }
  return null
}

/**
 * Fecha (YYYY-MM-DD) a la que se atribuye una táctica cerrada, para el score: la menor entre
 * el cierre real (en Caracas) y su fecha de fin. Así una táctica que el cierre automático pasó a
 * Finalizado el día siguiente a su fin no se corre al mes siguiente; y si se cerró antes de
 * tiempo, cuenta en el mes en que se cerró. Sin `closed_at` usa `end_date`.
 * Espejo de la RPC `employee_score_inputs` (migración 20261126100000).
 * @returns {string | null}
 */
export function closeDateOf(campaign) {
  if (!campaign?.end_date) return null
  if (!campaign.closed_at) return campaign.end_date
  const closed = todayCaracas(new Date(campaign.closed_at))
  return closed < campaign.end_date ? closed : campaign.end_date
}

/**
 * Contenido de un insumo (lo que la táctica de origen deja para la siguiente), derivado EN VIVO
 * de su checklist: no se guarda una copia, así que tildar algo después de cerrar lo refleja.
 * @returns {{ done: object[], pending: object[], total: number, pct: number | null }}
 */
export function handoffContent(source) {
  const items = Array.isArray(source?.checklist) ? source.checklist : []
  const done = items.filter((it) => it?.done)
  const pending = items.filter((it) => !it?.done)
  return { done, pending, total: items.length, pct: completionPct(items) }
}

/**
 * Convierte acciones pendientes de la táctica anterior en acciones de la nueva: sin tildar, sin el
 * mes viejo, y marcadas con la táctica de la que vienen. Conservan su `id`, que es lo que permite
 * saber cuáles ya se arrastraron.
 */
export function carryOverItem(item, sourceId) {
  const { month: _month, ...rest } = item
  return { ...rest, done: false, carried_from: sourceId }
}

/**
 * Nombre de la jefa de la línea de una marca. La línea se deriva del cliente
 * (metric_clients.line_id) y la jefa es el miembro con is_lead (lead_user_id).
 * @returns {string | null}
 */
export function leadNameOf(clientId, clientsById, linesById, usersMap) {
  const line = linesById?.get(clientsById?.get(clientId)?.line_id)
  if (!line?.lead_user_id) return null
  return usersMap?.get(line.lead_user_id) ?? null
}

/** Normaliza el campo del formulario: vacío → null (patrón de meetings.minuta_url). */
export function normalizeDriveUrl(value) {
  const v = typeof value === 'string' ? value.trim() : ''
  return v || null
}
