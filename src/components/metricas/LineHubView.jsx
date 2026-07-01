import { useState, useEffect, useCallback } from "react";
import {
  RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
  LineChart, Line, BarChart, Bar, XAxis, YAxis, Tooltip,
  ResponsiveContainer, CartesianGrid,
} from "recharts";
import { loadYearReports } from "./metricsApi";
import { calcTotal, sumScore } from "../../utils/metricsScore";
import { MONTHS, INDICATORS } from "./constants";
import ScoreDial from "./ScoreDial";

const CURRENT_YEAR = new Date().getFullYear();
const CURRENT_MONTH = new Date().getMonth() + 1;

export default function LineHubView({ line, companyId, year = CURRENT_YEAR }) {
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!companyId || !line?.id) return;
    setLoading(true);
    const { data } = await loadYearReports(companyId, year);
    setReports((data ?? []).filter(r => r.line_id === line.id));
    setLoading(false);
  }, [companyId, line?.id, year]);

  useEffect(() => { load(); }, [load]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="w-6 h-6 border-2 border-[#FFB800] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (reports.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-[#e0ddd4] p-10 text-center">
        <p className="text-[17px] font-semibold text-[#888] mb-1">Sin datos para {year}</p>
        <p className="text-[14px] text-[#bbb]">
          Agregá datos en la pestaña Operaciones o cambiá el año.
        </p>
      </div>
    );
  }

  // Calcular scores por mes
  const monthScores = Array.from({ length: 12 }, (_, i) => {
    const r = reports.find(r => r.month === i + 1);
    if (!r) return null;
    // Buscar mes anterior (solo si está en el mismo año)
    const prev = i > 0 ? reports.find(r2 => r2.month === i) : null;
    return { month: i + 1, ...calcTotal(r.data, prev?.data ?? null), r };
  });

  // Mes más reciente con datos
  const lastMonthData = [...monthScores].reverse().find(m => m != null);
  const lastScore = lastMonthData ? sumScore(lastMonthData) : null;
  const lastMonth = lastMonthData?.month ?? null;

  // Promedio anual de esta línea
  const withData = monthScores.filter(Boolean);
  const annualAvg = withData.length > 0
    ? withData.reduce((a, m) => a + sumScore(m), 0) / withData.length
    : 0;

  // Radar data (último mes disponible)
  const radarData = INDICATORS.map((ind, i) => ({
    indicator: ind.short,
    value: lastMonthData ? Number((lastMonthData[ind.key] / ind.peso * 100).toFixed(1)) : 0,
    fullMark: 100,
  }));

  // LineChart data
  const lineChartData = monthScores.map((m, i) => ({
    mes: MONTHS[i].slice(0, 3),
    score: m ? Number(sumScore(m).toFixed(1)) : null,
  }));

  // BarChart apilado de contribuciones por indicador
  const barData = monthScores
    .filter(Boolean)
    .map(m => {
      const row = { mes: MONTHS[m.month - 1].slice(0, 3) };
      INDICATORS.forEach(ind => { row[ind.short] = Number(m[ind.key].toFixed(2)); });
      return row;
    });

  const INDICATOR_COLORS = ["#FAB51A","#3B82F6","#10B981","#F97316","#8B5CF6","#06B6D4","#EC4899"];

  return (
    <div className="space-y-5">
      {/* KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="bg-white rounded-2xl border border-[#e0ddd4] px-5 py-4 flex flex-col items-center justify-center">
          <ScoreDial score={lastScore ?? 0} color={line.color} size={140} />
          <p className="text-[13px] font-mono font-bold uppercase tracking-[0.1em] text-[#888] mt-2">
            {lastMonth ? `${MONTHS[lastMonth - 1]} ${year}` : `${year}`}
          </p>
        </div>
        <div className="bg-white rounded-2xl border border-[#e0ddd4] px-5 py-4">
          <p className="text-[12px] font-mono font-bold uppercase tracking-[0.12em] text-[#aaa] mb-1">Promedio anual</p>
          <p className="text-[32px] font-bold text-[#111]">{annualAvg.toFixed(1)}</p>
          <p className="text-[12px] text-[#bbb]">/100 · {withData.length} meses cargados</p>
        </div>
        <div className="bg-white rounded-2xl border border-[#e0ddd4] px-5 py-4">
          <p className="text-[12px] font-mono font-bold uppercase tracking-[0.12em] text-[#aaa] mb-2">
            Indicadores · {lastMonth ? MONTHS[lastMonth - 1] : "—"}
          </p>
          <div className="space-y-1">
            {INDICATORS.map((ind, i) => {
              const pts = lastMonthData ? Number(lastMonthData[ind.key].toFixed(1)) : 0;
              const pct = (pts / ind.peso) * 100;
              return (
                <div key={ind.key} className="flex items-center gap-2">
                  <span className="text-[12px] font-mono text-[#888] w-[90px] flex-shrink-0">{ind.short}</span>
                  <div className="flex-1 min-w-0 h-1.5 bg-[#f0ede3] rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all"
                      style={{ width: `${Math.min(100, pct)}%`, background: INDICATOR_COLORS[i] }}
                    />
                  </div>
                  <span className="text-[11px] font-mono text-[#aaa] w-8 text-right">{pts}</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* RadarChart */}
      {lastMonthData && (
        <div className="bg-white rounded-2xl border border-[#e0ddd4] px-5 py-4">
          <p className="text-[13px] font-mono font-bold tracking-[0.14em] uppercase text-[#888] mb-2">
            Radar de indicadores · {lastMonth ? MONTHS[lastMonth - 1] : "—"} {year}
          </p>
          <ResponsiveContainer width="100%" height={260}>
            <RadarChart data={radarData} margin={{ top: 10, right: 30, bottom: 10, left: 30 }}>
              <PolarGrid stroke="#f0ede3" />
              <PolarAngleAxis dataKey="indicator" tick={{ fontSize: 11, fontFamily: "DM Mono, monospace", fill: "#555" }} />
              <PolarRadiusAxis domain={[0, 100]} tick={{ fontSize: 9, fill: "#bbb" }} />
              <Radar name={line.name} dataKey="value" stroke={line.color} fill={line.color} fillOpacity={0.18} />
              <Tooltip
                contentStyle={{ fontSize: 12, fontFamily: "DM Mono, monospace", borderRadius: 8, border: "1px solid #e0ddd4" }}
                formatter={(val) => [`${val}%`, "Cumplimiento"]}
              />
            </RadarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* LineChart histórico */}
      <div className="bg-white rounded-2xl border border-[#e0ddd4] px-5 py-4">
        <p className="text-[13px] font-mono font-bold tracking-[0.14em] uppercase text-[#888] mb-2">
          Histórico de score · {year}
        </p>
        <ResponsiveContainer width="100%" height={200}>
          <LineChart data={lineChartData} margin={{ top: 4, right: 16, left: 0, bottom: 4 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f0ede3" />
            <XAxis dataKey="mes" tick={{ fontSize: 11, fontFamily: "DM Mono, monospace", fill: "#888" }} />
            <YAxis domain={[0, 100]} tick={{ fontSize: 10, fontFamily: "DM Mono, monospace", fill: "#888" }} />
            <Tooltip
              contentStyle={{ fontSize: 12, fontFamily: "DM Mono, monospace", borderRadius: 8, border: "1px solid #e0ddd4" }}
              formatter={(val) => val != null ? [`${val}/100`, "Score"] : ["—", "Score"]}
            />
            <Line
              type="monotone"
              dataKey="score"
              stroke={line.color}
              strokeWidth={2.5}
              dot={{ r: 4, fill: line.color }}
              connectNulls={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* BarChart apilado de contribuciones */}
      {barData.length > 0 && (
        <div className="bg-white rounded-2xl border border-[#e0ddd4] px-5 py-4">
          <p className="text-[13px] font-mono font-bold tracking-[0.14em] uppercase text-[#888] mb-2">
            Contribución por indicador · {year}
          </p>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={barData} margin={{ top: 4, right: 16, left: 0, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0ede3" />
              <XAxis dataKey="mes" tick={{ fontSize: 11, fontFamily: "DM Mono, monospace", fill: "#888" }} />
              <YAxis domain={[0, 100]} tick={{ fontSize: 10, fontFamily: "DM Mono, monospace", fill: "#888" }} />
              <Tooltip
                contentStyle={{ fontSize: 12, fontFamily: "DM Mono, monospace", borderRadius: 8, border: "1px solid #e0ddd4" }}
              />
              {INDICATORS.map((ind, i) => (
                <Bar key={ind.key} dataKey={ind.short} stackId="a" fill={INDICATOR_COLORS[i]} />
              ))}
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
