/**
 * Capa de acceso a datos para la pauta pagada (tabla `paid_campaigns`).
 * Distinta de `campaigns` (tácticas orgánicas): un "ad" es dinero asignado
 * a un cliente en un plazo concreto. Todas las funciones retornan { data, error }.
 * NOTA: la tabla se llama `paid_campaigns`, NO `ads` — un bloqueador de anuncios
 * bloquea por defecto peticiones REST con "/ads?..." en la URL (ver migración
 * 20260715000000_rename_ads_to_paid_campaigns.sql y el gotcha en ARQUITECTURA.md).
 */
import { supabase } from "../../supabase";

export async function loadAds(companyId) {
  return supabase
    .from("paid_campaigns")
    .select("*")
    .eq("company_id", companyId)
    .order("start_date", { ascending: false });
}

export async function createAd(companyId, fields) {
  const {
    client_id = null,
    client = null,
    name,
    objective = null,
    piece_url = null,
    amount = 0,
    start_date,
    end_date,
    status = "Pendiente",
    responsable_id = null,
    created_by = null,
  } = fields;
  return supabase
    .from("paid_campaigns")
    .insert({
      company_id: companyId,
      client_id,
      client,
      name,
      objective,
      piece_url,
      amount,
      start_date,
      end_date,
      status,
      responsable_id,
      created_by,
    })
    .select()
    .single();
}

export async function updateAd(adId, updates) {
  return supabase
    .from("paid_campaigns")
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq("id", adId)
    .select()
    .single();
}

export async function deleteAd(adId) {
  return supabase.from("paid_campaigns").delete().eq("id", adId);
}

/**
 * Lista acotada de responsables seleccionables para un Ad: usuarios marcados
 * como `ads_responsable_fixed` (ej. Katherine, Paola) + jefas de línea
 * (`metric_line_members.is_lead = true`), NO toda la plantilla de la empresa
 * (a diferencia del Responsable de Tácticas, que usa UserPickerSingle con
 * todos los empleados).
 *
 * `metric_line_members.user_id` es texto sin FK declarada a `users` (mismo
 * criterio que `assignee`/`created_by` en el resto de la app), así que no se
 * puede usar el embed automático de PostgREST — de ahí las consultas
 * encadenadas en vez de un solo JOIN.
 */
export async function loadAdsResponsables(companyId) {
  const [{ data: fixed }, { data: lines }] = await Promise.all([
    supabase
      .from("users")
      .select("user_id, first_name, last_name")
      .eq("company_id", companyId)
      .eq("ads_responsable_fixed", true)
      .is("deleted_at", null),
    supabase.from("metric_lines").select("id").eq("company_id", companyId),
  ]);

  const lineIds = (lines ?? []).map((l) => l.id);
  let leads = [];
  if (lineIds.length) {
    const { data: leadMembers } = await supabase
      .from("metric_line_members")
      .select("user_id")
      .in("line_id", lineIds)
      .eq("is_lead", true);
    const leadIds = [...new Set((leadMembers ?? []).map((m) => m.user_id))];
    if (leadIds.length) {
      const { data: leadUsers } = await supabase
        .from("users")
        .select("user_id, first_name, last_name")
        .in("user_id", leadIds)
        .is("deleted_at", null);
      leads = leadUsers ?? [];
    }
  }

  const byId = new Map();
  [...(fixed ?? []), ...leads].forEach((u) => byId.set(u.user_id, u));
  return {
    data: [...byId.values()].sort((a, b) => a.first_name.localeCompare(b.first_name)),
    error: null,
  };
}

/**
 * Formatea una fecha YYYY-MM-DD como "5 jul 2026" (locale es-VE).
 * Compartido entre AdsCard.jsx (Tácticas) y AdsSpendView.jsx (Ads).
 */
export function fmtDate(dateStr) {
  if (!dateStr) return "—";
  return new Date(dateStr + "T00:00:00").toLocaleDateString("es-VE", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

/**
 * Clase de color según qué tan cerca/vencida está una fecha (para "Fecha fin").
 * Compartido entre AdsCard.jsx (Tácticas) y AdsSpendView.jsx (Ads).
 */
export function dateColor(dateStr) {
  if (!dateStr) return "";
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const d = new Date(dateStr + "T00:00:00");
  const diff = Math.ceil((d - today) / (1000 * 60 * 60 * 24));
  if (diff < 0) return "text-red-600 font-semibold";
  if (diff <= 3) return "text-[#f57f17] font-semibold";
  return "text-[#333]";
}

/**
 * ¿La fecha (YYYY-MM-DD) cae dentro del mes/año dado?
 * Se usa tanto para filtrar por periodo como para el tracking de presupuesto.
 */
export function inPeriod(dateStr, { month, year }) {
  if (!dateStr) return false;
  const [y, m] = dateStr.split("-").map(Number);
  return y === year && m === month;
}

/**
 * Duración en días de un plazo [start_date, end_date] (ambos inclusive).
 */
export function durationDays(startDate, endDate) {
  if (!startDate || !endDate) return null;
  const start = new Date(startDate + "T00:00:00");
  const end = new Date(endDate + "T00:00:00");
  const diff = Math.round((end - start) / (1000 * 60 * 60 * 24));
  return diff >= 0 ? diff + 1 : null;
}

/**
 * ¿El rango [start_date, end_date] abarca (solapa) el mes/año dado?
 * Un rango que empieza en un mes y termina en otro cae en TODOS los meses
 * intermedios inclusive. Si no hay end_date, equivale a inPeriod(start_date).
 * Solo se usa en el tab Tácticas; el tab Ads sigue con inPeriod (start_date).
 */
export function spansPeriod(startDate, endDate, { month, year }) {
  if (!startDate) return false;
  const target = year * 12 + month;                 // clave mes/año del período
  const [sy, sm] = startDate.split("-").map(Number);
  const startKey = sy * 12 + sm;
  if (!endDate) return startKey === target;         // fallback: solo inicio
  const [ey, em] = endDate.split("-").map(Number);
  const endKey = ey * 12 + em;
  return startKey <= target && target <= endKey;    // solapamiento inclusive
}

/**
 * Suma de montos de ads de un cliente cuyo start_date cae en el mes/año dado.
 * Usado para el aviso de sobrepaso de presupuesto y el tracking por periodo.
 * @param {Array} ads       — lista de ads ya cargados
 * @param {string} clientId
 * @param {{month:number, year:number}} periodo
 * @param {string} [excludeId] — id de ad a excluir (edición in-place)
 */
export function spentByClientInPeriod(ads, clientId, periodo, excludeId = null) {
  return ads
    .filter(a => a.client_id === clientId && a.id !== excludeId && inPeriod(a.start_date, periodo))
    .reduce((sum, a) => sum + (Number(a.amount) || 0), 0);
}
