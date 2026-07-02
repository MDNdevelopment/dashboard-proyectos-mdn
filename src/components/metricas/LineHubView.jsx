import { useState, useEffect, useCallback } from "react";
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, Tooltip,
  ResponsiveContainer, CartesianGrid,
} from "recharts";
import { loadYearReports, loadCompanyEmployees, loadClients } from "./metricsApi";
import { calcTotal, sumScore } from "../../utils/metricsScore";
import { MONTHS, INDICATORS } from "./constants";
import ScoreDial from "./ScoreDial";
import { useAuth } from "../../context/AuthContext";
import EmployeeInfoModal from "./EmployeeInfoModal";
import ClientFichaModal from "./ClientFichaModal";
import { fmtUSD } from "../../utils/metricsFinance";
import EntityGridList, { ViewToggle } from "../common/EntityGridList";

const CURRENT_YEAR = new Date().getFullYear();
const CURRENT_MONTH = new Date().getMonth() + 1;

export default function LineHubView({ line, companyId, year = CURRENT_YEAR }) {
  const { can = () => true } = useAuth();
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [teamMembers, setTeamMembers] = useState([]);
  const [lineClients, setLineClients] = useState([]);
  const [empModal, setEmpModal] = useState(null); // null=cerrado, objeto=empleado
  const [cliModal, setCliModal] = useState(null); // null=cerrado, objeto=cliente
  const [empView, setEmpView] = useState("tarjetas"); // "lista" | "tarjetas" — tarjetas por defecto
  const [cliView, setCliView] = useState("tarjetas"); // "lista" | "tarjetas" — tarjetas por defecto

  const load = useCallback(async () => {
    if (!companyId || !line?.id) return;
    setLoading(true);
    const [{ data: reportsData }, { data: usersData }, { data: clientsData }] = await Promise.all([
      loadYearReports(companyId, year),
      loadCompanyEmployees(companyId),
      loadClients(companyId, line.id),
    ]);
    setReports((reportsData ?? []).filter(r => r.line_id === line.id));
    const memberIds = line.member_user_ids ?? [];
    setTeamMembers((usersData ?? []).filter(u => memberIds.includes(u.user_id)));
    setLineClients(clientsData ?? []);
    setLoading(false);
  }, [companyId, line?.id, line?.member_user_ids, year]);

  useEffect(() => { load(); }, [load]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="w-6 h-6 border-2 border-[#FFB800] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  // Calcular scores por mes (tolera reports vacío → todos null)
  const monthScores = Array.from({ length: 12 }, (_, i) => {
    const r = reports.find(r => r.month === i + 1);
    if (!r) return null;
    const prev = i > 0 ? reports.find(r2 => r2.month === i) : null;
    return { month: i + 1, ...calcTotal(r.data, prev?.data ?? null), r };
  });

  // Mes más reciente con datos
  const lastMonthData = [...monthScores].reverse().find(m => m != null);
  const lastScore = lastMonthData ? sumScore(lastMonthData) : null;
  const lastMonth = lastMonthData?.month ?? null;

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

  const INDICATOR_COLORS = ["#FAB51A","#3B82F6","#10B981","#F97316","#8B5CF6","#06B6D4"];

  return (
    <div className="space-y-5">

      {/* Banner de aviso cuando no hay reportes para el año */}
      {reports.length === 0 && (
        <div className="bg-[#fffbea] border border-[#f5e88a] rounded-xl px-5 py-3 flex items-center gap-2">
          <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="#b45309" strokeWidth="1.8">
            <path d="M8 2l6 12H2L8 2Z" strokeLinejoin="round"/>
            <path d="M8 7v3M8 11.5v.5" strokeLinecap="round"/>
          </svg>
          <p className="text-[13px] text-[#b45309]">
            Sin reportes para {year}. Cargá datos en Operaciones para ver las métricas.
          </p>
        </div>
      )}

      {/* KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="bg-white rounded-2xl border border-[#e0ddd4] px-5 py-4 flex flex-col items-center justify-center">
          <ScoreDial score={lastScore ?? 0} color={line.color} size={140} />
          <p className="text-[13px] font-mono font-bold uppercase tracking-[0.1em] text-[#888] mt-2">
            {lastMonth ? `${MONTHS[lastMonth - 1]} ${year}` : `${year}`}
          </p>
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

      {/* Sección Empleados */}
      {teamMembers.length > 0 && (
        <div className="bg-white rounded-2xl border border-[#e0ddd4] px-5 py-4">
          <div className="flex items-center justify-between mb-4">
            <p className="text-[13px] font-mono font-bold tracking-[0.14em] uppercase text-[#888]">
              Empleados · {teamMembers.length}
            </p>
            <ViewToggle view={empView} onChange={setEmpView} />
          </div>
          <EntityGridList
            items={teamMembers.map(u => {
              const name = `${u.first_name} ${u.last_name}`;
              return {
                id: u.user_id,
                name,
                secondary: u.position?.position_name,
                imageUrl: u.avatar_url,
                fallbackText: `${u.first_name?.[0] ?? ""}${u.last_name?.[0] ?? ""}`.toUpperCase(),
                fallbackBg: line.color,
                title: `Ver información de ${name}`,
                raw: u,
              };
            })}
            view={empView}
            onItemClick={setEmpModal}
          />
        </div>
      )}

      {/* Sección Marcas */}
      {lineClients.length > 0 && (
        <div className="bg-white rounded-2xl border border-[#e0ddd4] px-5 py-4">
          <div className="flex items-center justify-between mb-4">
            <p className="text-[13px] font-mono font-bold tracking-[0.14em] uppercase text-[#888]">
              Marcas · {lineClients.length}
            </p>
            <ViewToggle view={cliView} onChange={setCliView} />
          </div>
          <EntityGridList
            items={lineClients.map(client => ({
              id: client.id,
              name: client.name,
              secondary: `${client.monthly_fee != null ? fmtUSD(client.monthly_fee) : "—"}${client.payment_day ? ` · día ${client.payment_day}` : ""}`,
              imageUrl: client.logo_url,
              fallbackText: client.name?.[0] ?? "?",
              fallbackBg: null,
              title: `Ver ficha de ${client.name}`,
              raw: client,
            }))}
            view={cliView}
            onItemClick={setCliModal}
            gridClass="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-2"
          />
        </div>
      )}

      {/* Modal de empleado */}
      {empModal && (
        <EmployeeInfoModal
          employee={empModal}
          line={line}
          onClose={() => setEmpModal(null)}
        />
      )}

      {/* Modal de ficha técnica de cliente */}
      {cliModal && (
        <ClientFichaModal
          client={cliModal}
          line={line}
          onClose={() => setCliModal(null)}
        />
      )}
    </div>
  );
}
