import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import SectionTotal from "../common/SectionTotal";
import { useAuth } from "../../context/AuthContext";
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, Tooltip,
  ResponsiveContainer, Legend, CartesianGrid, LabelList,
} from "recharts";
import { loadYearReports, loadClients } from "./metricsApi";
import { calcTotal, sumScore } from "../../utils/metricsScore";
import { calcFinanzas, fmtUSD } from "../../utils/metricsFinance";
import { aggregateMetricsDashboard } from "../../utils/aggregateMetricsDashboard";
import { MONTHS } from "./constants";

const CURRENT_YEAR = new Date().getFullYear();
const YEARS = Array.from({ length: 4 }, (_, i) => CURRENT_YEAR - i);

export default function DashboardView({ companyId, lines }) {
  const navigate = useNavigate();
  const { can = () => true } = useAuth();
  const [year, setYear] = useState(CURRENT_YEAR);
  const [reports, setReports] = useState([]);
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    if (!companyId) return;
    setLoading(true);
    setError(null);
    const [reportsRes, clientsRes] = await Promise.all([
      loadYearReports(companyId, year),
      loadClients(companyId),
    ]);
    if (reportsRes.error) { setError(reportsRes.error.message); setLoading(false); return; }
    setReports(reportsRes.data ?? []);
    setClients(clientsRes.data ?? []);
    setLoading(false);
  }, [companyId, year]);

  useEffect(() => { load(); }, [load]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-6 h-6 border-2 border-[#FFB800] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }
  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 text-red-700 text-[15px] rounded-xl px-4 py-3">{error}</div>
    );
  }

  const agg = aggregateMetricsDashboard(lines, reports, year, calcTotal, sumScore, calcFinanzas);
  const {
    matrix, currentMonth, promAnual, promMesActual, lider,
    cobertura, ranking, rankingMonth, finTotalesPorLinea,
  } = agg;

  // Datos para el LineChart de scores
  const lineChartData = MONTHS.map((mes, i) => {
    const row = { mes: mes.slice(0, 3) };
    lines.forEach(line => { row[line.name] = matrix[line.id][i]; });
    return row;
  });

  // Datos para comparativa financiera
  const finChartData = lines.map(line => {
    const f = finTotalesPorLinea[line.id] ?? { ingresos: 0, egresos: 0, diferencia: 0 };
    return {
      name: line.name,
      Ingresos: f.ingresos,
      Egresos: f.egresos,
      Diferencia: f.diferencia,
    };
  });

  const scoreColor = (s) =>
    s == null ? "text-[#bbb]" :
    s >= 80   ? "text-green-600" :
    s >= 60   ? "text-[#b45309]" :
    "text-red-600";

  return (
    <div className="space-y-6">
      {/* Selector de año */}
      <div className="flex items-center justify-between">
        <p className="text-[15px] text-[#888]">
          Comparativa anual de las {lines.length} líneas operativas
        </p>
        <div className="flex items-center gap-2">
          <span className="text-[13px] font-mono font-bold uppercase tracking-[0.1em] text-[#888]">Año</span>
          <select
            className="input-base py-1 text-[15px]"
            value={year}
            onChange={e => setYear(Number(e.target.value))}
          >
            {YEARS.map(y => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiCard
          label="Promedio anual"
          value={promAnual > 0 ? promAnual.toFixed(1) : "—"}
          sub="/100 prom. todas las líneas"
          color="text-[#111]"
        />
        <KpiCard
          label={`Mes actual (${MONTHS[currentMonth - 1]})`}
          value={promMesActual != null ? promMesActual.toFixed(1) : "—"}
          sub="/100 prom. este mes"
          color={promMesActual != null ? scoreColor(promMesActual) : "text-[#bbb]"}
        />
        <KpiCard
          label="Línea líder"
          value={lider?.line.name ?? "—"}
          sub={lider ? `${lider.prom.toFixed(1)} prom. anual` : "Sin datos aún"}
          color="text-[#111]"
          onClick={lider ? () => navigate(`/reportes/linea/${lider.line.id}`) : undefined}
        />
        <KpiCard
          label="Cobertura"
          value={`${cobertura.toFixed(0)}%`}
          sub={`${reports.length} de ${lines.length * currentMonth} reportes posibles`}
          color={cobertura >= 80 ? "text-green-600" : cobertura >= 50 ? "text-[#b45309]" : "text-red-600"}
        />
      </div>

      {/* Gráfico de líneas — scores por mes */}
      <div className="bg-white rounded-2xl border border-[#e0ddd4] px-5 py-4">
        <p className="text-[13px] font-mono font-bold tracking-[0.14em] uppercase text-[#888] mb-4">
          Cumplimiento operativo por mes · {year}
        </p>
        {reports.length === 0 ? (
          <p className="text-[15px] text-[#aaa] text-center py-8">Sin datos para este año</p>
        ) : (
          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={lineChartData} margin={{ top: 4, right: 20, left: 0, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0ede3" />
              <XAxis dataKey="mes" tick={{ fontSize: 11, fontFamily: "DM Mono, monospace", fill: "#888" }} />
              <YAxis domain={[0, 100]} tick={{ fontSize: 10, fontFamily: "DM Mono, monospace", fill: "#888" }} />
              <Tooltip
                contentStyle={{ fontSize: 12, fontFamily: "DM Mono, monospace", borderRadius: 8, border: "1px solid #e0ddd4" }}
                formatter={(val) => val != null ? val.toFixed(1) : "—"}
              />
              <Legend wrapperStyle={{ fontSize: 12, fontFamily: "DM Mono, monospace" }} />
              {lines.map(line => (
                <Line
                  key={line.id}
                  type="monotone"
                  dataKey={line.name}
                  stroke={line.color}
                  strokeWidth={2}
                  dot={{ r: 3, fill: line.color }}
                  connectNulls={false}
                >
                  <LabelList
                    dataKey={line.name}
                    position="top"
                    style={{ fontSize: 9, fill: line.color, fontFamily: "DM Mono, monospace" }}
                    formatter={v => v != null ? v.toFixed(0) : ""}
                  />
                </Line>
              ))}
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Ranking del mes más reciente */}
      {ranking.length > 0 && (
        <div className="bg-white rounded-2xl border border-[#e0ddd4] px-5 py-4">
          <p className="text-[13px] font-mono font-bold tracking-[0.14em] uppercase text-[#888] mb-3">
            Ranking · {MONTHS[rankingMonth - 1]} {year}
          </p>
          <div className="space-y-2">
            {ranking.map(({ line, score }, idx) => (
              <button
                key={line.id}
                onClick={() => navigate(`/reportes/linea/${line.id}`)}
                className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-[#fafaf7] transition-colors text-left"
              >
                <span className="text-[13px] font-mono text-[#bbb] w-5 flex-shrink-0">{idx + 1}</span>
                <span
                  className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                  style={{ background: line.color }}
                />
                <span className="flex-1 text-[16px] font-semibold text-[#111]">{line.name}</span>
                <span className={`text-[20px] font-bold tabular-nums ${scoreColor(score)}`}>
                  {score.toFixed(1)}
                </span>
                <span className="text-[13px] font-mono text-[#bbb]">/100</span>
              </button>
            ))}
          </div>
          <SectionTotal label="líneas" count={ranking.length} />
        </div>
      )}

      {/* Comparativa financiera */}
      <div className="bg-white rounded-2xl border border-[#e0ddd4] px-5 py-4">
        <p className="text-[13px] font-mono font-bold tracking-[0.14em] uppercase text-[#888] mb-4">
          Comparativa financiera · {year}
        </p>
        {finChartData.every(d => d.Ingresos === 0 && d.Egresos === 0) ? (
          <p className="text-[15px] text-[#aaa] text-center py-8">Sin datos financieros para este año</p>
        ) : (
          <>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={finChartData} margin={{ top: 4, right: 20, left: 0, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0ede3" />
                <XAxis dataKey="name" tick={{ fontSize: 12, fontFamily: "DM Mono, monospace", fill: "#555" }} />
                <YAxis tick={{ fontSize: 10, fontFamily: "DM Mono, monospace", fill: "#888" }}
                  tickFormatter={v => v >= 1000 ? `$${(v/1000).toFixed(0)}k` : `$${v}`}
                />
                <Tooltip
                  contentStyle={{ fontSize: 12, fontFamily: "DM Mono, monospace", borderRadius: 8, border: "1px solid #e0ddd4" }}
                  formatter={(val) => fmtUSD(val)}
                />
                <Legend wrapperStyle={{ fontSize: 12, fontFamily: "DM Mono, monospace" }} />
                <Bar dataKey="Ingresos" fill="#10B981" radius={[4, 4, 0, 0]} />
                <Bar dataKey="Egresos" fill="#EF4444" radius={[4, 4, 0, 0]} />
                <Bar dataKey="Diferencia" fill="#FAB51A" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
            {/* Tabla resumen financiero */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mt-4">
              {lines.map(line => {
                const f = finTotalesPorLinea[line.id] ?? { ingresos: 0, egresos: 0, diferencia: 0 };
                const positive = f.diferencia >= 0;
                const cuentas = clients.filter(c => c.line_id === line.id).length;
                const empleados = line.member_user_ids?.length ?? 0;
                return (
                  <button
                    key={line.id}
                    onClick={() => navigate(`/reportes/linea/${line.id}?tab=finanzas`)}
                    className="rounded-xl border border-[#e0ddd4] p-3 text-center hover:bg-[#fafaf7] hover:border-[#d0ccc0] transition-colors w-full"
                    title={`Ver finanzas de ${line.name}`}
                  >
                    <div className="flex items-center justify-center gap-1.5 mb-0.5">
                      <span className="w-2 h-2 rounded-full" style={{ background: line.color }} />
                      <span className="text-[13px] font-semibold text-[#444]">{line.name}</span>
                    </div>
                    <div className="text-[11px] font-mono text-[#bbb] mb-2 flex items-center justify-center gap-2 flex-wrap">
                      <span
                        onClick={e => { e.stopPropagation(); navigate(`/reportes/linea/${line.id}?tab=operaciones`); }}
                        className="hover:text-[#888] hover:underline cursor-pointer"
                        title="Ver clientes de esta línea"
                      >
                        {cuentas} {cuentas !== 1 ? "cuentas" : "cuenta"}
                      </span>
                      <span className="text-[#e0ddd4]">·</span>
                      <span
                        onClick={e => { e.stopPropagation(); navigate(`/reportes/linea/${line.id}`); }}
                        className="hover:text-[#888] hover:underline cursor-pointer"
                        title="Ver equipo de esta línea"
                      >
                        {empleados} {empleados !== 1 ? "empleados" : "empleado"}
                      </span>
                    </div>
                    <div className="text-[12px] text-[#aaa] font-mono">Ingresos</div>
                    <div className="text-[14px] font-bold text-green-600">{fmtUSD(f.ingresos)}</div>
                    <div className="text-[12px] text-[#aaa] font-mono mt-1">Egresos</div>
                    <div className="text-[14px] font-bold text-red-500">{fmtUSD(f.egresos)}</div>
                    <div className="text-[12px] text-[#aaa] font-mono mt-1">Diferencia</div>
                    <div className={`text-[14px] font-bold ${positive ? "text-green-600" : "text-red-500"}`}>
                      {fmtUSD(f.diferencia)}
                    </div>
                  </button>
                );
              })}
            </div>
          </>
        )}
        <SectionTotal label="líneas" count={lines.length} />
      </div>
    </div>
  );
}

function KpiCard({ label, value, sub, color, onClick }) {
  const Wrapper = onClick ? "button" : "div";
  return (
    <Wrapper
      className={`bg-white rounded-2xl border border-[#e0ddd4] px-4 py-4 text-left w-full${onClick ? " hover:bg-[#fafaf7] hover:border-[#d0ccc0] transition-colors cursor-pointer" : ""}`}
      onClick={onClick}
      title={onClick ? `Ir a ${value}` : undefined}
    >
      <p className="text-[12px] font-mono font-bold uppercase tracking-[0.12em] text-[#aaa] mb-1">{label}</p>
      <p className={`text-[26px] font-bold leading-tight ${color}`}>{value}</p>
      <p className="text-[12px] text-[#bbb] mt-0.5">{sub}</p>
    </Wrapper>
  );
}
