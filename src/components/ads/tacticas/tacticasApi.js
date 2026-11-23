import { supabase } from '../../../supabase'

/**
 * Actualiza una táctica (tabla `campaigns`) y devuelve la fila resultante.
 * La RLS exige `ads.manage` para escribir; la UI ya oculta los controles sin esa capability.
 */
export async function updateCampaign(id, patch) {
  return supabase
    .from('campaigns')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single()
}

/**
 * Insumos pendientes (tácticas cerradas cuyo relevo aún no se hizo). Una sola consulta y sin JOIN
 * de Supabase (convención del módulo): el contenido se resuelve en el cliente con las tácticas ya
 * cargadas, vía `handoffContent`.
 */
export async function loadPendingHandoffs() {
  return supabase.from('campaign_handoffs').select('*').eq('status', 'pendiente')
}

/** Marca un insumo como usado o descartado. */
export async function updateHandoff(id, patch) {
  return supabase
    .from('campaign_handoffs')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single()
}
