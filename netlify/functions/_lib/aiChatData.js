// Carga, una sola vez por request, todo lo que necesitan las herramientas del chat IA
// (aiChatTools.js). El cliente es service-role (bypassa RLS) así que cada select filtra
// por company_id a mano — igual que ceoSnapshot.js/ceo-analysis.js.
import { supabase } from './supabase.js'

/**
 * @param {string} companyId
 * @returns {Promise<{lines: Array, linesAll: Array, reports: Array, tasks: Array, users: Array,
 *   meetings: Array, pautas: Array, positions: Array, departments: Array, clients: Array,
 *   campaigns: Array, tickets: Array, leads: Array, vacations: Array, cnpRequests: Array,
 *   publicationChecks: Array, pautaPiezas: Array, taskComments: Array, evaluationSummary: Array,
 *   availableYears: {min: number, max: number}}>}
 */
export async function loadMetricsDataset(companyId) {
  const currentYear = new Date().getFullYear()

  const [
    linesAllRes,
    reportsRes,
    tasksRes,
    usersRes,
    meetingsRes,
    pautasRes,
    positionsRes,
    departmentsRes,
    clientsRes,
    ticketsRes,
    leadsRes,
    vacationsRes,
    cnpRes,
    publicationChecksRes,
    pautaPiezasRes,
    taskCommentsRes,
    evaluationSummaryRes,
  ] = await Promise.all([
    // Sin filtrar is_general: se necesitan también "Independientes"/"Alta Gerencia" para
    // resolver a qué línea pertenece cada persona (ver linesAll/lines abajo).
    supabase
      .from('metric_lines')
      .select('id, name, color, is_general, is_management, sort_order')
      .eq('company_id', companyId),
    supabase
      .from('metric_reports')
      .select('line_id, year, month, data')
      .eq('company_id', companyId)
      .in('year', [currentYear - 1, currentYear]),
    supabase
      .from('tasks')
      .select(
        'id, team_id, client_id, description, status, assignee_ids, request_date, due_date, closed_date, blocked_reason',
      )
      .eq('company_id', companyId),
    supabase
      .from('users')
      .select(
        'user_id, first_name, last_name, department_id, position_id, access_level, hire_date, on_probation',
      )
      .eq('company_id', companyId)
      .is('deleted_at', null)
      .order('first_name'),
    supabase
      .from('meetings')
      .select(
        'id, line_id, title, client_name, client_names, starts_at, status, attendee_ids, modality, location, meeting_url',
      )
      .eq('company_id', companyId),
    supabase
      .from('av_pautas')
      .select(
        'id, line_id, client_name, tema, pauta_date, salida, llegada, status, recurso_ids, piezas_totales, piezas_editadas',
      )
      .eq('company_id', companyId)
      .is('deleted_at', null),
    supabase
      .from('positions')
      .select('position_id, position_name, department_id')
      .eq('company_id', companyId),
    supabase
      .from('departments')
      .select('department_id, department_name')
      .eq('company_id', companyId),
    // Sin filtrar deleted_at: un cliente archivado sigue debiendo poder consultarse
    // (ficha_cliente reporta su estado). NO se selecciona `contacts`/`logo_url` (ruido)
    // ni se toca metric_client_private (teléfono/email de IG: fuera de alcance de MAPPI).
    supabase
      .from('metric_clients')
      .select(
        'id, company_id, line_id, name, website, payment_day, social_links, anniversary_date, mdn_since, monthly_fee, social_manager_id, designer_id, audiovisual_ids, apoyo_ids, deleted_at, campaign_budget, rif, contract_end, contract_end_reason, pending_line_id, line_change_at',
      )
      .eq('company_id', companyId),
    supabase
      .from('support_tickets')
      .select(
        'id, title, description, priority, category, status, requester_id, assigned_to, created_at, resolved_at',
      )
      .eq('company_id', companyId),
    // leads no tiene company_id (un solo tenant hoy usa el form web) — se carga completa.
    supabase.from('leads').select('id, nombre, empresa, servicios, status, created_at, updated_at'),
    supabase
      .from('vacations')
      .select('id, user_id, start_date, end_date, status')
      .eq('company_id', companyId),
    supabase
      .from('cnp_requests')
      .select('id, line_id, client_id, title, status, due_date, created_at, closed_date')
      .eq('company_id', companyId)
      .is('deleted_at', null),
    // Sin `status`/`due_date`: no existen en la tabla. El semáforo (vacio/normal/naranja/
    // rojo) se deriva de `last_published_at` con `recentCheckStatus` (src/utils/chequeo.js),
    // igual que en la grilla real de Chequeo — ver consultarChequeo en aiChatTools.js.
    supabase
      .from('publication_checks')
      .select(
        'id, client_id, line_id, network, content_type, last_published_at, period_year, period_month, period_week',
      )
      .eq('company_id', companyId),
    supabase
      .from('av_pauta_piezas')
      .select('id, pauta_id, editor_user_id, status')
      .eq('company_id', companyId),
    supabase
      .from('task_comments')
      .select('id, task_id, author_id, created_at')
      .eq('company_id', companyId),
    // Vista agregada (sin nombres): promedios de evaluación por empleado/mes. No tiene
    // company_id (se deriva de evaluation_sessions); se filtra después contra
    // `users` (ya scopeado por companyId) para quedarnos solo con esta empresa. Se usa
    // solo para agregar por departamento/línea/cargo en desempeno_agregado, nunca por
    // persona individual (ver aiChatTools.js).
    supabase
      .from('employee_evaluation_summary')
      .select('target_employee, department_id, period_start, average_total_rate'),
  ])

  const results = {
    linesAllRes,
    reportsRes,
    tasksRes,
    usersRes,
    meetingsRes,
    pautasRes,
    positionsRes,
    departmentsRes,
    clientsRes,
    ticketsRes,
    leadsRes,
    vacationsRes,
    cnpRes,
    publicationChecksRes,
    pautaPiezasRes,
    taskCommentsRes,
    evaluationSummaryRes,
  }
  for (const key in results) {
    if (results[key].error) throw new Error(results[key].error.message)
  }

  const linesAll = linesAllRes.data ?? []
  const lineIds = linesAll.map((l) => l.id)
  let members = []
  // metric_line_members no tiene company_id: se filtra por los line_id ya cargados.
  if (lineIds.length) {
    const membersRes = await supabase
      .from('metric_line_members')
      .select('line_id, user_id, is_lead')
      .in('line_id', lineIds)
    if (membersRes.error) throw new Error(membersRes.error.message)
    members = membersRes.data ?? []
  }

  const clientIds = (clientsRes.data ?? []).map((c) => c.id)
  let campaigns = []
  if (clientIds.length) {
    const campaignsRes = await supabase
      .from('paid_campaigns')
      .select('id, client_id, client, name, amount, start_date, end_date, status, responsable_id')
      .in('client_id', clientIds)
    if (campaignsRes.error) throw new Error(campaignsRes.error.message)
    campaigns = campaignsRes.data ?? []
  }

  // `metric_lines.member_user_ids` fue eliminada de la BD (ver 20260710000000): se
  // reconstruye aquí desde metric_line_members para poder reutilizar tal cual
  // crossLineUserIds/assignableUsers de src/utils/lineFilters.js.
  const membersByLine = new Map()
  for (const m of members) {
    if (!membersByLine.has(m.line_id)) membersByLine.set(m.line_id, [])
    membersByLine.get(m.line_id).push(m.user_id)
  }
  const linesAllWithMembers = linesAll.map((l) => ({
    ...l,
    member_user_ids: membersByLine.get(l.id) ?? [],
  }))

  const companyUserIds = new Set((usersRes.data ?? []).map((u) => u.user_id))
  const evaluationSummary = (evaluationSummaryRes.data ?? []).filter((s) =>
    companyUserIds.has(s.target_employee),
  )

  return {
    // `lines`: mismo criterio que antes (líneas operativas reales), usado por todas
    // las tools existentes. `linesAll`: incluye Independientes/Alta Gerencia, para
    // las tools nuevas de directorio.
    lines: linesAllWithMembers.filter((l) => !l.is_general),
    linesAll: linesAllWithMembers,
    lineMembers: members,
    reports: reportsRes.data ?? [],
    tasks: tasksRes.data ?? [],
    users: usersRes.data ?? [],
    meetings: meetingsRes.data ?? [],
    pautas: pautasRes.data ?? [],
    positions: positionsRes.data ?? [],
    departments: departmentsRes.data ?? [],
    clients: clientsRes.data ?? [],
    campaigns,
    tickets: ticketsRes.data ?? [],
    leads: leadsRes.data ?? [],
    vacations: vacationsRes.data ?? [],
    cnpRequests: cnpRes.data ?? [],
    publicationChecks: publicationChecksRes.data ?? [],
    pautaPiezas: pautaPiezasRes.data ?? [],
    taskComments: taskCommentsRes.data ?? [],
    evaluationSummary,
    // Rango de años de `reports` (ver query de metric_reports arriba): las tools que
    // aceptan `anio` deben rechazar años fuera de este rango en vez de reportar
    // "sin datos" como si la línea no hubiera tenido actividad ese año.
    availableYears: { min: currentYear - 1, max: currentYear },
  }
}
