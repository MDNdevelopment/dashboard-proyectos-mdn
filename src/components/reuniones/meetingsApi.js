/**
 * Capa de acceso a datos para el módulo Reuniones.
 * Todas las funciones hacen queries a Supabase y retornan { data, error } (o el resultado
 * del insert/update/delete de supabase-js).
 */
import { supabase } from '../../supabase'

// ─── Lectura ──────────────────────────────────────────────────────────────────

/**
 * Carga las reuniones de la empresa. `from`/`to` son opcionales (ISO strings o Date) y
 * acotan por starts_at — útil para traer solo el mes visible del calendario.
 */
export async function loadMeetings(companyId, { from, to } = {}) {
  let q = supabase.from('meetings').select('*').eq('company_id', companyId)
  if (from) q = q.gte('starts_at', toISO(from))
  if (to) q = q.lt('starts_at', toISO(to))
  return q.order('starts_at')
}

/**
 * Cuenta los CLIENTES DISTINTOS con al menos una reunión marcada manualmente como
 * "realizada" en una línea, dentro de un mes/año dado (máx. 1 por cliente, para que la
 * meta represente cobertura de cartera y no se pueda cumplir reuniéndose repetidas veces
 * con el mismo cliente). Reuniones sin ningún client_id (caso borde, cliente eliminado sin
 * soft-delete) se cuentan cada una por separado, ya que no se pueden agrupar por cliente.
 * 100% fiel al marcado manual — no hay fallback por fecha vencida: si nadie marcó la
 * reunión, no cuenta. Usado por Reportes → Operaciones para sembrar `reuniones.realizadas`.
 *
 * Una reunión puede tener marcas de varias líneas (client_ids/line_ids son arreglos
 * posicionales, ver migración 20260915000000). Se filtra por `.contains("line_ids", [lineId])`
 * para no perder reuniones donde la línea consultada no es la primera marca, y luego, al
 * expandir, solo se cuentan las posiciones cuyo line_ids[i] es la línea pedida — así una
 * reunión con marcas de dos líneas aporta a cada línea únicamente sus propias marcas.
 */
export async function countMeetingsHeldForLine(companyId, lineId, { month, year }) {
  const monthStart = new Date(year, month - 1, 1)
  const monthEnd = new Date(year, month, 1)

  const { data, error } = await supabase
    .from('meetings')
    .select('client_ids, line_ids')
    .eq('company_id', companyId)
    .contains('line_ids', [lineId])
    .eq('status', 'realizada')
    .gte('starts_at', monthStart.toISOString())
    .lt('starts_at', monthEnd.toISOString())

  if (error) return { count: 0, error }

  const clientIds = clientIdsForLine(data ?? [], lineId)
  const distinctClients = new Set(clientIds.filter((id) => id != null))
  const nullClientCount = clientIds.filter((id) => id == null).length
  return { count: distinctClients.size + nullClientCount, error: null }
}

/**
 * Devuelve los client_id distintos con al menos una reunión "realizada" de una línea en
 * un mes/año dado — usado por Reportes → Operaciones para pintar, marca por marca, cuáles
 * ya cubrieron su reunión del período (mismos filtros que countMeetingsHeldForLine, pero
 * expone el conjunto de clientes en vez de solo el número).
 */
export async function loadHeldClientIdsForLine(companyId, lineId, { month, year }) {
  const monthStart = new Date(year, month - 1, 1)
  const monthEnd = new Date(year, month, 1)

  const { data, error } = await supabase
    .from('meetings')
    .select('client_ids, line_ids')
    .eq('company_id', companyId)
    .contains('line_ids', [lineId])
    .eq('status', 'realizada')
    .gte('starts_at', monthStart.toISOString())
    .lt('starts_at', monthEnd.toISOString())

  if (error) return { clientIds: [], error }

  const clientIds = [...new Set(clientIdsForLine(data ?? [], lineId).filter((id) => id != null))]
  return { clientIds, error: null }
}

/** Expande client_ids/line_ids (arreglos posicionales) a los client_id cuya posición
 * corresponde a `lineId` — una reunión sin ningún cliente (arreglos vacíos) aporta un
 * único `null`, para conservar el caso borde de "cuenta aparte" del criterio original. */
function clientIdsForLine(rows, lineId) {
  return rows.flatMap((r) => {
    const clientIds = r.client_ids ?? []
    const lineIds = r.line_ids ?? []
    if (clientIds.length === 0) return [null]
    return clientIds.filter((_, i) => lineIds[i] === lineId)
  })
}

// ─── Escritura ────────────────────────────────────────────────────────────────

/**
 * Resuelve client_names/line_ids a partir de los client_ids elegidos (snapshot al momento
 * de crear/editar — ver nota en la migración de `meetings`: si un cliente cambia de línea
 * después, la reunión conserva la línea de cuando se agendó). Los arreglos quedan en el
 * mismo orden en que el usuario los eligió; los escalares client_id/client_name/line_id
 * (compatibilidad con lectores que aún esperan un solo cliente — monitor de Uso, MAPPI,
 * MCP) son siempre la posición 0.
 */
async function resolveClientsSnapshot(clientIds) {
  const ids = (clientIds ?? []).filter(Boolean)
  if (ids.length === 0) {
    return {
      client_ids: [],
      client_names: [],
      line_ids: [],
      client_id: null,
      client_name: null,
      line_id: null,
    }
  }
  const { data } = await supabase.from('metric_clients').select('id, name, line_id').in('id', ids)
  const byId = new Map((data ?? []).map((c) => [c.id, c]))
  const client_names = ids.map((id) => byId.get(id)?.name ?? '')
  const line_ids = ids.map((id) => byId.get(id)?.line_id ?? null)
  return {
    client_ids: ids,
    client_names,
    line_ids,
    client_id: ids[0],
    client_name: client_names[0] || null,
    line_id: line_ids[0],
  }
}

export async function createMeeting(companyId, fields, createdBy) {
  const { client_id, client_name, client_ids, client_names, line_id, line_ids } =
    await resolveClientsSnapshot(fields.client_ids)
  return supabase
    .from('meetings')
    .insert({
      ...sanitizeFields(fields),
      company_id: companyId,
      client_id,
      client_name,
      client_ids,
      client_names,
      line_id,
      line_ids,
      created_by: createdBy ?? null,
    })
    .select()
    .single()
}

export async function updateMeeting(meetingId, fields) {
  const updates = { ...sanitizeFields(fields), updated_at: new Date().toISOString() }
  if ('client_ids' in fields) {
    const { client_id, client_name, client_ids, client_names, line_id, line_ids } =
      await resolveClientsSnapshot(fields.client_ids)
    updates.client_id = client_id
    updates.client_name = client_name
    updates.client_ids = client_ids
    updates.client_names = client_names
    updates.line_id = line_id
    updates.line_ids = line_ids
  }
  return supabase.from('meetings').update(updates).eq('id', meetingId).select().single()
}

/** Cancelar = equivalente a "se movió/canceló" en WhatsApp. No borra el registro. */
export async function cancelMeeting(meetingId) {
  return supabase
    .from('meetings')
    .update({ status: 'cancelada', updated_at: new Date().toISOString() })
    .eq('id', meetingId)
    .select()
    .single()
}

/**
 * Marca la reunión como realizada a mano — se ve con check en el calendario. El link de
 * la minuta (Google Drive) es un dato aparte, opcional, que se agrega/edita después vía
 * `updateMeeting` (nunca bloquea el marcado).
 */
export async function markMeetingHeld(meetingId) {
  return supabase
    .from('meetings')
    .update({ status: 'realizada', updated_at: new Date().toISOString() })
    .eq('id', meetingId)
    .select()
    .single()
}

/** Desmarca una reunión realizada — vuelve a 'programada' (puede volver a alerta si ya venció). */
export async function unmarkMeetingHeld(meetingId) {
  return supabase
    .from('meetings')
    .update({ status: 'programada', updated_at: new Date().toISOString() })
    .eq('id', meetingId)
    .select()
    .single()
}

export async function deleteMeeting(meetingId) {
  return supabase.from('meetings').delete().eq('id', meetingId)
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function toISO(value) {
  return value instanceof Date ? value.toISOString() : value
}

/**
 * Solo persiste el campo de la modalidad activa (location o meeting_url); el otro
 * se guarda en null para que la UI y los emails muestren un único dato sin ambigüedad.
 */
function sanitizeFields(fields) {
  const {
    title,
    starts_at,
    ends_at,
    modality,
    location,
    meeting_url,
    notes,
    attendee_ids,
    status,
    minuta_url,
    minuta_text,
  } = fields
  const out = {}
  if (title !== undefined) out.title = title
  if (starts_at !== undefined) out.starts_at = starts_at
  if (ends_at !== undefined) out.ends_at = ends_at || null
  if (notes !== undefined) out.notes = notes
  if (attendee_ids !== undefined) out.attendee_ids = attendee_ids
  if (status !== undefined) out.status = status
  if (minuta_url !== undefined) out.minuta_url = minuta_url || null
  if (minuta_text !== undefined) out.minuta_text = minuta_text?.trim() || null
  if (modality !== undefined) {
    out.modality = modality
    out.location = modality === 'presencial' ? location || null : null
    out.meeting_url = modality === 'videollamada' ? meeting_url || null : null
  }
  return out
}
