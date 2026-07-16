/**
 * Capa de acceso a datos para el módulo Reuniones.
 * Todas las funciones hacen queries a Supabase y retornan { data, error } (o el resultado
 * del insert/update/delete de supabase-js).
 */
import { supabase } from "../../supabase";

// ─── Lectura ──────────────────────────────────────────────────────────────────

/**
 * Carga las reuniones de la empresa. `from`/`to` son opcionales (ISO strings o Date) y
 * acotan por starts_at — útil para traer solo el mes visible del calendario.
 */
export async function loadMeetings(companyId, { from, to } = {}) {
  let q = supabase
    .from("meetings")
    .select("*")
    .eq("company_id", companyId);
  if (from) q = q.gte("starts_at", toISO(from));
  if (to) q = q.lt("starts_at", toISO(to));
  return q.order("starts_at");
}

/**
 * Cuenta los CLIENTES DISTINTOS con al menos una reunión marcada manualmente como
 * "realizada" en una línea, dentro de un mes/año dado (máx. 1 por cliente, para que la
 * meta represente cobertura de cartera y no se pueda cumplir reuniéndose repetidas veces
 * con el mismo cliente). Reuniones sin client_id (caso borde, cliente eliminado sin
 * soft-delete) se cuentan cada una por separado, ya que no se pueden agrupar por cliente.
 * 100% fiel al marcado manual — no hay fallback por fecha vencida: si nadie marcó la
 * reunión, no cuenta. Usado por Reportes → Operaciones para sembrar `reuniones.realizadas`.
 */
export async function countMeetingsHeldForLine(companyId, lineId, { month, year }) {
  const monthStart = new Date(year, month - 1, 1);
  const monthEnd = new Date(year, month, 1);

  const { data, error } = await supabase
    .from("meetings")
    .select("client_id")
    .eq("company_id", companyId)
    .eq("line_id", lineId)
    .eq("status", "realizada")
    .gte("starts_at", monthStart.toISOString())
    .lt("starts_at", monthEnd.toISOString());

  if (error) return { count: 0, error };

  const rows = data ?? [];
  const distinctClients = new Set(rows.filter(r => r.client_id != null).map(r => r.client_id));
  const nullClientCount = rows.filter(r => r.client_id == null).length;
  return { count: distinctClients.size + nullClientCount, error: null };
}

/**
 * Devuelve los client_id distintos con al menos una reunión "realizada" de una línea en
 * un mes/año dado — usado por Reportes → Operaciones para pintar, marca por marca, cuáles
 * ya cubrieron su reunión del período (mismos filtros que countMeetingsHeldForLine, pero
 * expone el conjunto de clientes en vez de solo el número).
 */
export async function loadHeldClientIdsForLine(companyId, lineId, { month, year }) {
  const monthStart = new Date(year, month - 1, 1);
  const monthEnd = new Date(year, month, 1);

  const { data, error } = await supabase
    .from("meetings")
    .select("client_id")
    .eq("company_id", companyId)
    .eq("line_id", lineId)
    .eq("status", "realizada")
    .gte("starts_at", monthStart.toISOString())
    .lt("starts_at", monthEnd.toISOString());

  if (error) return { clientIds: [], error };

  const clientIds = [...new Set((data ?? []).filter(r => r.client_id != null).map(r => r.client_id))];
  return { clientIds, error: null };
}

// ─── Escritura ────────────────────────────────────────────────────────────────

/**
 * Resuelve line_id/client_name a partir del client_id elegido (snapshot al momento de
 * crear/editar — ver nota en la migración de `meetings`: si el cliente cambia de línea
 * después, la reunión conserva la línea de cuando se agendó).
 */
async function resolveClientSnapshot(clientId) {
  if (!clientId) return { client_name: null, line_id: null };
  const { data } = await supabase
    .from("metric_clients")
    .select("name, line_id")
    .eq("id", clientId)
    .maybeSingle();
  return { client_name: data?.name ?? null, line_id: data?.line_id ?? null };
}

export async function createMeeting(companyId, fields, createdBy) {
  const { client_name, line_id } = await resolveClientSnapshot(fields.client_id);
  return supabase
    .from("meetings")
    .insert({
      ...sanitizeFields(fields),
      company_id: companyId,
      client_name,
      line_id,
      created_by: createdBy ?? null,
    })
    .select()
    .single();
}

export async function updateMeeting(meetingId, fields) {
  const updates = { ...sanitizeFields(fields), updated_at: new Date().toISOString() };
  if ("client_id" in fields) {
    const { client_name, line_id } = await resolveClientSnapshot(fields.client_id);
    updates.client_name = client_name;
    updates.line_id = line_id;
  }
  return supabase
    .from("meetings")
    .update(updates)
    .eq("id", meetingId)
    .select()
    .single();
}

/** Cancelar = equivalente a "se movió/canceló" en WhatsApp. No borra el registro. */
export async function cancelMeeting(meetingId) {
  return supabase
    .from("meetings")
    .update({ status: "cancelada", updated_at: new Date().toISOString() })
    .eq("id", meetingId)
    .select()
    .single();
}

/**
 * Marca la reunión como realizada a mano — se ve con check en el calendario. El link de
 * la minuta (Google Drive) es un dato aparte, opcional, que se agrega/edita después vía
 * `updateMeeting` (nunca bloquea el marcado).
 */
export async function markMeetingHeld(meetingId) {
  return supabase
    .from("meetings")
    .update({ status: "realizada", updated_at: new Date().toISOString() })
    .eq("id", meetingId)
    .select()
    .single();
}

/** Desmarca una reunión realizada — vuelve a 'programada' (puede volver a alerta si ya venció). */
export async function unmarkMeetingHeld(meetingId) {
  return supabase
    .from("meetings")
    .update({ status: "programada", updated_at: new Date().toISOString() })
    .eq("id", meetingId)
    .select()
    .single();
}

export async function deleteMeeting(meetingId) {
  return supabase.from("meetings").delete().eq("id", meetingId);
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function toISO(value) {
  return value instanceof Date ? value.toISOString() : value;
}

/**
 * Solo persiste el campo de la modalidad activa (location o meeting_url); el otro
 * se guarda en null para que la UI y los emails muestren un único dato sin ambigüedad.
 */
function sanitizeFields(fields) {
  const {
    title, client_id, starts_at, ends_at, modality, location, meeting_url, notes,
    attendee_ids, status, minuta_url,
  } = fields;
  const out = {};
  if (title !== undefined) out.title = title;
  if (client_id !== undefined) out.client_id = client_id || null;
  if (starts_at !== undefined) out.starts_at = starts_at;
  if (ends_at !== undefined) out.ends_at = ends_at || null;
  if (notes !== undefined) out.notes = notes;
  if (attendee_ids !== undefined) out.attendee_ids = attendee_ids;
  if (status !== undefined) out.status = status;
  if (minuta_url !== undefined) out.minuta_url = minuta_url || null;
  if (modality !== undefined) {
    out.modality = modality;
    out.location = modality === "presencial" ? (location || null) : null;
    out.meeting_url = modality === "videollamada" ? (meeting_url || null) : null;
  }
  return out;
}
