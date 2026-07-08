import React, { useState, useEffect, useCallback, useRef } from "react";
import { useSearchParams } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { isFinancePrivileged } from "../../lib/permissions";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, LabelList,
} from "recharts";
import { loadReport, loadPrevReport, upsertReport, loadClients, loadCompanyEmployees, updateEmployeeSalaries } from "./metricsApi";
import { initMetricReport } from "../../utils/initMetricReport";
import { syncReportClients } from "../../utils/syncReportClients";
import { pickSalaryUpdates } from "../../utils/salaryWriteback";
import { calcFinanzas, calcConsolidado, calcConsolidadoConGasto, ensureFinanzas, fmtUSD } from "../../utils/metricsFinance";
import SectionTotal from "../common/SectionTotal";
import { MONTHS } from "./constants";
import ClientFichaModal from "./ClientFichaModal";
import EmployeeInfoModal from "./EmployeeInfoModal";
import { Avatar } from "../tareas/UserPickerSingle";
import { useUnsavedChanges } from "../../hooks/useUnsavedChanges";

/** Adapta un objeto cliente (logo_url) al shape que espera <Avatar> (avatar_url). */
function clientAvatar(c) {
  return {
    first_name: c?.name ?? "",
    last_name: "",
    avatar_url: c?.logo_url ?? null,
    user_id: c?.id,
  };
}

function uid() {
  return Math.random().toString(36).slice(2, 10);
}

const SECCIONES = [
  { key: "ingresos",         label: "Ingresos",          color: "#10B981", totalLabel: "ingresos" },
  { key: "gastosOperativos", label: "Gastos operativos",  color: "#F97316", totalLabel: "gastos" },
  { key: "sueldos",          label: "Sueldos / Nómina",   color: "#EF4444", totalLabel: "sueldos" },
  { key: "otrosGastos",      label: "Otros gastos",       color: "#8B5CF6", totalLabel: "otros gastos" },
];

export default function FinanzasView({ line, companyId, year, month }) {
  const { can = () => true, userProfile } = useAuth();
  const privileged = isFinancePrivileged(userProfile);

  const [report, setReport]           = useState(null);
  const [lineClients, setLineClients] = useState([]);
  const [lineEmployees, setLineEmployees] = useState([]);
  const [companyEmployees, setCompanyEmployees] = useState([]);
  const [loading, setLoading]         = useState(true);
  const [saving, setSaving]           = useState(false);
  const [saved, setSaved]             = useState(false);
  const [error, setError]             = useState(null);
  const [cliModal, setCliModal]       = useState(null); // null=cerrado, objeto=cliente
  const [empModal, setEmpModal]       = useState(null); // null=cerrado, objeto=empleado
  const [ingresosView, setIngresosView] = useState("tarjetas"); // "lista" | "tarjetas" — tarjetas por defecto
  const [sueldosView,  setSueldosView]  = useState("tarjetas"); // "lista" | "tarjetas" — tarjetas por defecto

  // Snapshot del reporte tal como vino del servidor (o quedó tras un save).
  // Se usa para detectar cambios sin guardar y mostrar aviso al recargar/cerrar.
  const baselineRef = useRef(null);

  // Refs para scroll de KPIs
  const ingresosRef = useRef(null);
  const gastosRef   = useRef(null);

  // Deep-link ?section=ingresos|gastos (p.ej. desde LineFichaModal en Empresa):
  // scroll one-shot a la sección tras la primera carga, luego se limpia el param.
  const [searchParams, setSearchParams] = useSearchParams();
  const pendingSection = useRef(searchParams.get("section"));

  const load = useCallback(async () => {
    if (!line?.id || !companyId) return;
    setLoading(true);
    setError(null);
    const [reportRes, prevRes, clientsRes, employeesRes] = await Promise.all([
      loadReport(line.id, year, month),
      loadPrevReport(line.id, year, month),
      loadClients(companyId, line.id, { includeArchived: true }),
      loadCompanyEmployees(companyId),
    ]);
    // Todos (incl. archivados) para resolver nombres en reportes guardados;
    // solo activos para syncReportClients (no re-agregar archivados al reporte actual).
    const allClients = clientsRes.data ?? [];
    const activeClients = allClients.filter(c => !c.deleted_at);
    setLineClients(allClients);

    // Lista completa de empleados de la empresa (para resolver apoyo_ids fuera de la línea)
    const allEmployees = employeesRes.data ?? [];
    setCompanyEmployees(allEmployees);
    // Filtrar empleados del team de esta línea (member_user_ids es un array reconstruido
    // en loadLines a partir de la tabla relacional metric_line_members)
    const memberIds = new Set(line.member_user_ids ?? []);
    const employees = allEmployees.filter(e => memberIds.has(e.user_id));
    setLineEmployees(employees);

    if (reportRes.data) {
      const d = reportRes.data.data;
      ensureFinanzas(d);
      const synced = syncReportClients(d, activeClients, employees);
      setReport(synced);
      baselineRef.current = synced;
    } else {
      const fresh = initMetricReport(prevRes.data?.data ?? null, activeClients, {}, employees);
      ensureFinanzas(fresh);
      const synced = syncReportClients(fresh, activeClients, employees);
      setReport(synced);
      baselineRef.current = synced;
    }
    setLoading(false);
  }, [line?.id, line?.member_user_ids, companyId, year, month]);

  useEffect(() => { load(); }, [load]);

  // Aviso nativo del navegador si se intenta recargar/cerrar con cambios sin guardar.
  useUnsavedChanges({ value: report, baseline: baselineRef.current, onClose: () => {} });

  useEffect(() => {
    if (loading || !pendingSection.current) return;
    const ref = pendingSection.current === "ingresos" ? ingresosRef
              : pendingSection.current === "gastos"   ? gastosRef : null;
    pendingSection.current = null; // one-shot: no re-scrollear al cambiar mes/año
    ref?.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    setSearchParams(prev => {
      const p = new URLSearchParams(prev);
      p.delete("section");
      return p;
    }, { replace: true });
  }, [loading, setSearchParams]);

  async function handleSave() {
    if (!report) return;
    setSaving(true);
    const { error: err } = await upsertReport(companyId, line.id, year, month, report);
    setSaving(false);
    if (err) { setError(err.message); return; }

    // Write-back: persistir sueldos editados al sueldo maestro del empleado (users.monthly_salary).
    // Solo para usuarios privilegiados, solo montos > 0 que difieran del maestro actual.
    if (privileged) {
      const salaryUpdates = pickSalaryUpdates(report.finanzas?.sueldos, lineEmployees);
      if (salaryUpdates.length) {
        const { error: salErr } = await updateEmployeeSalaries(salaryUpdates);
        if (salErr) {
          // El reporte ya se guardó; informar pero no bloquear
          setError(`Reporte guardado. Error al actualizar sueldos maestros: ${salErr.message}`);
        } else {
          // Reflejar nuevo maestro en memoria para evitar re-disparar updates en el próximo save
          setLineEmployees(prev => prev.map(e => {
            const u = salaryUpdates.find(x => x.user_id === e.user_id);
            return u ? { ...e, monthly_salary: u.monto } : e;
          }));
        }
      }
    }

    // Actualizar baseline para que el aviso desaparezca tras guardar
    baselineRef.current = report;
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  function addItem(seccion) {
    setReport(prev => {
      const next = structuredClone(prev);
      const item = { id: uid(), descripcion: "", monto: null };
      if (seccion === "gastosOperativos") item.clienteId = null;
      next.finanzas[seccion].push(item);
      return next;
    });
  }

  function removeItem(seccion, idx) {
    setReport(prev => {
      const next = structuredClone(prev);
      next.finanzas[seccion].splice(idx, 1);
      return next;
    });
  }

  function updateItem(seccion, idx, field, value) {
    setReport(prev => {
      const next = structuredClone(prev);
      next.finanzas[seccion][idx][field] = field === "monto" ? (value === "" ? null : Number(value)) : value;
      return next;
    });
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="w-6 h-6 border-2 border-[#FFB800] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }
  if (!report) return null;

  const f = calcFinanzas(report);
  const positivo = f.diferencia >= 0;

  // Chart data
  const chartData = [
    { name: "Ingresos",  valor: f.totIngresos },
    { name: "G. Oper.",  valor: f.totGastosOperativos },
    { name: "Sueldos",   valor: f.totSueldos },
    { name: "Otros",     valor: f.totOtrosGastos },
    { name: "Diferencia", valor: f.diferencia },
  ];

  // Secciones visibles (sueldos solo para privilegiados)
  const seccionesVisibles = SECCIONES.filter(
    sec => sec.key !== "sueldos" || privileged
  );

  return (
    <div className="space-y-5">
      {/* KPIs */}
      <div className="text-[14px] font-mono text-[#888] mb-1">
        {line.name} · {MONTHS[month - 1]} {year}
      </div>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <KpiCard
          label="Ingresos brutos"
          value={fmtUSD(f.totIngresos)}
          color="text-green-600"
          onClick={() => ingresosRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })}
          title="Ir a ingresos"
        />
        <KpiCard
          label="Total egresos"
          value={fmtUSD(f.totEgresos)}
          color="text-red-500"
          onClick={() => gastosRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })}
          title="Ir a gastos"
        />
        <KpiCard
          label="Diferencia"
          value={fmtUSD(f.diferencia)}
          color={positivo ? "text-green-600" : "text-red-500"}
        />
      </div>

      {/* Chart */}
      <div className="bg-white rounded-2xl border border-[#e0ddd4] px-5 py-4">
        <p className="text-[13px] font-mono font-bold tracking-[0.14em] uppercase text-[#888] mb-3">
          Resumen financiero
        </p>
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={chartData} margin={{ top: 28, right: 16, left: 0, bottom: 4 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f0ede3" />
            <XAxis dataKey="name" tick={{ fontSize: 11, fontFamily: "DM Mono, monospace", fill: "#555" }} />
            <YAxis tick={{ fontSize: 10, fontFamily: "DM Mono, monospace", fill: "#888" }}
              tickFormatter={v => v >= 1000 ? `$${(v/1000).toFixed(0)}k` : `$${v}`}
            />
            <Tooltip
              contentStyle={{ fontSize: 12, fontFamily: "DM Mono, monospace", borderRadius: 8, border: "1px solid #e0ddd4" }}
              formatter={(val) => fmtUSD(val)}
            />
            <Bar dataKey="valor" fill="#FAB51A" radius={[4, 4, 0, 0]}
              cell={[
                { fill: "#10B981" },
                { fill: "#F97316" },
                { fill: "#EF4444" },
                { fill: "#8B5CF6" },
                { fill: positivo ? "#10B981" : "#EF4444" },
              ]}
            >
              <LabelList
                dataKey="valor"
                position="top"
                formatter={(v) => fmtUSD(v)}
                style={{ fontSize: 10, fontFamily: "DM Mono, monospace", fill: "#555" }}
              />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Secciones editables */}
      {seccionesVisibles.map((sec) => {
        const isIngresos     = sec.key === "ingresos";
        const isSueldos      = sec.key === "sueldos";
        const isFirstGastos  = sec.key === "gastosOperativos";
        const items = report.finanzas[sec.key] ?? [];

        // Vista-toggle compartida: ingresos y sueldos tienen Lista/Tarjetas
        const sectionView    = isIngresos ? ingresosView : sueldosView;
        const setSectionView = isIngresos ? setIngresosView : setSueldosView;

        const seccionCard = (
          <div
            key={sec.key}
            ref={isIngresos ? ingresosRef : isFirstGastos ? gastosRef : null}
            className="bg-white rounded-2xl border border-[#e0ddd4] px-5 py-4 space-y-3"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ background: sec.color }} />
                <p className="text-[15px] font-bold text-[#111]">{sec.label}</p>
              </div>
              <div className="flex items-center gap-3">
                {/* Toggle Lista/Tarjetas — ingresos y sueldos */}
                {(isIngresos || isSueldos) && (
                  <div className="flex bg-[#f5f3eb] border border-[#e0ddd4] rounded-lg p-0.5">
                    <button
                      type="button"
                      onClick={() => setSectionView("lista")}
                      className={`px-2.5 py-1 rounded-md text-[12px] font-semibold transition-all ${
                        sectionView === "lista"
                          ? "bg-white text-[#111] shadow-sm"
                          : "text-[#888] hover:text-[#555]"
                      }`}
                      title="Vista lista"
                    >
                      Lista
                    </button>
                    <button
                      type="button"
                      onClick={() => setSectionView("tarjetas")}
                      className={`px-2.5 py-1 rounded-md text-[12px] font-semibold transition-all ${
                        sectionView === "tarjetas"
                          ? "bg-white text-[#111] shadow-sm"
                          : "text-[#888] hover:text-[#555]"
                      }`}
                      title="Vista tarjetas"
                    >
                      Tarjetas
                    </button>
                  </div>
                )}
                <span className="text-[16px] font-bold text-[#111] tabular-nums">
                  {fmtUSD(items.reduce((a, it) => a + Number(it.monto ?? 0), 0))}
                </span>
              </div>
            </div>

            {items.length === 0 ? (
              <p className="text-[13px] text-[#bbb]">Sin entradas aún.</p>
            ) : isIngresos && sectionView === "tarjetas" ? (
              /* ── Vista tarjetas para ingresos — editable ── */
              <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                {items.map((item, idx) => {
                  const isClientRow = item.clienteId != null;
                  const clientObj   = isClientRow ? lineClients.find(c => c.id === item.clienteId) : null;
                  return (
                    <div
                      key={item.id ?? idx}
                      className="flex flex-col gap-1.5 px-3 py-2.5 rounded-xl border border-[#e0ddd4] bg-[#faf9f5]"
                    >
                      {/* Nombre: clickeable si es cliente */}
                      {isClientRow && clientObj ? (
                        <button
                          type="button"
                          onClick={() => setCliModal(clientObj)}
                          className="flex items-center gap-1.5 text-[13px] font-semibold text-[#333] text-left hover:text-[#111] hover:underline transition-colors"
                          title={`Ver ficha de ${item.descripcion}`}
                        >
                          <Avatar user={clientAvatar(clientObj)} size={18} />
                          <span className="truncate">{item.descripcion}</span>
                        </button>
                      ) : isClientRow ? (
                        <span className="text-[13px] font-semibold text-[#333] truncate">{item.descripcion || "—"}</span>
                      ) : (
                        <input
                          type="text"
                          className="input-base !py-1 text-[13px]"
                          placeholder="Descripción"
                          value={item.descripcion ?? ""}
                          onChange={e => updateItem("ingresos", idx, "descripcion", e.target.value)}
                        />
                      )}
                      {/* Monto editable */}
                      <div className="flex items-center gap-1">
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          className="input-base !py-1 flex-1 min-w-0 text-[13px] font-mono"
                          placeholder="0.00"
                          value={item.monto ?? ""}
                          onChange={e => updateItem("ingresos", idx, "monto", e.target.value)}
                        />
                        {!isClientRow && (
                          <button
                            type="button"
                            onClick={() => removeItem("ingresos", idx)}
                            className="text-[#ccc] hover:text-red-400 transition-colors flex-shrink-0"
                            title="Eliminar"
                          >
                            <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.7">
                              <path d="M4 4l8 8M12 4l-8 8" strokeLinecap="round"/>
                            </svg>
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : isSueldos && sectionView === "tarjetas" ? (
              /* ── Vista tarjetas para sueldos — con foto de perfil ── */
              <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                {items.map((item, idx) => {
                  const isEmployeeRow = item.empleadoId != null;
                  const employeeObj   = isEmployeeRow ? lineEmployees.find(e => e.user_id === item.empleadoId) : null;
                  return (
                    <div
                      key={item.id ?? idx}
                      className="flex flex-col gap-1.5 px-3 py-2.5 rounded-xl border border-[#e0ddd4] bg-[#faf9f5]"
                    >
                      {/* Avatar + nombre: clickeable si hay empleado resuelto */}
                      {isEmployeeRow && employeeObj ? (
                        <button
                          type="button"
                          onClick={() => setEmpModal(employeeObj)}
                          className="flex items-center gap-2 text-left hover:opacity-75 transition-opacity"
                          title={`Ver ficha de ${item.descripcion}`}
                        >
                          <Avatar user={employeeObj} size={28} />
                          <span className="flex flex-col min-w-0">
                            <span className="text-[13px] font-semibold text-[#333] truncate">{item.descripcion}</span>
                            {employeeObj.position?.position_name && (
                              <span className="text-[11px] text-[#999] truncate">{employeeObj.position.position_name}</span>
                            )}
                          </span>
                        </button>
                      ) : isEmployeeRow ? (
                        <span className="text-[13px] font-semibold text-[#333] truncate">{item.descripcion || "—"}</span>
                      ) : (
                        <input
                          type="text"
                          className="input-base !py-1 text-[13px]"
                          placeholder="Descripción"
                          value={item.descripcion ?? ""}
                          onChange={e => updateItem("sueldos", idx, "descripcion", e.target.value)}
                        />
                      )}
                      {/* Monto editable */}
                      <div className="flex items-center gap-1">
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          className="input-base !py-1 flex-1 min-w-0 text-[13px] font-mono"
                          placeholder="0.00"
                          value={item.monto ?? ""}
                          onChange={e => updateItem("sueldos", idx, "monto", e.target.value)}
                        />
                        {!isEmployeeRow && (
                          <button
                            type="button"
                            onClick={() => removeItem("sueldos", idx)}
                            className="text-[#ccc] hover:text-red-400 transition-colors flex-shrink-0"
                            title="Eliminar"
                          >
                            <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.7">
                              <path d="M4 4l8 8M12 4l-8 8" strokeLinecap="round"/>
                            </svg>
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              /* ── Vista lista (default para todas las secciones no-ingresos + ingresos en lista) ── */
              <div className="space-y-2">
                {items.map((item, idx) => {
                  const isClientRow   = isIngresos  && item.clienteId  != null;
                  const isEmployeeRow = isSueldos   && item.empleadoId != null;
                  const clientObj     = isClientRow   ? lineClients.find(c => c.id === item.clienteId)     : null;
                  const employeeObj   = isEmployeeRow ? lineEmployees.find(e => e.user_id === item.empleadoId) : null;
                  return (
                    <div key={item.id ?? idx} className="flex items-center gap-2">
                      {isClientRow ? (
                        /* Fila ligada a cliente: avatar + nombre; clickeable hacia ficha técnica */
                        clientObj ? (
                          <button
                            type="button"
                            onClick={() => setCliModal(clientObj)}
                            className="flex-1 min-w-0 flex items-center gap-2 text-[14px] text-[#333] px-2.5 py-2 bg-[#faf9f5] border border-[#e8e5db] rounded-lg text-left hover:bg-[#f0ede3] hover:border-[#d0ccc0] transition-colors"
                            title={`Ver ficha de ${item.descripcion}`}
                          >
                            <Avatar user={clientAvatar(clientObj)} size={22} />
                            <span className="truncate">{item.descripcion}</span>
                          </button>
                        ) : (
                          <span className="flex-1 min-w-0 text-[14px] text-[#333] px-2.5 py-2 bg-[#faf9f5] border border-[#e8e5db] rounded-lg truncate">
                            {item.descripcion}
                          </span>
                        )
                      ) : isEmployeeRow ? (
                        /* Fila ligada a empleado: avatar + nombre; clickeable hacia ficha empleado */
                        employeeObj ? (
                          <button
                            type="button"
                            onClick={() => setEmpModal(employeeObj)}
                            className="flex-1 min-w-0 flex items-center gap-2 text-[14px] text-[#333] px-2.5 py-2 bg-[#faf9f5] border border-[#e8e5db] rounded-lg text-left hover:bg-[#f0ede3] hover:border-[#d0ccc0] transition-colors"
                            title={`Ver ficha de ${item.descripcion}`}
                          >
                            <Avatar user={employeeObj} size={22} />
                            <span className="flex flex-col min-w-0 leading-tight">
                              <span className="truncate">{item.descripcion}</span>
                              {employeeObj.position?.position_name && (
                                <span className="text-[11.5px] text-[#999] truncate">{employeeObj.position.position_name}</span>
                              )}
                            </span>
                          </button>
                        ) : (
                          <span className="flex-1 min-w-0 text-[14px] text-[#333] px-2.5 py-2 bg-[#faf9f5] border border-[#e8e5db] rounded-lg truncate">
                            {item.descripcion}
                          </span>
                        )
                      ) : (
                        <>
                          {isFirstGastos && (
                            <select
                              className="input-base !w-36 flex-none text-[14px]"
                              value={item.clienteId ?? ""}
                              onChange={e => updateItem(sec.key, idx, "clienteId", e.target.value || null)}
                            >
                              <option value="">Sin cliente</option>
                              {lineClients.map(c => (
                                <option key={c.id} value={c.id}>{c.name}</option>
                              ))}
                            </select>
                          )}
                          <input
                            type="text"
                            className="input-base flex-1 min-w-0 text-[14px]"
                            placeholder="Justificación"
                            value={item.descripcion ?? ""}
                            onChange={e => updateItem(sec.key, idx, "descripcion", e.target.value)}
                          />
                        </>
                      )}
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        className="input-base !w-28 flex-none text-[14px]"
                        placeholder="0.00"
                        value={item.monto ?? ""}
                        onChange={e => updateItem(sec.key, idx, "monto", e.target.value)}
                      />
                      {!isClientRow && !isEmployeeRow && (
                        <button
                          onClick={() => removeItem(sec.key, idx)}
                          className="text-[#ccc] hover:text-red-400 transition-colors flex-shrink-0"
                          title="Eliminar"
                        >
                          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.7">
                            <path d="M4 4l8 8M12 4l-8 8" strokeLinecap="round"/>
                          </svg>
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            <button
              onClick={() => {
                if (sec.key === "ingresos") {
                  setReport(prev => {
                    const next = structuredClone(prev);
                    next.finanzas.ingresos.push({ id: uid(), clienteId: null, descripcion: "", monto: null });
                    return next;
                  });
                } else {
                  addItem(sec.key);
                }
              }}
              className="text-[13px] text-[#888] hover:text-[#111] font-medium flex items-center gap-1"
            >
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.8">
                <path d="M6 1v10M1 6h10" strokeLinecap="round"/>
              </svg>
              Agregar entrada
            </button>
            <SectionTotal label={sec.totalLabel} count={items.length} />
          </div>
        );

        if (!isFirstGastos) return seccionCard;

        // ── Consolidado de gastos (solo debajo de Gastos Operativos) ──
        const { rows: consolidadoRows, totals: consolidadoTotals } = calcConsolidadoConGasto(report, lineClients);
        return (
          <React.Fragment key={sec.key}>
            {seccionCard}
            <div className="bg-white rounded-2xl border border-[#e0ddd4] px-5 py-4 space-y-3">
              <div className="flex items-center gap-2">
                <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ background: "#6366F1" }} />
                <p className="text-[15px] font-bold text-[#111]">Consolidado de gastos</p>
              </div>
              {consolidadoRows.length === 0 ? (
                <p className="text-[13px] text-[#bbb]">Sin gastos operativos registrados.</p>
              ) : (
                <div className="space-y-1">
                  {/* Encabezado */}
                  <div className="grid grid-cols-[1fr_auto_auto_auto] gap-3 items-center pb-1 border-b border-[#f0ede3]">
                    <span className="text-[11px] font-mono font-bold uppercase tracking-[0.1em] text-[#aaa]">Cliente</span>
                    <span className="text-[11px] font-mono font-bold uppercase tracking-[0.1em] text-[#10B981] w-24 text-right">Ingresos</span>
                    <span className="text-[11px] font-mono font-bold uppercase tracking-[0.1em] text-[#F97316] w-24 text-right">G. Oper.</span>
                    <span className="text-[11px] font-mono font-bold uppercase tracking-[0.1em] text-[#888] w-24 text-right">Diferencia</span>
                  </div>
                  {consolidadoRows.map(fila => {
                    const pos = fila.diferencia >= 0;
                    const filaClient = lineClients.find(c => c.id === fila.id);
                    return (
                      <div key={fila.id} className="grid grid-cols-[1fr_auto_auto_auto] gap-3 items-center py-1.5">
                        <div className="flex items-center gap-2 min-w-0">
                          <Avatar user={clientAvatar(filaClient ?? { name: fila.nombre, id: fila.id })} size={20} />
                          <span className="text-[14px] text-[#333] truncate">{fila.nombre}</span>
                        </div>
                        <span className="text-[13px] font-mono text-[#10B981] w-24 text-right tabular-nums">{fmtUSD(fila.ingresos)}</span>
                        <span className="text-[13px] font-mono text-[#F97316] w-24 text-right tabular-nums">{fmtUSD(fila.gastos)}</span>
                        <span className={`text-[13px] font-mono font-semibold w-24 text-right tabular-nums ${pos ? "text-green-600" : "text-red-500"}`}>
                          {pos ? "+" : ""}{fmtUSD(fila.diferencia)}
                        </span>
                      </div>
                    );
                  })}
                  {/* Fila de totales — solo Total de G. Oper. */}
                  <div className="grid grid-cols-[1fr_auto_auto_auto] gap-3 items-center pt-2 mt-1 border-t border-[#e0ddd4]">
                    <span className="text-[13px] font-mono font-bold text-[#555]">Total G. Oper.</span>
                    <span className="w-24" />
                    <span className="text-[13px] font-mono font-bold text-[#F97316] w-24 text-right tabular-nums">{fmtUSD(consolidadoTotals.gastos)}</span>
                    <span className="w-24" />
                  </div>
                  <SectionTotal label="marcas" count={consolidadoRows.length} />
                </div>
              )}
            </div>
          </React.Fragment>
        );
      })}

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-[14px] rounded-xl px-4 py-3">{error}</div>
      )}

      {/* Guardar */}
      <div className="flex items-center justify-end pt-2 pb-6">
        <button
          onClick={handleSave}
          disabled={saving}
          className={`flex items-center gap-2 px-6 py-2.5 rounded-xl font-semibold text-[15px] transition-all ${
            saved
              ? "bg-green-500 text-white"
              : "bg-[#FAB51A] text-[#111] hover:bg-[#e8a315]"
          } disabled:opacity-60`}
        >
          {saving ? (
            <div className="w-4 h-4 border-2 border-[#111] border-t-transparent rounded-full animate-spin" />
          ) : saved ? (
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M3 8l3 3 7-7" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          ) : null}
          {saved ? "Guardado" : saving ? "Guardando..." : "Guardar finanzas"}
        </button>
      </div>

      {/* Modal ficha técnica cliente */}
      {cliModal && (
        <ClientFichaModal
          client={cliModal}
          line={line}
          onClose={() => setCliModal(null)}
          employees={companyEmployees}
        />
      )}

      {/* Modal ficha empleado */}
      {empModal && (
        <EmployeeInfoModal
          employee={empModal}
          line={line}
          onClose={() => setEmpModal(null)}
        />
      )}
    </div>
  );
}

function KpiCard({ label, value, color, onClick, title }) {
  const base = "bg-white rounded-2xl border border-[#e0ddd4] px-4 py-4";
  const interactive = onClick
    ? `${base} cursor-pointer hover:bg-[#fafaf7] hover:border-[#d0ccc0] transition-colors`
    : base;
  return onClick ? (
    <button type="button" onClick={onClick} title={title} className={`${interactive} text-left w-full`}>
      <p className="text-[12px] font-mono font-bold uppercase tracking-[0.12em] text-[#aaa] mb-1">{label}</p>
      <p className={`text-[22px] font-bold tabular-nums ${color}`}>{value}</p>
    </button>
  ) : (
    <div className={base}>
      <p className="text-[12px] font-mono font-bold uppercase tracking-[0.12em] text-[#aaa] mb-1">{label}</p>
      <p className={`text-[22px] font-bold tabular-nums ${color}`}>{value}</p>
    </div>
  );
}
