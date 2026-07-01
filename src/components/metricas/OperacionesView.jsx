import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { loadReport, loadPrevReport, loadClients, upsertReport } from "./metricsApi";
import { initMetricReport } from "../../utils/initMetricReport";
import { syncReportClients } from "../../utils/syncReportClients";
import { calcTotal, sumScore, crecimientoCliente } from "../../utils/metricsScore";
import { MONTHS, INDICATORS } from "./constants";

export default function OperacionesView({ line, companyId, year, month }) {
  const navigate = useNavigate();
  const { can = () => true } = useAuth();
  const [report, setReport] = useState(null);
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    if (!line?.id || !companyId) return;
    setLoading(true);
    setError(null);

    const [reportRes, prevRes, clientsRes] = await Promise.all([
      loadReport(line.id, year, month),
      loadPrevReport(line.id, year, month),
      loadClients(companyId, line.id),
    ]);

    const lineClients = clientsRes.data ?? [];
    setClients(lineClients);

    if (reportRes.data) {
      // Sincronizar items con los clientes actuales de la línea
      const synced = syncReportClients(reportRes.data.data, lineClients);
      setReport(synced);
    } else {
      // Inicializar con carry-forward y metas de la línea
      const lineMetas = line?.metas ?? {};
      const fresh = initMetricReport(prevRes.data?.data ?? null, lineClients, lineMetas);
      const synced = syncReportClients(fresh, lineClients);
      setReport(synced);
    }
    setLoading(false);
  }, [line?.id, companyId, year, month]);

  useEffect(() => { load(); }, [load]);

  async function handleSave() {
    if (!report) return;
    setSaving(true);
    const { error: err } = await upsertReport(companyId, line.id, year, month, report);
    setSaving(false);
    if (err) { setError(err.message); return; }
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  function clientName(clienteId) {
    return clients.find(c => c.id === clienteId)?.name ?? "[Cliente eliminado]";
  }

  // Renderiza el nombre del cliente como botón navegable a Tareas cuando hay permiso.
  function ClientLink({ clienteId }) {
    const name = clientName(clienteId);
    if (can("tareas") && clienteId) {
      return (
        <button
          type="button"
          onClick={() => navigate(`/tareas?view=base&team=${line.id}&client=${clienteId}`)}
          className="text-[14px] text-[#555] truncate hover:text-[#111] hover:underline text-left"
          title={`Ver tareas de ${name}`}
        >
          {name}
        </button>
      );
    }
    return <span className="text-[14px] text-[#555] truncate">{name}</span>;
  }

  // Puntajes en tiempo real
  const scores = report ? calcTotal(report, null) : null;
  const total = scores ? sumScore(scores) : 0;
  const scoreColor = total >= 80 ? "text-green-600" : total >= 60 ? "text-[#b45309]" : "text-red-600";

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="w-6 h-6 border-2 border-[#FFB800] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!report) return null;

  // ── Helpers de actualización ──────────────────────────────────────────────
  function setField(path, value) {
    setReport(prev => {
      const next = structuredClone(prev);
      const parts = path.split(".");
      let obj = next;
      for (let i = 0; i < parts.length - 1; i++) obj = obj[parts[i]];
      obj[parts[parts.length - 1]] = value;
      return next;
    });
  }

  function setTareaField(idx, field, value) {
    setReport(prev => {
      const next = structuredClone(prev);
      next.productividad.tareas[idx][field] = field === "nombre" ? value : Number(value);
      return next;
    });
  }

  function setItemField(indicador, idx, field, value) {
    setReport(prev => {
      const next = structuredClone(prev);
      const parsed = value === "" || value === null ? null : Number(value);
      next[indicador].items[idx][field] = field === "nombre" ? value : parsed;
      return next;
    });
  }

  return (
    <div className="space-y-5">
      {/* Header con score en tiempo real */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-[13px] font-mono font-bold uppercase tracking-[0.1em] text-[#888]">
            {line.name} · {MONTHS[month - 1]} {year}
          </p>
          <div className="flex items-baseline gap-1 mt-0.5">
            <span className={`text-[36px] font-bold ${scoreColor}`}>{total.toFixed(1)}</span>
            <span className="text-[16px] text-[#aaa] font-mono">/100</span>
          </div>
        </div>
        <div className="flex flex-col gap-2 items-end">
          {/* Barra de indicadores */}
          <div className="flex gap-1">
            {INDICATORS.map((ind, i) => {
              const pts = scores?.[ind.key] ?? 0;
              const pct = (pts / ind.peso) * 100;
              const colors = ["#FAB51A","#3B82F6","#10B981","#F97316","#8B5CF6","#06B6D4","#EC4899"];
              return (
                <div key={ind.key} className="flex flex-col items-center gap-0.5" title={`${ind.short}: ${pts.toFixed(1)}/${ind.peso}`}>
                  <div className="w-5 h-14 bg-[#f0ede3] rounded-full overflow-hidden flex items-end">
                    <div
                      className="w-full rounded-full transition-all"
                      style={{ height: `${Math.min(100, pct)}%`, background: colors[i] }}
                    />
                  </div>
                  <span className="text-[9px] font-mono text-[#bbb]">{ind.short.slice(0, 3)}</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-[14px] rounded-xl px-4 py-3">{error}</div>
      )}

      {/* 1. REUNIONES */}
      <Section
        title="1. Reuniones realizadas"
        subtitle={`Peso: ${INDICATORS[0].peso} pts`}
        score={scores?.reuniones}
        max={INDICATORS[0].peso}
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="Realizadas">
            <input type="number" min="0" className="input-base"
              value={report.reuniones.realizadas ?? ""}
              onChange={e => setField("reuniones.realizadas", Number(e.target.value))}
            />
          </Field>
          <Field label="Meta">
            <input type="number" min="1" className="input-base"
              value={report.reuniones.meta ?? ""}
              onChange={e => setField("reuniones.meta", Number(e.target.value))}
            />
          </Field>
        </div>
      </Section>

      {/* 2. PRODUCTIVIDAD */}
      <Section
        title="2. Productividad – Tareas Fijas"
        subtitle={`Peso: ${INDICATORS[1].peso} pts`}
        score={scores?.productividad}
        max={INDICATORS[1].peso}
      >
        <div className="space-y-2">
          {report.productividad.tareas.map((tarea, idx) => (
            <div key={idx} className="grid grid-cols-[minmax(100px,1fr)_auto_auto] gap-2 items-center">
              <input
                type="text"
                className="input-base text-[14px]"
                placeholder="Nombre de tarea"
                value={tarea.nombre}
                onChange={e => setTareaField(idx, "nombre", e.target.value)}
              />
              <div className="flex items-center gap-1">
                <span className="text-[12px] text-[#aaa]">Real</span>
                <input type="number" min="0" className="input-base w-20 text-[14px]"
                  value={tarea.realizado ?? ""}
                  onChange={e => setTareaField(idx, "realizado", e.target.value)}
                />
              </div>
              <div className="flex items-center gap-1">
                <span className="text-[12px] text-[#aaa]">Meta</span>
                <input type="number" min="0" className="input-base w-20 text-[14px]"
                  value={tarea.meta ?? ""}
                  onChange={e => setTareaField(idx, "meta", e.target.value)}
                />
              </div>
            </div>
          ))}
          <button
            onClick={() => {
              setReport(prev => {
                const next = structuredClone(prev);
                next.productividad.tareas.push({ nombre: "", realizado: 0, meta: 0 });
                return next;
              });
            }}
            className="text-[13px] text-[#888] hover:text-[#111] font-medium flex items-center gap-1 mt-1"
          >
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.8">
              <path d="M6 1v10M1 6h10" strokeLinecap="round"/>
            </svg>
            Agregar tarea
          </button>
        </div>
      </Section>

      {/* 3. CRECIMIENTO */}
      <Section
        title="3. Crecimiento de seguidores"
        subtitle={`Peso: ${INDICATORS[2].peso} pts — cliente cumple si (actuales − base) ≥ meta`}
        score={scores?.crecimiento}
        max={INDICATORS[2].peso}
      >
        <div className="overflow-x-auto">
        <div className="space-y-2">
          {report.crecimiento.items.length === 0 ? (
            <p className="text-[14px] text-[#bbb]">Sin clientes. Configurá la cartera en la pestaña Configuración.</p>
          ) : (
            report.crecimiento.items.map((item, idx) => {
              const { crecimiento: delta, cumple } = crecimientoCliente(item);
              return (
                <div key={item.clienteId} className="grid grid-cols-[minmax(100px,1fr)_auto_auto_auto_auto] gap-2 items-center">
                  <ClientLink clienteId={item.clienteId} />
                  <div className="flex items-center gap-1">
                    <span className="text-[11px] text-[#aaa] whitespace-nowrap">Base manual</span>
                    <input type="number" className="input-base !w-24 flex-none text-[13px]"
                      placeholder="—"
                      value={item.seguidoresBase ?? ""}
                      onChange={e => setItemField("crecimiento", idx, "seguidoresBase", e.target.value === "" ? null : e.target.value)}
                    />
                  </div>
                  <div className="flex items-center gap-1">
                    <span className="text-[11px] text-[#aaa] whitespace-nowrap">Actuales</span>
                    <input type="number" className="input-base !w-24 flex-none text-[13px]"
                      placeholder="—"
                      value={item.seguidoresActuales ?? ""}
                      onChange={e => setItemField("crecimiento", idx, "seguidoresActuales", e.target.value === "" ? null : e.target.value)}
                    />
                  </div>
                  <div className="flex items-center gap-1">
                    <span className="text-[11px] text-[#aaa] whitespace-nowrap">Meta de crecimiento</span>
                    <input type="number" min="0" className="input-base !w-20 flex-none text-[13px]"
                      value={item.meta ?? 0}
                      onChange={e => setItemField("crecimiento", idx, "meta", e.target.value)}
                    />
                  </div>
                  {/* Indicador de cumplimiento */}
                  {cumple === null ? (
                    <span
                      className="text-[12px] text-[#bbb] font-mono w-24 text-center"
                      title="Faltan datos de base o seguidores actuales"
                    >—</span>
                  ) : cumple ? (
                    <span
                      className="text-[12px] font-semibold text-green-700 bg-green-50 rounded-full px-2.5 py-0.5 whitespace-nowrap"
                      title={delta !== null ? `+${delta} seguidores` : ""}
                    >✓ Cumple</span>
                  ) : (
                    <span
                      className="text-[12px] font-semibold text-[#a06a00] bg-[#fff6e0] rounded-full px-2.5 py-0.5 whitespace-nowrap"
                      title={delta !== null ? `+${delta} seguidores` : ""}
                    >Pendiente</span>
                  )}
                </div>
              );
            })
          )}
        </div>
        </div>
      </Section>

      {/* 4. SOLICITUDES */}
      <Section
        title="4. Solicitudes vs Entregados"
        subtitle={`Peso: ${INDICATORS[3].peso} pts`}
        score={scores?.solicitudes}
        max={INDICATORS[3].peso}
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="Solicitudes recibidas">
            <input type="number" min="0" className="input-base"
              value={report.solicitudes.solicitudes ?? ""}
              onChange={e => setField("solicitudes.solicitudes", Number(e.target.value))}
            />
          </Field>
          <Field label="Editadas / Entregadas">
            <input type="number" min="0" className="input-base"
              value={report.solicitudes.editadas ?? ""}
              onChange={e => setField("solicitudes.editadas", Number(e.target.value))}
            />
          </Field>
        </div>
      </Section>

      {/* 5. PAUTAS */}
      <Section
        title="5. Nº Pautas"
        subtitle={`Peso: ${INDICATORS[4].peso} pts — cliente cumple si realizadas ≥ meta`}
        score={scores?.pautas}
        max={INDICATORS[4].peso}
      >
        <div className="overflow-x-auto">
        <div className="space-y-2">
          {report.pautas.items.length === 0 ? (
            <p className="text-[14px] text-[#bbb]">Sin clientes configurados.</p>
          ) : (
            report.pautas.items.map((item, idx) => (
              <div key={item.clienteId} className="grid grid-cols-[minmax(100px,1fr)_auto_auto] gap-2 items-center">
                <ClientLink clienteId={item.clienteId} />
                <div className="flex items-center gap-1">
                  <span className="text-[11px] text-[#aaa]">Realizadas</span>
                  <input type="number" min="0" className="input-base w-20 text-[13px]"
                    value={item.realizadas ?? 0}
                    onChange={e => setItemField("pautas", idx, "realizadas", e.target.value)}
                  />
                </div>
                <div className="flex items-center gap-1">
                  <span className="text-[11px] text-[#aaa]">Meta</span>
                  <input type="number" min="0" className="input-base w-20 text-[13px]"
                    value={item.meta ?? 0}
                    onChange={e => setItemField("pautas", idx, "meta", e.target.value)}
                  />
                </div>
              </div>
            ))
          )}
        </div>
        </div>
      </Section>

      {/* 6. PIEZAS */}
      <Section
        title="6. Nº Piezas vs Piezas editadas"
        subtitle={`Peso: ${INDICATORS[5].peso} pts`}
        score={scores?.piezas}
        max={INDICATORS[5].peso}
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="Piezas totales">
            <input type="number" min="0" className="input-base"
              value={report.piezas.piezas ?? ""}
              onChange={e => setField("piezas.piezas", Number(e.target.value))}
            />
          </Field>
          <Field label="Piezas editadas">
            <input type="number" min="0" className="input-base"
              value={report.piezas.editadas ?? ""}
              onChange={e => setField("piezas.editadas", Number(e.target.value))}
            />
          </Field>
        </div>
      </Section>

      {/* 7. FEEDBACK */}
      <Section
        title="7. Feedback de clientes"
        subtitle={`Peso: ${INDICATORS[6].peso} pts — score 0–10 por cliente, se promedia`}
        score={scores?.feedback}
        max={INDICATORS[6].peso}
      >
        <div className="space-y-2">
          {report.feedback.items.length === 0 ? (
            <p className="text-[14px] text-[#bbb]">Sin clientes configurados.</p>
          ) : (
            report.feedback.items.map((item, idx) => (
              <div key={item.clienteId} className="grid grid-cols-[minmax(100px,1fr)_auto] gap-2 items-center">
                <ClientLink clienteId={item.clienteId} />
                <div className="flex items-center gap-1">
                  <span className="text-[11px] text-[#aaa]">Score (0–10)</span>
                  <input
                    type="number" min="0" max="10" step="0.1"
                    className="input-base w-20 text-[13px]"
                    placeholder="—"
                    value={item.score ?? ""}
                    onChange={e => setItemField("feedback", idx, "score", e.target.value === "" ? null : e.target.value)}
                  />
                </div>
              </div>
            ))
          )}
        </div>
      </Section>

      {/* Botón guardar */}
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
          {saved ? "Guardado" : saving ? "Guardando..." : "Guardar reporte"}
        </button>
      </div>
    </div>
  );
}

function Section({ title, subtitle, score, max, children }) {
  const pct = max > 0 ? Math.min(100, (score / max) * 100) : 0;
  return (
    <div className="bg-white rounded-2xl border border-[#e0ddd4] px-5 py-4 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[15px] font-bold text-[#111]">{title}</p>
          <p className="text-[12px] text-[#aaa] mt-0.5">{subtitle}</p>
        </div>
        <div className="flex flex-col items-end flex-shrink-0">
          <span className="text-[20px] font-bold text-[#111] tabular-nums">
            {score != null ? score.toFixed(1) : "—"}
          </span>
          <span className="text-[11px] font-mono text-[#aaa]">/{max} pts</span>
          <div className="w-24 h-1.5 bg-[#f0ede3] rounded-full overflow-hidden mt-1">
            <div className="h-full bg-[#FAB51A] rounded-full transition-all" style={{ width: `${pct}%` }} />
          </div>
        </div>
      </div>
      {children}
    </div>
  );
}

function Field({ label, children }) {
  return (
    <div>
      <label className="block text-[12px] font-mono font-bold uppercase tracking-[0.1em] text-[#888] mb-1">
        {label}
      </label>
      {children}
    </div>
  );
}
