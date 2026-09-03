// Carga, una sola vez por request, todo lo que necesitan las herramientas del chat IA
// (aiChatTools.js). El cliente es service-role (bypassa RLS) así que cada select filtra
// por company_id a mano — igual que ceoSnapshot.js/ceo-analysis.js.
import { supabase } from './supabase.js'

/**
 * @param {string} companyId
 * @returns {Promise<{lines: Array, reports: Array, tasks: Array, users: Array, meetings: Array, pautas: Array, availableYears: {min: number, max: number}}>}
 */
export async function loadMetricsDataset(companyId) {
  const currentYear = new Date().getFullYear()

  const [linesRes, reportsRes, tasksRes, usersRes, meetingsRes, pautasRes] = await Promise.all([
    supabase
      .from('metric_lines')
      .select('id, name, color')
      .eq('company_id', companyId)
      .eq('is_general', false),
    supabase
      .from('metric_reports')
      .select('line_id, year, month, data')
      .eq('company_id', companyId)
      .in('year', [currentYear - 1, currentYear]),
    supabase
      .from('tasks')
      .select(
        'id, team_id, description, status, assignee_ids, request_date, due_date, closed_date, blocked_reason',
      )
      .eq('company_id', companyId),
    supabase
      .from('users')
      .select('user_id, first_name, last_name, department_id')
      .eq('company_id', companyId)
      .is('deleted_at', null),
    supabase
      .from('meetings')
      .select(
        'id, line_id, title, client_name, starts_at, status, attendee_ids, modality, location, meeting_url',
      )
      .eq('company_id', companyId),
    supabase
      .from('av_pautas')
      .select(
        'id, line_id, client_name, tema, pauta_date, salida, llegada, status, recurso_ids, piezas_totales, piezas_editadas',
      )
      .eq('company_id', companyId)
      .is('deleted_at', null),
  ])

  const results = { linesRes, reportsRes, tasksRes, usersRes, meetingsRes, pautasRes }
  for (const key in results) {
    if (results[key].error) throw new Error(results[key].error.message)
  }

  return {
    lines: linesRes.data ?? [],
    reports: reportsRes.data ?? [],
    tasks: tasksRes.data ?? [],
    users: usersRes.data ?? [],
    meetings: meetingsRes.data ?? [],
    pautas: pautasRes.data ?? [],
    // Rango de años de `reports` (ver query de metric_reports arriba): las tools que
    // aceptan `anio` deben rechazar años fuera de este rango en vez de reportar
    // "sin datos" como si la línea no hubiera tenido actividad ese año.
    availableYears: { min: currentYear - 1, max: currentYear },
  }
}
