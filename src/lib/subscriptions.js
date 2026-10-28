import { supabase } from '../supabase'

const COLUMNS =
  'id, company_id, name, category, service_type, amount, currency, frequency, billing_day, billing_month, card_last4, owner_user_id, account_email, url, status, start_date, cancelled_at, comment, created_by, created_at, updated_at'

/** Todas las suscripciones de la empresa. La RLS exige `empresa.suscripciones`. */
export async function fetchSubscriptions(companyId) {
  if (!companyId) return []
  const { data, error } = await supabase
    .from('company_subscriptions')
    .select(COLUMNS)
    .eq('company_id', companyId)
    .order('name')
  if (error) throw error
  return data ?? []
}

/** Crea una suscripción. La RLS exige `empresa.suscripciones.manage`. */
export async function createSubscription(companyId, fields, createdBy) {
  const { data, error } = await supabase
    .from('company_subscriptions')
    .insert({ ...fields, company_id: companyId, created_by: createdBy ?? null })
    .select(COLUMNS)
    .single()
  if (error) throw error
  return data
}

export async function updateSubscription(id, fields) {
  const { data, error } = await supabase
    .from('company_subscriptions')
    .update({ ...fields, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select(COLUMNS)
    .single()
  if (error) throw error
  return data
}

export async function deleteSubscription(id) {
  const { error } = await supabase.from('company_subscriptions').delete().eq('id', id)
  if (error) throw error
}

// ── Asignaciones a líneas / departamentos ───────────────────────────────────────

const ALLOC_COLUMNS =
  'id, company_id, subscription_id, line_id, department_id, share_pct, created_at'

/** Asignaciones de toda la empresa. La RLS exige `empresa.suscripciones`. */
export async function fetchAllocations(companyId) {
  if (!companyId) return []
  const { data, error } = await supabase
    .from('company_subscription_allocations')
    .select(ALLOC_COLUMNS)
    .eq('company_id', companyId)
    .order('created_at')
  if (error) throw error
  return data ?? []
}

/**
 * Reemplaza el conjunto de asignaciones de UNA suscripción (borra las suyas e inserta las
 * nuevas). `allocations`: [{ line_id? , department_id?, share_pct? }].
 */
export async function saveAllocations(subscriptionId, companyId, allocations) {
  const { error: delErr } = await supabase
    .from('company_subscription_allocations')
    .delete()
    .eq('subscription_id', subscriptionId)
  if (delErr) throw delErr
  if (!allocations.length) return
  const rows = allocations.map((a) => ({
    subscription_id: subscriptionId,
    company_id: companyId,
    line_id: a.line_id ?? null,
    department_id: a.department_id ?? null,
    share_pct: a.share_pct === '' || a.share_pct == null ? null : Number(a.share_pct),
  }))
  const { error } = await supabase.from('company_subscription_allocations').insert(rows)
  if (error) throw error
}

/**
 * Costos de suscripciones por línea para el reporte mensual (RPC con el mismo alcance que
 * la RLS de metric_reports; no requiere `empresa.suscripciones`). Un fallo no debe romper el
 * reporte ni borrar filas ya guardadas: devuelve `null` (= "no se pudo cargar", el llamador
 * no sincroniza) y avisa por consola.
 */
export async function loadLineSubscriptionCosts(companyId) {
  if (!companyId) return null
  try {
    const { data, error } = await supabase.rpc('line_subscription_costs', {
      p_company_id: String(companyId),
    })
    if (error) throw error
    return data ?? []
  } catch (err) {
    console.warn('[suscripciones] no se pudieron cargar los costos por línea', err)
    return null
  }
}
