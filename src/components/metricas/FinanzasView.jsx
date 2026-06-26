import { useState, useEffect, useCallback } from "react";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend,
} from "recharts";
import { loadReport, loadPrevReport, upsertReport } from "./metricsApi";
import { initMetricReport } from "../../utils/initMetricReport";
import { calcFinanzas, ensureFinanzas, fmtUSD } from "../../utils/metricsFinance";
import { MONTHS } from "./constants";

function uid() {
  return Math.random().toString(36).slice(2, 10);
}

const SECCIONES = [
  { key: "ingresos",         label: "Ingresos",          color: "#10B981" },
  { key: "gastosOperativos", label: "Gastos operativos",  color: "#F97316" },
  { key: "sueldos",          label: "Sueldos / Nómina",   color: "#EF4444" },
  { key: "otrosGastos",      label: "Otros gastos",       color: "#8B5CF6" },
];

export default function FinanzasView({ line, companyId, year, month }) {
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    if (!line?.id || !companyId) return;
    setLoading(true);
    setError(null);
    const [reportRes, prevRes] = await Promise.all([
      loadReport(line.id, year, month),
      loadPrevReport(line.id, year, month),
    ]);
    if (reportRes.data) {
      const d = reportRes.data.data;
      ensureFinanzas(d);
      setReport(d);
    } else {
      const fresh = initMetricReport(prevRes.data?.data ?? null, []);
      ensureFinanzas(fresh);
      setReport(fresh);
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

  function addItem(seccion) {
    setReport(prev => {
      const next = structuredClone(prev);
      next.finanzas[seccion].push({ id: uid(), descripcion: "", monto: 0 });
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
      next.finanzas[seccion][idx][field] = field === "monto" ? Number(value) || 0 : value;
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

  return (
    <div className="space-y-5">
      {/* KPIs */}
      <div className="text-[14px] font-mono text-[#888] mb-1">
        {line.name} · {MONTHS[month - 1]} {year}
      </div>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <KpiCard label="Ingresos brutos"    value={fmtUSD(f.totIngresos)}    color="text-green-600" />
        <KpiCard label="Total egresos"      value={fmtUSD(f.totEgresos)}     color="text-red-500"   />
        <KpiCard
          label={positivo ? "Ganancia neta" : "Pérdida neta"}
          value={fmtUSD(f.diferencia)}
          color={positivo ? "text-green-600" : "text-red-500"}
        />
      </div>

      {/* Chart */}
      <div className="bg-white rounded-2xl border border-[#e0ddd4] px-5 py-4">
        <p className="text-[13px] font-mono font-bold tracking-[0.14em] uppercase text-[#888] mb-3">
          Resumen financiero
        </p>
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={chartData} margin={{ top: 4, right: 16, left: 0, bottom: 4 }}>
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
              label={false}
              cell={[
                { fill: "#10B981" },
                { fill: "#F97316" },
                { fill: "#EF4444" },
                { fill: "#8B5CF6" },
                { fill: positivo ? "#10B981" : "#EF4444" },
              ]}
            />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Secciones editables */}
      {SECCIONES.map(sec => (
        <div key={sec.key} className="bg-white rounded-2xl border border-[#e0ddd4] px-5 py-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ background: sec.color }} />
              <p className="text-[15px] font-bold text-[#111]">{sec.label}</p>
            </div>
            <span className="text-[16px] font-bold text-[#111] tabular-nums">
              {fmtUSD(
                (report.finanzas[sec.key] ?? []).reduce((a, it) => a + Number(it.monto ?? 0), 0)
              )}
            </span>
          </div>

          {(report.finanzas[sec.key] ?? []).length === 0 ? (
            <p className="text-[13px] text-[#bbb]">Sin entradas aún.</p>
          ) : (
            <div className="space-y-2">
              {(report.finanzas[sec.key] ?? []).map((item, idx) => (
                <div key={item.id ?? idx} className="flex items-center gap-2">
                  <input
                    type="text"
                    className="input-base flex-1 text-[14px]"
                    placeholder="Descripción"
                    value={item.descripcion ?? ""}
                    onChange={e => updateItem(sec.key, idx, "descripcion", e.target.value)}
                  />
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    className="input-base w-28 text-[14px]"
                    placeholder="0.00"
                    value={item.monto ?? ""}
                    onChange={e => updateItem(sec.key, idx, "monto", e.target.value)}
                  />
                  <button
                    onClick={() => removeItem(sec.key, idx)}
                    className="text-[#ccc] hover:text-red-400 transition-colors flex-shrink-0"
                    title="Eliminar"
                  >
                    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.7">
                      <path d="M4 4l8 8M12 4l-8 8" strokeLinecap="round"/>
                    </svg>
                  </button>
                </div>
              ))}
            </div>
          )}

          <button
            onClick={() => addItem(sec.key)}
            className="text-[13px] text-[#888] hover:text-[#111] font-medium flex items-center gap-1"
          >
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.8">
              <path d="M6 1v10M1 6h10" strokeLinecap="round"/>
            </svg>
            Agregar entrada
          </button>
        </div>
      ))}

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
    </div>
  );
}

function KpiCard({ label, value, color }) {
  return (
    <div className="bg-white rounded-2xl border border-[#e0ddd4] px-4 py-4">
      <p className="text-[12px] font-mono font-bold uppercase tracking-[0.12em] text-[#aaa] mb-1">{label}</p>
      <p className={`text-[22px] font-bold tabular-nums ${color}`}>{value}</p>
    </div>
  );
}
