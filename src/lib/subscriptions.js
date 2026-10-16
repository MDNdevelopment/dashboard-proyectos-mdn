import { supabase } from '../supabase'

const COLUMNS =
  'id, company_id, name, category, amount, currency, frequency, billing_day, billing_month, card_last4, owner_user_id, account_email, url, status, start_date, cancelled_at, comment, created_by, created_at, updated_at'

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
