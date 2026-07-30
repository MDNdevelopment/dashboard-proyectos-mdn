import { useState, useEffect } from "react";
import { supabase } from "../supabase";
import { useAuth } from "../context/AuthContext";
import { loadLeads, updateLeadStatus } from "../components/leads/leadsApi";
import { loadCompanyEmployees } from "../components/metricas/metricsApi";
import LeadsStatsView from "../components/leads/LeadsStatsView";
import LeadsTable from "../components/leads/LeadsTable";
import { STATUS_LABELS, STATUS_OPTIONS, STATUS_BADGE } from "../components/leads/constants";
import { MONTHS } from "../components/metricas/constants";

const TABS = [
  { key: "lista", label: "Leads" },
  { key: "stats", label: "Estadísticas" },
];

const CURRENT_YEAR = new Date().getFullYear();
const YEARS = [CURRENT_YEAR, CURRENT_YEAR - 1, CURRENT_YEAR - 2, CURRENT_YEAR - 3];

/** ¿El lead se recibió dentro del mes/año del periodo? (mismo criterio que inPeriod de Ads) */
function leadInPeriod(createdAt, { month, year }) {
  if (!createdAt) return false;
  const [y, m] = createdAt.split("-").map(Number);
  return y === year && m === month;
}

export default function LeadsPage() {
  const { userProfile, can = () => true } = useAuth();
  const companyId = userProfile?.company_id;
  const canManage = can("leads.manage");

  const [tab, setTab] = useState("lista");
  const [leads, setLeads] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [periodo, setPeriodo] = useState(() => ({
    month: new Date().getMonth() + 1,
    year: CURRENT_YEAR,
  }));
  // Filtro de estado: selección única con toggle, activado por las cards de resumen.
  const [statusFilter, setStatusFilter] = useState("todas"); // 'todas' | 'pendiente' | 'contactado' | 'cancelado'
  // Modal de detalle: undefined = cerrado, objeto = viendo ese lead.
  const [selectedLead, setSelectedLead] = useState(undefined);

  useEffect(() => {
    loadLeads().then(({ data, error }) => {
      if (!error) setLeads(data ?? []);
      setLoading(false);
    });
  }, []);

  // Empleados de la empresa, para resolver el nombre de quién movió el estado
  // (updated_by guarda solo el user_id).
  useEffect(() => {
    if (!companyId) return;
    loadCompanyEmployees(companyId).then(({ data }) => setEmployees(data ?? []));
  }, [companyId]);

  // Realtime: nuevos leads enviados desde la web aparecen sin recargar.
  useEffect(() => {
    const channel = supabase
      .channel("leads-changes")
      .on("postgres_changes", { event: "*", schema: "public", table: "leads" }, (payload) => {
        setLeads((prev) => {
          if (payload.eventType === "INSERT") {
            return prev.some((l) => l.id === payload.new.id) ? prev : [payload.new, ...prev];
          }
          if (payload.eventType === "UPDATE") return prev.map((l) => (l.id === payload.new.id ? payload.new : l));
          if (payload.eventType === "DELETE") return prev.filter((l) => l.id !== payload.old.id);
          return prev;
        });
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, []);

  async function handleStatusChange(lead, status) {
    if (!canManage || !userProfile?.user_id) return;
    const { data, error } = await updateLeadStatus(lead.id, status, userProfile.user_id);
    if (!error && data) {
      setLeads((prev) => prev.map((l) => (l.id === data.id ? data : l)));
      setSelectedLead((prev) => (prev && prev.id === data.id ? data : prev));
    }
  }

  function employeeName(userId) {
    const employee = employees.find((e) => e.user_id === userId);
    return employee ? `${employee.first_name} ${employee.last_name}` : null;
  }

  /** Click en una card de resumen: selección única con toggle — click en la ya activa la desactiva. */
  function handleStatusCardClick(status) {
    setStatusFilter((prev) => (prev === status ? "todas" : status));
  }

  // Leads del periodo seleccionado (mes/año) — base para las cards y la lista.
  const periodLeads = leads.filter((l) => leadInPeriod(l.created_at, periodo));

  const pendienteCount = periodLeads.filter((l) => l.status === "pendiente").length;
  const contactadoCount = periodLeads.filter((l) => l.status === "contactado").length;
  const canceladoCount = periodLeads.filter((l) => l.status === "cancelado").length;

  const visibleLeads = periodLeads.filter((l) => statusFilter === "todas" || l.status === statusFilter);

  return (
    <main className="flex-1 overflow-y-auto main-bg h-screen">
      <div className="max-w-5xl mx-auto px-4 py-6 sm:px-6 sm:py-8">
        <div className="mb-6">
          <h1 className="text-[26px] font-bold text-[#111] leading-tight">Leads</h1>
          <p className="text-[15px] text-[#888] mt-0.5">Formularios de contacto recibidos desde la web</p>
        </div>

        <div className="flex flex-wrap gap-1 bg-white border border-[#e0ddd4] rounded-xl p-1 w-fit mb-6">
          {TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`px-4 py-1.5 rounded-lg text-[14.5px] font-semibold transition-all ${
                tab === t.key ? "bg-[#111] text-white" : "text-[#666] hover:text-[#111] hover:bg-[#f5f3eb]"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {loading ? (
          <p className="text-[15px] text-[#888]">Cargando…</p>
        ) : tab === "stats" ? (
          <LeadsStatsView leads={leads} />
        ) : (
          <>
            {/* Selector de periodo — filtra las cards y la lista por mes/año de recepción */}
            <div className="flex items-center gap-1.5 mb-4">
              <span className="text-[12px] font-mono font-bold tracking-[0.14em] uppercase text-[#888] mr-1">
                Período
              </span>
              <select
                aria-label="Mes"
                value={periodo.month}
                onChange={(e) => setPeriodo((p) => ({ ...p, month: Number(e.target.value) }))}
                className="text-[13.5px] border border-[#e0ddd4] rounded-lg px-2 py-1.5 bg-white text-[#333] focus:outline-none focus:border-[#FFB800]"
              >
                {MONTHS.map((name, i) => (
                  <option key={i + 1} value={i + 1}>{name}</option>
                ))}
              </select>
              <select
                aria-label="Año"
                value={periodo.year}
                onChange={(e) => setPeriodo((p) => ({ ...p, year: Number(e.target.value) }))}
                className="text-[13.5px] border border-[#e0ddd4] rounded-lg px-2 py-1.5 bg-white text-[#333] focus:outline-none focus:border-[#FFB800]"
              >
                {YEARS.map((y) => (
                  <option key={y} value={y}>{y}</option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-4">
              <StatusSummaryCard
                label="Ver todos"
                value={periodLeads.length}
                active={statusFilter === "todas"}
                onClick={() => setStatusFilter("todas")}
              />
              <StatusSummaryCard
                label="Pendientes"
                value={pendienteCount}
                active={statusFilter === "pendiente"}
                onClick={() => handleStatusCardClick("pendiente")}
              />
              <StatusSummaryCard
                label="Contactados"
                value={contactadoCount}
                active={statusFilter === "contactado"}
                onClick={() => handleStatusCardClick("contactado")}
              />
              <StatusSummaryCard
                label="Cancelados"
                value={canceladoCount}
                active={statusFilter === "cancelado"}
                onClick={() => handleStatusCardClick("cancelado")}
              />
            </div>

            <LeadsTable leads={visibleLeads} onSelectLead={setSelectedLead} />
          </>
        )}
      </div>

      {selectedLead && (
        <LeadDetailModal
          lead={selectedLead}
          canManage={canManage}
          updatedByName={selectedLead.updated_by ? employeeName(selectedLead.updated_by) : null}
          onClose={() => setSelectedLead(undefined)}
          onStatusChange={(status) => handleStatusChange(selectedLead, status)}
        />
      )}
    </main>
  );
}

/** Vista de solo lectura de un lead — se abre al hacer click en la card (mismo patrón que MeetingDetail.jsx). */
function LeadDetailModal({ lead, canManage, updatedByName, onClose, onStatusChange }) {
  const labelClass = "font-mono font-bold uppercase tracking-widest text-[#888] text-[12px] mb-0.5";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 backdrop-blur-sm bg-black/30">
      <div role="dialog" aria-label={`Detalle de ${lead.nombre}`} className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex-shrink-0 px-6 pt-6 pb-4 border-b border-[#ece9df] flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <h2 className="text-[19px] font-bold text-[#111] leading-snug mb-2 truncate">{lead.nombre}</h2>
            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[12px] font-semibold ${STATUS_BADGE[lead.status]}`}>
              {STATUS_LABELS[lead.status]}
            </span>
          </div>
          <button onClick={onClose} aria-label="Cerrar" className="text-[#999] hover:text-[#111] transition-colors p-1">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M2 2l12 12M14 2L2 14" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-5 overflow-y-auto flex-1">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4 text-[14px]">
            <div>
              <p className={labelClass}>Empresa</p>
              <p className="text-[#333] font-medium">{lead.empresa}</p>
            </div>
            <div>
              <p className={labelClass}>Recibido</p>
              <p className="text-[#333]">
                {new Date(lead.created_at).toLocaleDateString("es-VE", { day: "2-digit", month: "short", year: "numeric" })}{" "}
                a las {new Date(lead.created_at).toLocaleTimeString("es-VE", { hour: "2-digit", minute: "2-digit" })}
              </p>
            </div>
            <div>
              <p className={labelClass}>Email</p>
              <p className="text-[#333]">{lead.email}</p>
            </div>
            <div>
              <p className={labelClass}>Teléfono</p>
              <p className="text-[#333]">{lead.telefono}</p>
            </div>
          </div>

          {(lead.servicios?.length > 0 || lead.tipo_pagina) && (
            <div className="flex flex-wrap gap-1.5 mb-4">
              {(lead.servicios ?? []).map((servicio) => (
                <span key={servicio} className="text-[12.5px] font-mono px-2 py-1 rounded-lg bg-[#f5f3eb] text-[#666]">
                  {servicio}
                </span>
              ))}
              {lead.tipo_pagina && (
                <span className="text-[12.5px] font-mono px-2 py-1 rounded-lg bg-[#f5f3eb] text-[#666]">
                  {lead.tipo_pagina}
                </span>
              )}
            </div>
          )}

          {lead.mensaje && (
            <p className="text-[14px] text-[#444] whitespace-pre-wrap mb-2">Mensaje: {lead.mensaje}</p>
          )}

          {lead.objetivo && (
            <p className="text-[14px] text-[#444] whitespace-pre-wrap mb-2">Objetivo: {lead.objetivo}</p>
          )}

          {lead.updated_by && lead.updated_at && (
            <p className="text-[12.5px] text-[#999] mt-2">
              {STATUS_LABELS[lead.status]} por {updatedByName ?? "un usuario"} el{" "}
              {new Date(lead.updated_at).toLocaleDateString("es-VE", { day: "2-digit", month: "short", year: "numeric" })}
            </p>
          )}

          <div className="mt-5 pt-4 border-t border-[#ece9df]">
            <p className={labelClass}>Estado</p>
            <select
              aria-label={`Estado del lead de ${lead.nombre}`}
              value={lead.status}
              disabled={!canManage}
              onChange={(e) => onStatusChange(e.target.value)}
              className="input-base !text-[14.5px] px-3 py-2 mt-1 disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {STATUS_OPTIONS.map((status) => (
                <option key={status} value={status}>{STATUS_LABELS[status]}</option>
              ))}
            </select>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Card de resumen clickeable — mismo lenguaje visual que en ReunionesPage
 * (label mono uppercase + valor grande). Un click activa/desactiva el filtro
 * de estado de la lista.
 */
function StatusSummaryCard({ label, value, active, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`text-left bg-white border rounded-xl p-2.5 sm:p-3 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_10px_30px_-8px_rgba(0,0,0,0.14)] ${
        active ? "border-[#111] ring-1 ring-[#111]" : "border-[#e0ddd4]"
      }`}
    >
      <p className="text-[10px] sm:text-[11.5px] font-mono font-bold tracking-[0.06em] sm:tracking-[0.1em] uppercase text-[#888] mb-1">{label}</p>
      <p className="text-[19px] sm:text-[22px] font-bold leading-none tracking-tight text-[#111]">{value}</p>
    </button>
  );
}
