/**
 * Capa de datos del módulo CNP (Contenido No Planificado) — solicitudes de clientes
 * fuera de la planificación normal. Tabla: cnp_requests (ver migración
 * 20260901000000_create_cnp.sql).
 */
import { supabase } from '../../supabase'
import { cnpPieceCount, cnpPiecesDelivered, canCloseCnp, closeBlockedReason } from './constants'

export { canCloseCnp, closeBlockedReason }

/**
 * Carga los CNP de una empresa, opcionalmente acotados a una línea.
 * Excluye soft-deletes (deleted_at). No filtra por mes aquí — el filtrado por
 * período se hace en memoria en CnpPage, igual que TareasPage con `tasks`.
 */
export async function loadCnp(companyId, { lineId = null } = {}) {
  let query = supabase
    .from('cnp_requests')
    .select('*')
    .eq('company_id', companyId)
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
  if (lineId) query = query.eq('line_id', lineId)
  return query
}

export async function createCnp(payload) {
  return supabase.from('cnp_requests').insert(payload).select().single()
}

export async function updateCnp(id, payload) {
  return supabase.from('cnp_requests').update(payload).eq('id', id).select().single()
}

export async function softDeleteCnp(id) {
  return supabase
    .from('cnp_requests')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single()
}

/**
 * Check 1 — revisión del equipo. Al desmarcarlo se limpia también el check 2
 * (print_approved_*), para no dejar una aprobación de impresión huérfana de la
 * revisión que la precede.
 */
export async function setTeamCheck(id, checked, userId) {
  const patch = checked
    ? { team_checked_at: new Date().toISOString(), team_checked_by: userId }
    : {
        team_checked_at: null,
        team_checked_by: null,
        print_approved_at: null,
        print_approved_by: null,
      }
  return supabase.from('cnp_requests').update(patch).eq('id', id).select().single()
}

/** Check 2 — aprobación de impresión. Solo aplicable si ya existe el check 1. */
export async function setPrintApproval(id, approved, userId) {
  const patch = approved
    ? { print_approved_at: new Date().toISOString(), print_approved_by: userId }
    : { print_approved_at: null, print_approved_by: null }
  return supabase.from('cnp_requests').update(patch).eq('id', id).select().single()
}

/**
 * Cuenta piezas solicitadas vs entregadas de CNP para una línea en un mes dado — usado
 * por el indicador "Solicitudes vs Entregados" de Reportes → Operaciones
 * (ver src/components/metricas/OperacionesView.jsx y SOLICITUDES_MODULE_START).
 * La unidad del lado CNP es la PIEZA, no el requerimiento: un CNP con `pieces` (varias
 * piezas de un mismo requerimiento) cuenta cada pieza, no 1 (ver cnpPieceCount). Un CNP
 * "Terminado" cuenta todas sus piezas como entregadas (cnpPiecesDelivered).
 */
export async function countCnpSolicitudesForLine(companyId, lineId, { month, year }) {
  const monthStart = new Date(year, month - 1, 1)
  const monthEnd = new Date(year, month, 1)
  const toISO = (d) => d.toISOString().slice(0, 10)

  const { data, error } = await supabase
    .from('cnp_requests')
    .select('status, pieces')
    .eq('company_id', companyId)
    .eq('line_id', lineId)
    .is('deleted_at', null)
    .gte('created_at', toISO(monthStart))
    .lt('created_at', toISO(monthEnd))

  if (error) return { solicitudes: 0, entregados: 0, error }
  const rows = data ?? []
  return {
    solicitudes: rows.reduce((sum, r) => sum + cnpPieceCount(r), 0),
    entregados: rows.reduce((sum, r) => sum + cnpPiecesDelivered(r), 0),
    error: null,
  }
}
