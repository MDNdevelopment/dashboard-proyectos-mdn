/**
 * Capa de acceso a datos para el módulo Métricas.
 * Todas las funciones hacen queries a Supabase y retornan { data, error }.
 */
import { supabase } from '../../supabase'
import { SEED_LINES, SEED_CLIENTES } from './constants'
import { lastNMonths } from '../../utils/metricsFinance'
import { moveClientLine } from '../../utils/moveClientLine'
import { stripClientFromReport, reportHasClient } from '../../utils/stripClientFromReport'
import { firstOfNextMonthISO } from '../../utils/prorateMonthlyFee'

// ─── Líneas ───────────────────────────────────────────────────────────────────

export async function loadLines(
  companyId,
  { includeGeneral = false, includeManagement = false } = {},
) {
  let query = supabase
    .from('metric_lines')
    .select('*, members:metric_line_members(user_id, is_lead)')
    .eq('company_id', companyId)
  if (!includeGeneral) query = query.eq('is_general', false)
  if (!includeManagement) query = query.eq('is_management', false)
  const { data, error } = await query.order('sort_order')
  return {
    data: (data ?? []).map((line) => ({
      ...line,
      member_user_ids: (line.members ?? []).map((m) => m.user_id),
      lead_user_id: (line.members ?? []).find((m) => m.is_lead)?.user_id ?? null,
      members: undefined,
    })),
    error,
  }
}

export async function createLine(companyId, { name, color, sort_order }) {
  return supabase
    .from('metric_lines')
    .insert({ company_id: companyId, name, color, sort_order })
    .select()
    .single()
}

export async function updateLine(lineId, updates) {
  return supabase.from('metric_lines').update(updates).eq('id', lineId).select().single()
}

export async function deleteLine(lineId) {
  return supabase.from('metric_lines').delete().eq('id', lineId)
}

export async function addLineMember(lineId, userId) {
  return supabase.from('metric_line_members').insert({ line_id: lineId, user_id: userId })
}

export async function removeLineMember(lineId, userId) {
  return supabase.from('metric_line_members').delete().eq('line_id', lineId).eq('user_id', userId)
}

/**
 * Marca a un miembro como jefa/líder de la línea. Solo puede haber una líder
 * por línea, así que primero se limpia el flag de cualquier otra miembro.
 */
export async function setLineLeader(lineId, userId) {
  const { error: clearErr } = await supabase
    .from('metric_line_members')
    .update({ is_lead: false })
    .eq('line_id', lineId)
    .neq('user_id', userId)
  if (clearErr) return { error: clearErr }
  return supabase
    .from('metric_line_members')
    .update({ is_lead: true })
    .eq('line_id', lineId)
    .eq('user_id', userId)
    .select()
    .single()
}

/** Quita el liderazgo de una miembro sin asignárselo a nadie más. */
export async function removeLineLeader(lineId, userId) {
  return supabase
    .from('metric_line_members')
    .update({ is_lead: false })
    .eq('line_id', lineId)
    .eq('user_id', userId)
}

// ─── Clientes ─────────────────────────────────────────────────────────────────

export async function loadClients(companyId, lineId = null, { includeArchived = false } = {}) {
  let q = supabase.from('metric_clients').select('*').eq('company_id', companyId)
  if (lineId) q = q.eq('line_id', lineId)
  if (!includeArchived) q = q.is('deleted_at', null)
  return q.order('name')
}

export async function createClient(companyId, fields) {
  const {
    name,
    line_id = null,
    website = null,
    payment_day = null,
    monthly_fee = null,
    campaign_budget = null,
    social_links = [],
    logo_url = null,
    contacts = [],
    anniversary_date = null,
    mdn_since = null,
    social_manager_id = null,
    designer_id = null,
    audiovisual_ids = [],
    apoyo_ids = [],
    fixed_tasks = null,
  } = fields
  return supabase
    .from('metric_clients')
    .insert({
      company_id: companyId,
      name,
      line_id,
      website,
      payment_day,
      monthly_fee,
      campaign_budget,
      social_links,
      logo_url,
      contacts,
      anniversary_date,
      mdn_since,
      social_manager_id,
      designer_id,
      audiovisual_ids,
      apoyo_ids,
      fixed_tasks,
    })
    .select()
    .single()
}

export async function updateClient(clientId, updates) {
  return supabase.from('metric_clients').update(updates).eq('id', clientId).select().single()
}

export async function loadCompanyUsers(companyId) {
  return supabase
    .from('users')
    .select('user_id, first_name, last_name, avatar_url, deleted_at')
    .eq('company_id', companyId)
    .order('first_name')
}

/** Carga empleados con toda la información básica (cargo y departamento incluidos). */
export async function loadCompanyEmployees(companyId) {
  return supabase
    .from('users')
    .select(
      '*, department:departments(department_name), position:positions(position_name, position_description, position_functions)',
    )
    .eq('company_id', companyId)
    .order('first_name')
}

// incluyeMes = true  → el cliente cuenta en el reporte del mes de baja (facturó/trabajó parte del mes).
// incluyeMes = false → se excluye también del mes en curso (ver utils/clientInMonth.js).
export async function deleteClient(clientId, { incluyeMes = true } = {}) {
  return supabase
    .from('metric_clients')
    .update({ deleted_at: new Date().toISOString(), baja_incluye_mes: incluyeMes })
    .eq('id', clientId)
}

export async function restoreClient(clientId) {
  return supabase.from('metric_clients').update({ deleted_at: null }).eq('id', clientId)
}

// Datos privados de contacto (teléfono, correo de Instagram). Viven en
// metric_client_private, con RLS restringida a nivel 3/4/admin — un usuario
// de nivel menor simplemente recibe 0 filas (no error).
export async function loadClientPrivate(clientId) {
  return supabase
    .from('metric_client_private')
    .select('phone, instagram_email')
    .eq('client_id', clientId)
    .maybeSingle()
}

export async function upsertClientPrivate(clientId, { phone, instagram_email }) {
  return supabase.from('metric_client_private').upsert({
    client_id: clientId,
    phone: phone || null,
    instagram_email: instagram_email || null,
    updated_at: new Date().toISOString(),
  })
}

// ─── Tareas Fijas ───────────────────────────────────────────────────────────────

/**
 * Carga las marcas de Tareas Fijas de una línea en un mes concreto (todas las
 * semanas). Alimenta el auto-llenado del indicador «2. Productividad» en
 * OperacionesView (ver utils/fixedTasks.js:computeProductividad).
 */
export async function loadFixedTaskMarks(lineId, year, month) {
  return supabase
    .from('fixed_task_marks')
    .select('*')
    .eq('line_id', lineId)
    .eq('period_year', year)
    .eq('period_month', month)
}

// ─── Reportes ─────────────────────────────────────────────────────────────────

export async function loadReport(lineId, year, month) {
  return supabase
    .from('metric_reports')
    .select('*')
    .eq('line_id', lineId)
    .eq('year', year)
    .eq('month', month)
    .maybeSingle()
}

/**
 * Carga `line_id, closed_at` de un conjunto de líneas para un (year, month)
 * puntual. Usado por el recordatorio de cierre para saber qué líneas
 * lideradas por el usuario siguen sin cerrarse en el periodo — ver
 * `src/hooks/useReportCloseReminder.js`.
 */
export async function loadReportsClosureStatus(lineIds, year, month) {
  if (!lineIds || lineIds.length === 0) return { data: [], error: null }
  return supabase
    .from('metric_reports')
    .select('line_id, closed_at')
    .in('line_id', lineIds)
    .eq('year', year)
    .eq('month', month)
}

export async function loadPrevReport(lineId, year, month) {
  // Busca el reporte del mes anterior (solo 1 mes atrás)
  let m = month - 1
  let y = year
  if (m < 1) {
    m = 12
    y--
  }
  return supabase
    .from('metric_reports')
    .select('*')
    .eq('line_id', lineId)
    .eq('year', y)
    .eq('month', m)
    .maybeSingle()
}

/**
 * Carga los reportes de una línea que caen dentro de los últimos n meses
 * terminando en (endYear, endMonth). Trae por rango de año(es) involucrados
 * y deja el recorte fino a los n pares (year, month) exactos a cargo del
 * caller (ver buildFinanceTrend en utils/metricsFinance.js).
 */
export async function loadRecentReports(lineId, endYear, endMonth, n = 5) {
  const months = lastNMonths(endYear, endMonth, n)
  const years = [...new Set(months.map((m) => m.year))]
  return supabase
    .from('metric_reports')
    .select('year, month, data')
    .eq('line_id', lineId)
    .in('year', years)
}

/**
 * Carga todos los reportes de todas las líneas para un año dado.
 * Para el Dashboard General.
 */
export async function loadYearReports(companyId, year) {
  return supabase
    .from('metric_reports')
    .select('*, line:metric_lines!inner(id, name, color, sort_order)')
    .eq('company_id', companyId)
    .eq('year', year)
}

/**
 * Upsert de un reporte. Crea la fila si no existe; actualiza si ya existe.
 * `data` es el objeto jsonb del reporte.
 */
export async function upsertReport(companyId, lineId, year, month, data) {
  return supabase
    .from('metric_reports')
    .upsert(
      {
        company_id: companyId,
        line_id: lineId,
        year,
        month,
        data,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'line_id,year,month' },
    )
    .select()
    .single()
}

/**
 * Cierra permanentemente el reporte de una línea/mes: Operaciones y Finanzas quedan de
 * solo lectura para siempre (bloqueado también a nivel de base por un trigger — ver
 * migración 20260721000000_metric_reports_close.sql). No existe función de reapertura:
 * el cierre es irreversible por diseño.
 * @returns {{ data, error }}
 */
export async function closeReport(lineId, year, month, userId) {
  return supabase
    .from('metric_reports')
    .update({ closed_at: new Date().toISOString(), closed_by: userId, closed_auto: false })
    .eq('line_id', lineId)
    .eq('year', year)
    .eq('month', month)
    .select()
    .single()
}

/** Forma mínima válida de un reporte vacío (cuando aún no existe el del mes). */
function emptyReportShape() {
  return {
    reuniones: { realizadas: null, meta: 0, comentario: null, justificativos: {} },
    productividad: { tareas: [] },
    crecimiento: { items: [] },
    solicitudes: { solicitudes: null, editadas: null },
    pautas: { items: [] },
    piezas: { piezas: null, editadas: null },
    feedback: { items: [] },
    finanzas: { ingresos: [], gastosOperativos: [], sueldos: [], otrosGastos: [] },
  }
}

// Parseo/formateo de fechas 'YYYY-MM-DD' sin pasar por Date (evita corrimientos de zona).
function isoDateParts(isoDate) {
  const [y, m, d] = String(isoDate).split('-').map(Number)
  return { year: y, month: m, day: d }
}
function formatDMY(isoDate) {
  const { year, month, day } = isoDateParts(isoDate)
  return `${String(day).padStart(2, '0')}/${String(month).padStart(2, '0')}/${year}`
}

/**
 * Mueve una cuenta (marca) de una línea a otra, materializando la atribución del mes
 * de transición en los reportes de AMBAS líneas (ver src/utils/moveClientLine.js):
 *  - Operativo (crecimiento/pautas/feedback/justificativo) migra a la línea nueva con sus valores.
 *  - Ingreso del mes se reparte: fila manual prorrateada en la vieja, fila ligada en la nueva.
 * Luego actualiza client.line_id (limpiando asignaciones de staff, igual que ClientModal)
 * y registra el movimiento en metric_client_line_moves (auditoría, no bloqueante).
 *
 * @param {object} p
 * @param {string} p.companyId
 * @param {object} p.client        - fila del cliente (necesita id, name, line_id).
 * @param {string} p.toLineId      - línea destino.
 * @param {string} p.effectiveDate - 'YYYY-MM-DD' (día en que empieza en la línea nueva).
 * @param {number} p.oldAmount     - ingreso prorrateado línea vieja.
 * @param {number} p.newAmount     - ingreso prorrateado línea nueva.
 * @param {string} [p.userId]
 * @returns {{ data, error }}
 */
export async function moveClientToLine({
  companyId,
  client,
  toLineId,
  effectiveDate,
  oldAmount,
  newAmount,
  userId,
  taskAssigneeId = null,
}) {
  const fromLineId = client.line_id ?? null
  if (!toLineId || toLineId === fromLineId) {
    return { error: new Error('Selecciona una línea destino distinta a la actual.') }
  }
  const { year, month } = isoDateParts(effectiveDate)

  // 1. Reportes del mes de transición de ambas líneas (pueden no existir todavía).
  const [oldRes, newRes] = await Promise.all([
    fromLineId ? loadReport(fromLineId, year, month) : Promise.resolve({ data: null, error: null }),
    loadReport(toLineId, year, month),
  ])
  if (oldRes.error) return { error: oldRes.error }
  if (newRes.error) return { error: newRes.error }

  const oldData = oldRes.data?.data ?? emptyReportShape()
  const newData = newRes.data?.data ?? emptyReportShape()

  const { oldReportData, newReportData } = moveClientLine({
    clientId: client.id,
    clientName: client.name,
    effectiveLabel: formatDMY(effectiveDate),
    oldReportData: oldData,
    newReportData: newData,
    oldAmount: Number(oldAmount) || 0,
    newAmount: Number(newAmount) || 0,
  })

  // 2. Persistir ambos reportes del mes de transición.
  if (fromLineId) {
    const { error } = await upsertReport(companyId, fromLineId, year, month, oldReportData)
    if (error) return { error }
  }
  const { error: e2 } = await upsertReport(companyId, toLineId, year, month, newReportData)
  if (e2) return { error: e2 }

  // 3. Cambiar la línea del cliente (limpiando staff que ya no aplica y cualquier
  //    cambio diferido pendiente, ya que este movimiento es inmediato).
  const { data: updated, error: e3 } = await updateClient(client.id, {
    line_id: toLineId,
    social_manager_id: null,
    designer_id: null,
    audiovisual_ids: [],
    pending_line_id: null,
    line_change_at: null,
    pending_task_assignee: null,
  })
  if (e3) return { error: e3 }

  // 3b. Mover las tareas ABIERTAS de la marca a la línea nueva. El responsable pasa a ser el
  //     jefe de la línea destino, o el responsable elegido a mano (taskAssigneeId) si la línea
  //     no tiene jefe (p.ej. "Independientes"). SECURITY DEFINER (migración 20260806050000).
  const { error: eTasks } = await supabase.rpc('reassign_client_open_tasks', {
    p_client_id: client.id,
    p_to_line_id: toLineId,
    p_assignee: taskAssigneeId || null,
  })
  if (eTasks) return { error: eTasks }

  // 4. Auditoría (best-effort: no revierte el movimiento si falla).
  await supabase.from('metric_client_line_moves').insert({
    company_id: companyId,
    client_id: client.id,
    from_line_id: fromLineId,
    to_line_id: toLineId,
    effective_date: effectiveDate,
    split_old: Number(oldAmount) || 0,
    split_new: Number(newAmount) || 0,
    created_by: userId ?? null,
  })

  return { data: updated, error: null }
}

/**
 * Programa un cambio de línea DIFERIDO: la cuenta se queda completa en su línea actual
 * hasta fin de mes y pasa a `toLineId` el 1° del próximo mes (aplicado por el cron
 * `apply_due_client_line_moves`, migración 20260806030000). No cambia `line_id` ni toca
 * reportes ahora. Usado cuando al mover se elige "este mes cuenta para la línea vieja".
 *
 * @param {object} p
 * @param {string} p.companyId
 * @param {object} p.client   - fila del cliente (id, name, line_id).
 * @param {string} p.toLineId - línea destino.
 * @param {string} [p.userId]
 * @returns {{ data, error }}
 */
export async function scheduleClientLineMove({
  companyId,
  client,
  toLineId,
  userId,
  taskAssigneeId = null,
}) {
  const fromLineId = client.line_id ?? null
  if (!toLineId || toLineId === fromLineId) {
    return { error: new Error('Selecciona una línea destino distinta a la actual.') }
  }
  const effective = firstOfNextMonthISO()

  const { data: updated, error } = await updateClient(client.id, {
    pending_line_id: toLineId,
    line_change_at: effective,
    pending_task_assignee: taskAssigneeId || null,
  })
  if (error) return { error }

  // Auditoría (best-effort): el efectivo es el 1° del próximo mes; sin prorrateo.
  await supabase.from('metric_client_line_moves').insert({
    company_id: companyId,
    client_id: client.id,
    from_line_id: fromLineId,
    to_line_id: toLineId,
    effective_date: effective,
    split_old: null,
    split_new: null,
    created_by: userId ?? null,
  })

  return { data: updated, error: null }
}

/**
 * Cancela un cambio de línea diferido pendiente (limpia pending_line_id / line_change_at).
 * @returns {{ data, error }}
 */
export async function cancelPendingLineMove(clientId) {
  return updateClient(clientId, {
    pending_line_id: null,
    line_change_at: null,
    pending_task_assignee: null,
  })
}

/**
 * Quita a una cuenta de los reportes ya guardados de los meses POSTERIORES al mes de su
 * fin de contrato (por definición, ahí no debe haber rastro). Deja intactos:
 *  - el mes de fin y anteriores (el último mes cuenta completo),
 *  - los reportes CERRADOS (`closed_at` no nulo; inmutables por trigger en la base).
 * Escanea todas las líneas de la empresa (la cuenta pudo haberse movido de línea).
 *
 * @param {string} companyId
 * @param {string} clientId
 * @param {string} contractEnd - 'YYYY-MM-DD'
 * @returns {{ data: { cleaned: number }, error: Error|null }}
 */
export async function cleanupClientAfterContractEnd(companyId, clientId, contractEnd) {
  if (!contractEnd) return { data: { cleaned: 0 }, error: null }
  const [ey, em] = String(contractEnd).split('-').map(Number)

  // Reportes de la empresa en meses estrictamente posteriores a (ey, em), no cerrados.
  // El filtro fino por mes se hace en JS (comparar (year,month) > (ey,em)).
  const { data: reports, error } = await supabase
    .from('metric_reports')
    .select('line_id, year, month, data, closed_at')
    .eq('company_id', companyId)
    .is('closed_at', null)
  if (error) return { data: null, error }

  const posterior = (r) => r.year > ey || (r.year === ey && r.month > em)
  const targets = (reports ?? []).filter((r) => posterior(r) && reportHasClient(r.data, clientId))

  let cleaned = 0
  for (const r of targets) {
    const stripped = stripClientFromReport(r.data, clientId)
    const { error: upErr } = await upsertReport(companyId, r.line_id, r.year, r.month, stripped)
    if (upErr) return { data: null, error: upErr }
    cleaned++
  }
  return { data: { cleaned }, error: null }
}

/**
 * Persiste los montos de sueldo del reporte al sueldo maestro (users.monthly_salary).
 * Recibe filas ya filtradas [{ user_id, monto }] — se hace un UPDATE por empleado.
 * @returns {{ error: Error|null }}
 */
export async function updateEmployeeSalaries(rows) {
  for (const { user_id, monto } of rows) {
    const { error } = await supabase
      .from('users')
      .update({ monthly_salary: monto })
      .eq('user_id', user_id)
    if (error) return { error }
  }
  return { error: null }
}

// ─── Seed ─────────────────────────────────────────────────────────────────────

/**
 * Si no existen líneas para la empresa, crea las 4 líneas y sus clientes iniciales.
 * Idempotente: solo actúa si la tabla está vacía para este company_id.
 * @returns {Array|null} - Array de líneas creadas, o null si ya existían.
 */
export async function seedMetricsIfEmpty(companyId) {
  const { data: existing, error: checkErr } = await loadLines(companyId)
  if (checkErr) return null
  if (existing && existing.length > 0) return null // ya sembrado

  // Insertar líneas
  const { data: lines, error: lineErr } = await supabase
    .from('metric_lines')
    .insert(
      SEED_LINES.map((l) => ({
        company_id: companyId,
        name: l.name,
        color: l.color,
        sort_order: l.sort_order,
      })),
    )
    .select()
  if (lineErr || !lines) return null

  // Insertar clientes para cada línea
  const allClients = []
  lines.forEach((line) => {
    const names = SEED_CLIENTES[line.name] ?? []
    names.forEach((name) => {
      allClients.push({ company_id: companyId, line_id: line.id, name })
    })
  })
  if (allClients.length > 0) {
    await supabase.from('metric_clients').insert(allClients)
  }

  // Fila oculta "Independientes": agrupa tareas de empleados sin línea asignada.
  // Se excluye de Métricas/Ads/Home/Clientes vía el default includeGeneral=false.
  await supabase.from('metric_lines').insert({
    company_id: companyId,
    name: 'Independientes',
    color: '#9CA3AF',
    sort_order: 9999,
    is_general: true,
  })

  // Fila oculta "Alta Gerencia": agrupa tareas de dirección (access_level >= 4) sin línea
  // asignada, separada de Independientes. Se excluye vía el default includeManagement=false.
  await supabase.from('metric_lines').insert({
    company_id: companyId,
    name: 'Alta Gerencia',
    color: '#6B7280',
    sort_order: 9998,
    is_management: true,
  })

  return lines
}

// ─── Import / Export ──────────────────────────────────────────────────────────

/**
 * Exporta todas las líneas, clientes y reportes de la empresa como JSON.
 */
export async function exportMetrics(companyId) {
  const [linesRes, clientsRes, reportsRes] = await Promise.all([
    supabase.from('metric_lines').select('*').eq('company_id', companyId).order('sort_order'),
    supabase.from('metric_clients').select('*').eq('company_id', companyId),
    supabase.from('metric_reports').select('*').eq('company_id', companyId),
  ])
  if (linesRes.error || clientsRes.error || reportsRes.error) return null
  return {
    exportedAt: new Date().toISOString(),
    companyId,
    lines: linesRes.data,
    clients: clientsRes.data,
    reports: reportsRes.data,
  }
}

/**
 * Importa desde un objeto JSON exportado por exportMetrics().
 * Estrategia: upsert de clientes y reportes por ID; líneas ya existentes se mantienen.
 * NOTA: se importan los datos de la misma companyId — no se sobreescriben las líneas.
 */
export async function importMetrics(companyId, payload) {
  // Verificar formato mínimo
  if (!payload?.lines || !payload?.clients || !payload?.reports) {
    return { error: 'Formato de archivo inválido.' }
  }

  // Upsert clientes
  if (payload.clients.length > 0) {
    const { error: ce } = await supabase.from('metric_clients').upsert(
      payload.clients.map((c) => ({ ...c, company_id: companyId })),
      { onConflict: 'id' },
    )
    if (ce) return { error: `Error importando clientes: ${ce.message}` }
  }

  // Upsert reportes
  if (payload.reports.length > 0) {
    const { error: re } = await supabase.from('metric_reports').upsert(
      payload.reports.map((r) => ({
        ...r,
        company_id: companyId,
        updated_at: new Date().toISOString(),
      })),
      { onConflict: 'line_id,year,month' },
    )
    if (re) return { error: `Error importando reportes: ${re.message}` }
  }

  return { success: true }
}

// ─── Monitor de uso ─────────────────────────────────────────────────────────

/**
 * Carga, en 5 queries paralelas, todas las filas crudas que alimentan
 * `aggregateUsageMonitor` (src/utils/aggregateUsageMonitor.js) para una ventana de
 * `monthsBack` meses terminando en (year, month). Una sola carga por cambio de mes —
 * el filtrado por mes/persona ocurre en memoria dentro del util puro, así que no hay
 * una query por línea ni por módulo.
 *
 * Evaluaciones se excluye a propósito: ese módulo no se está usando hoy (ver
 * USAGE_MODULES en aggregateUsageMonitor.js), así que no tiene sentido pedir
 * `evaluation_sessions` en cada carga.
 * @param {string} companyId
 * @param {{year:number, month:number, monthsBack?:number}} period
 */
export async function loadUsageActivity(companyId, { year, month, monthsBack = 4 }) {
  let y = year,
    m = month
  for (let i = 1; i < monthsBack; i++) {
    m--
    if (m < 1) {
      m = 12
      y--
    }
  }
  const from = new Date(y, m - 1, 1).toISOString()
  const to = new Date(year, month, 1).toISOString()
  const fromYear = y

  const [meetingsRes, tasksRes, marksRes, cnpRes, pautasRes, usersRes] = await Promise.all([
    supabase
      .from('meetings')
      .select('created_by, created_at, starts_at, status, line_id')
      .eq('company_id', companyId)
      .gte('created_at', from)
      .lt('created_at', to),
    supabase
      .from('tasks')
      .select('created_by, created_at, due_date, team_id')
      .eq('company_id', companyId)
      .gte('created_at', from)
      .lt('created_at', to),
    supabase
      .from('fixed_task_marks')
      .select(
        'marked_by, marked_at, period_year, period_month, period_week, task_key, status, line_id',
      )
      .eq('company_id', companyId)
      .gte('period_year', fromYear)
      .lte('period_year', year),
    supabase
      .from('cnp_requests')
      .select('created_by, created_at, line_id')
      .eq('company_id', companyId)
      .is('deleted_at', null)
      .gte('created_at', from)
      .lt('created_at', to),
    supabase
      .from('av_pautas')
      .select('created_by, created_at, line_id')
      .eq('company_id', companyId)
      .is('deleted_at', null)
      .gte('created_at', from)
      .lt('created_at', to),
    loadCompanyUsers(companyId),
  ])

  const error =
    [meetingsRes, tasksRes, marksRes, cnpRes, pautasRes, usersRes].find((r) => r.error)?.error ??
    null

  return {
    data: {
      meetings: meetingsRes.data ?? [],
      tasks: tasksRes.data ?? [],
      fixedMarks: marksRes.data ?? [],
      cnp: cnpRes.data ?? [],
      pautas: pautasRes.data ?? [],
      users: usersRes.data ?? [],
    },
    error,
  }
}
