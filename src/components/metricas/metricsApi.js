/**
 * Capa de acceso a datos para el módulo Métricas.
 * Todas las funciones hacen queries a Supabase y retornan { data, error }.
 */
import { supabase } from "../../supabase";
import { SEED_LINES, SEED_CLIENTES } from "./constants";
import { lastNMonths } from "../../utils/metricsFinance";

// ─── Líneas ───────────────────────────────────────────────────────────────────

export async function loadLines(companyId) {
  const { data, error } = await supabase
    .from("metric_lines")
    .select("*, members:metric_line_members(user_id, is_lead)")
    .eq("company_id", companyId)
    .order("sort_order");
  return {
    data: (data ?? []).map(line => ({
      ...line,
      member_user_ids: (line.members ?? []).map(m => m.user_id),
      lead_user_id: (line.members ?? []).find(m => m.is_lead)?.user_id ?? null,
      members: undefined,
    })),
    error,
  };
}

export async function createLine(companyId, { name, color, sort_order }) {
  return supabase
    .from("metric_lines")
    .insert({ company_id: companyId, name, color, sort_order })
    .select()
    .single();
}

export async function updateLine(lineId, updates) {
  return supabase
    .from("metric_lines")
    .update(updates)
    .eq("id", lineId)
    .select()
    .single();
}

export async function deleteLine(lineId) {
  return supabase.from("metric_lines").delete().eq("id", lineId);
}

export async function addLineMember(lineId, userId) {
  return supabase
    .from("metric_line_members")
    .insert({ line_id: lineId, user_id: userId });
}

export async function removeLineMember(lineId, userId) {
  return supabase
    .from("metric_line_members")
    .delete()
    .eq("line_id", lineId)
    .eq("user_id", userId);
}

/**
 * Marca a un miembro como jefa/líder de la línea. Solo puede haber una líder
 * por línea, así que primero se limpia el flag de cualquier otra miembro.
 */
export async function setLineLeader(lineId, userId) {
  const { error: clearErr } = await supabase
    .from("metric_line_members")
    .update({ is_lead: false })
    .eq("line_id", lineId)
    .neq("user_id", userId);
  if (clearErr) return { error: clearErr };
  return supabase
    .from("metric_line_members")
    .update({ is_lead: true })
    .eq("line_id", lineId)
    .eq("user_id", userId)
    .select()
    .single();
}

/** Quita el liderazgo de una miembro sin asignárselo a nadie más. */
export async function removeLineLeader(lineId, userId) {
  return supabase
    .from("metric_line_members")
    .update({ is_lead: false })
    .eq("line_id", lineId)
    .eq("user_id", userId);
}

// ─── Clientes ─────────────────────────────────────────────────────────────────

export async function loadClients(companyId, lineId = null, { includeArchived = false } = {}) {
  let q = supabase
    .from("metric_clients")
    .select("*")
    .eq("company_id", companyId);
  if (lineId) q = q.eq("line_id", lineId);
  if (!includeArchived) q = q.is("deleted_at", null);
  return q.order("created_at");
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
  } = fields
  return supabase
    .from("metric_clients")
    .insert({ company_id: companyId, name, line_id, website, payment_day, monthly_fee, campaign_budget, social_links, logo_url, contacts, anniversary_date, mdn_since, social_manager_id, designer_id, audiovisual_ids, apoyo_ids })
    .select()
    .single();
}

export async function updateClient(clientId, updates) {
  return supabase
    .from("metric_clients")
    .update(updates)
    .eq("id", clientId)
    .select()
    .single();
}

export async function loadCompanyUsers(companyId) {
  return supabase
    .from("users")
    .select("user_id, first_name, last_name, avatar_url, deleted_at")
    .eq("company_id", companyId)
    .order("first_name");
}

/** Carga empleados con toda la información básica (cargo y departamento incluidos). */
export async function loadCompanyEmployees(companyId) {
  return supabase
    .from("users")
    .select("*, department:departments(department_name), position:positions(position_name, position_description, position_functions)")
    .eq("company_id", companyId)
    .order("first_name");
}

export async function deleteClient(clientId) {
  return supabase
    .from("metric_clients")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", clientId);
}

export async function restoreClient(clientId) {
  return supabase
    .from("metric_clients")
    .update({ deleted_at: null })
    .eq("id", clientId);
}

// ─── Reportes ─────────────────────────────────────────────────────────────────

export async function loadReport(lineId, year, month) {
  return supabase
    .from("metric_reports")
    .select("*")
    .eq("line_id", lineId)
    .eq("year", year)
    .eq("month", month)
    .maybeSingle();
}

export async function loadPrevReport(lineId, year, month) {
  // Busca el reporte del mes anterior (solo 1 mes atrás)
  let m = month - 1;
  let y = year;
  if (m < 1) { m = 12; y--; }
  return supabase
    .from("metric_reports")
    .select("*")
    .eq("line_id", lineId)
    .eq("year", y)
    .eq("month", m)
    .maybeSingle();
}

/**
 * Carga los reportes de una línea que caen dentro de los últimos n meses
 * terminando en (endYear, endMonth). Trae por rango de año(es) involucrados
 * y deja el recorte fino a los n pares (year, month) exactos a cargo del
 * caller (ver buildFinanceTrend en utils/metricsFinance.js).
 */
export async function loadRecentReports(lineId, endYear, endMonth, n = 5) {
  const months = lastNMonths(endYear, endMonth, n);
  const years = [...new Set(months.map(m => m.year))];
  return supabase
    .from("metric_reports")
    .select("year, month, data")
    .eq("line_id", lineId)
    .in("year", years);
}

/**
 * Carga todos los reportes de todas las líneas para un año dado.
 * Para el Dashboard General.
 */
export async function loadYearReports(companyId, year) {
  return supabase
    .from("metric_reports")
    .select("*, line:metric_lines!inner(id, name, color, sort_order)")
    .eq("company_id", companyId)
    .eq("year", year);
}

/**
 * Upsert de un reporte. Crea la fila si no existe; actualiza si ya existe.
 * `data` es el objeto jsonb del reporte.
 */
export async function upsertReport(companyId, lineId, year, month, data) {
  return supabase
    .from("metric_reports")
    .upsert(
      { company_id: companyId, line_id: lineId, year, month, data, updated_at: new Date().toISOString() },
      { onConflict: "line_id,year,month" }
    )
    .select()
    .single();
}

/**
 * Persiste los montos de sueldo del reporte al sueldo maestro (users.monthly_salary).
 * Recibe filas ya filtradas [{ user_id, monto }] — se hace un UPDATE por empleado.
 * @returns {{ error: Error|null }}
 */
export async function updateEmployeeSalaries(rows) {
  for (const { user_id, monto } of rows) {
    const { error } = await supabase
      .from("users")
      .update({ monthly_salary: monto })
      .eq("user_id", user_id);
    if (error) return { error };
  }
  return { error: null };
}

// ─── Seed ─────────────────────────────────────────────────────────────────────

/**
 * Si no existen líneas para la empresa, crea las 4 líneas y sus clientes iniciales.
 * Idempotente: solo actúa si la tabla está vacía para este company_id.
 * @returns {Array|null} - Array de líneas creadas, o null si ya existían.
 */
export async function seedMetricsIfEmpty(companyId) {
  const { data: existing, error: checkErr } = await loadLines(companyId);
  if (checkErr) return null;
  if (existing && existing.length > 0) return null; // ya sembrado

  // Insertar líneas
  const { data: lines, error: lineErr } = await supabase
    .from("metric_lines")
    .insert(
      SEED_LINES.map(l => ({ company_id: companyId, name: l.name, color: l.color, sort_order: l.sort_order }))
    )
    .select();
  if (lineErr || !lines) return null;

  // Insertar clientes para cada línea
  const allClients = [];
  lines.forEach(line => {
    const names = SEED_CLIENTES[line.name] ?? [];
    names.forEach(name => {
      allClients.push({ company_id: companyId, line_id: line.id, name });
    });
  });
  if (allClients.length > 0) {
    await supabase.from("metric_clients").insert(allClients);
  }

  return lines;
}

// ─── Import / Export ──────────────────────────────────────────────────────────

/**
 * Exporta todas las líneas, clientes y reportes de la empresa como JSON.
 */
export async function exportMetrics(companyId) {
  const [linesRes, clientsRes, reportsRes] = await Promise.all([
    supabase.from("metric_lines").select("*").eq("company_id", companyId).order("sort_order"),
    supabase.from("metric_clients").select("*").eq("company_id", companyId),
    supabase.from("metric_reports").select("*").eq("company_id", companyId),
  ]);
  if (linesRes.error || clientsRes.error || reportsRes.error) return null;
  return {
    exportedAt: new Date().toISOString(),
    companyId,
    lines: linesRes.data,
    clients: clientsRes.data,
    reports: reportsRes.data,
  };
}

/**
 * Importa desde un objeto JSON exportado por exportMetrics().
 * Estrategia: upsert de clientes y reportes por ID; líneas ya existentes se mantienen.
 * NOTA: se importan los datos de la misma companyId — no se sobreescriben las líneas.
 */
export async function importMetrics(companyId, payload) {
  // Verificar formato mínimo
  if (!payload?.lines || !payload?.clients || !payload?.reports) {
    return { error: "Formato de archivo inválido." };
  }

  // Upsert clientes
  if (payload.clients.length > 0) {
    const { error: ce } = await supabase
      .from("metric_clients")
      .upsert(payload.clients.map(c => ({ ...c, company_id: companyId })), { onConflict: "id" });
    if (ce) return { error: `Error importando clientes: ${ce.message}` };
  }

  // Upsert reportes
  if (payload.reports.length > 0) {
    const { error: re } = await supabase
      .from("metric_reports")
      .upsert(
        payload.reports.map(r => ({ ...r, company_id: companyId, updated_at: new Date().toISOString() })),
        { onConflict: "line_id,year,month" }
      );
    if (re) return { error: `Error importando reportes: ${re.message}` };
  }

  return { success: true };
}
