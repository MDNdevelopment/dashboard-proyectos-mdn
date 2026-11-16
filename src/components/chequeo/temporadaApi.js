/**
 * Capa de acceso a datos del «Chequeo de temporada». Mismo patrón que chequeoApi.js: cada
 * función hace queries a Supabase y retorna { data, error }.
 */
import { supabase } from '../../supabase'
import { selectAllPages } from '../../lib/supabasePaginate'

/** Temporadas de la empresa, la más reciente primero. */
export async function loadCampaigns(companyId) {
  return supabase
    .from('seasonal_campaigns')
    .select('*')
    .eq('company_id', companyId)
    .order('starts_on', { ascending: false })
}

/** Todas las piezas de una temporada (paginadas: ~80 clientes × varios slots superan 1000). */
export async function loadPieces(campaignId) {
  return selectAllPages((from, to) =>
    supabase
      .from('seasonal_pieces')
      .select('*', { count: 'exact' })
      .eq('campaign_id', campaignId)
      .order('id', { ascending: true })
      .range(from, to),
  )
}

/**
 * Crea la pieza o cambia su estado. Upsert por la unique key (campaña, cliente, slot, tipo).
 * `lineId` debe venir de `effectiveLineId(client, generalLineId)` para no chocar con RLS.
 */
export async function upsertPiece({
  companyId,
  campaignId,
  clientId,
  lineId,
  slotKey,
  pieceType,
  status = 'pendiente',
  userId,
}) {
  return supabase
    .from('seasonal_pieces')
    .upsert(
      {
        company_id: companyId,
        campaign_id: campaignId,
        client_id: clientId,
        line_id: lineId,
        slot_key: slotKey,
        piece_type: pieceType,
        status,
        updated_by: userId ?? null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'campaign_id,client_id,slot_key,piece_type' },
    )
    .select()
    .single()
}

/** Quita una pieza (el formato deja de aplicar a esa celda). */
export async function deletePiece(pieceId) {
  return supabase.from('seasonal_pieces').delete().eq('id', pieceId)
}

/** Asignaciones manuales de personal de una temporada (jefe, SM, diseño, audiovisual). */
export async function loadAssignments(campaignId) {
  return selectAllPages((from, to) =>
    supabase
      .from('seasonal_assignments')
      .select('*', { count: 'exact' })
      .eq('campaign_id', campaignId)
      .order('id', { ascending: true })
      .range(from, to),
  )
}

/**
 * Fija a mano quién va en una casilla de personal. `userId` null = «Sin asignar» a propósito
 * (distinto de no tener fila, que significa «usar el valor de MAPPI»).
 */
export async function upsertAssignment({
  companyId,
  campaignId,
  clientId,
  lineId,
  role,
  userId,
  updatedBy,
}) {
  return supabase
    .from('seasonal_assignments')
    .upsert(
      {
        company_id: companyId,
        campaign_id: campaignId,
        client_id: clientId,
        line_id: lineId,
        role,
        user_id: userId ?? null,
        updated_by: updatedBy ?? null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'campaign_id,client_id,role' },
    )
    .select()
    .single()
}

/** Vuelve la casilla al valor de MAPPI (borra la asignación manual). */
export async function deleteAssignment(assignmentId) {
  return supabase.from('seasonal_assignments').delete().eq('id', assignmentId)
}
