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
    if (!r || r.data?.incompleto) return null;
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
            <div className="flex bg-[#f5f3eb] border border-[#e0ddd4] rounded-lg p-0.5">
              <button
                type="button"
                onClick={() => setEmpView("lista")}
                className={`px-2.5 py-1 rounded-md text-[12px] font-semibold transition-all ${
                  empView === "lista" ? "bg-white text-[#111] shadow-sm" : "text-[#888] hover:text-[#555]"
                }`}
                title="Vista lista"
              >
                Lista
              </button>
              <button
                type="button"
                onClick={() => setEmpView("tarjetas")}
                className={`px-2.5 py-1 rounded-md text-[12px] font-semibold transition-all ${
                  empView === "tarjetas" ? "bg-white text-[#111] shadow-sm" : "text-[#888] hover:text-[#555]"
                }`}
                title="Vista tarjetas"
              >
                Tarjetas
              </button>
            </div>
          </div>
          {empView === "tarjetas" ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
              {teamMembers.map(u => {
                const name = `${u.first_name} ${u.last_name}`;
                const initials = `${u.first_name?.[0] ?? ""}${u.last_name?.[0] ?? ""}`.toUpperCase();
                return (
                  <button
                    key={u.user_id}
                    type="button"
                    onClick={() => setEmpModal(u)}
                    className="flex flex-col items-center gap-1.5 px-3 py-2.5 rounded-xl border border-[#e0ddd4] bg-[#faf9f5] hover:bg-[#f0ede3] hover:border-[#d0ccc0] transition-colors text-center"
                    title={`Ver información de ${name}`}
                  >
                    {u.avatar_url ? (
                      <img
                        src={u.avatar_url}
                        alt={name}
                        className="w-10 h-10 rounded-full object-cover flex-shrink-0 border border-[#e0ddd4]"
                      />
                    ) : (
                      <div
                        className="w-10 h-10 rounded-full flex items-center justify-center text-[13px] font-bold text-white flex-shrink-0"
                        style={{ background: line.color }}
                      >
                        {initials}
                      </div>
                    )}
                    <div className="w-full min-w-0">
                      <p className="text-[13px] font-medium text-[#333] truncate">{name}</p>
                      {u.position?.position_name && (
                        <p className="text-[11px] text-[#aaa] truncate">{u.position.position_name}</p>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="space-y-2">
              {teamMembers.map(u => {
                const name = `${u.first_name} ${u.last_name}`;
                const initials = `${u.first_name?.[0] ?? ""}${u.last_name?.[0] ?? ""}`.toUpperCase();
                return (
                  <button
                    key={u.user_id}
                    type="button"
                    onClick={() => setEmpModal(u)}
                    className="w-full flex items-center gap-2 px-3 py-2 rounded-xl border border-[#e0ddd4] hover:bg-[#fafaf7] hover:border-[#d0ccc0] transition-colors text-left"
                    title={`Ver información de ${name}`}
                  >
                    {u.avatar_url ? (
                      <img
                        src={u.avatar_url}
                        alt={name}
                        className="w-8 h-8 rounded-full object-cover flex-shrink-0 border border-[#e0ddd4]"
                      />
                    ) : (
                      <div
                        className="w-8 h-8 rounded-full flex items-center justify-center text-[12px] font-bold text-white flex-shrink-0"
                        style={{ background: line.color }}
                      >
                        {initials}
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-[14px] font-medium text-[#333] truncate">{name}</p>
                      {u.position?.position_name && (
                        <p className="text-[11.5px] text-[#aaa] truncate">{u.position.position_name}</p>
                      )}
                    </div>
                    <svg
                      width="10" height="10" viewBox="0 0 10 10" fill="none"
                      stroke="currentColor" strokeWidth="1.8" className="text-[#ccc] flex-shrink-0"
                    >
                      <path d="M2 5h6M5 2l3 3-3 3" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Sección Marcas */}
      {lineClients.length > 0 && (
        <div className="bg-white rounded-2xl border border-[#e0ddd4] px-5 py-4">
          <div className="flex items-center justify-between mb-4">
            <p className="text-[13px] font-mono font-bold tracking-[0.14em] uppercase text-[#888]">
              Marcas · {lineClients.length}
            </p>
            <div className="flex bg-[#f5f3eb] border border-[#e0ddd4] rounded-lg p-0.5">
              <button
                type="button"
                onClick={() => setCliView("lista")}
                className={`px-2.5 py-1 rounded-md text-[12px] font-semibold transition-all ${
                  cliView === "lista" ? "bg-white text-[#111] shadow-sm" : "text-[#888] hover:text-[#555]"
                }`}
                title="Vista lista"
              >
                Lista
              </button>
              <button
                type="button"
                onClick={() => setCliView("tarjetas")}
                className={`px-2.5 py-1 rounded-md text-[12px] font-semibold transition-all ${
                  cliView === "tarjetas" ? "bg-white text-[#111] shadow-sm" : "text-[#888] hover:text-[#555]"
                }`}
                title="Vista tarjetas"
              >
                Tarjetas
              </button>
            </div>
          </div>
          {cliView === "tarjetas" ? (
            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-2">
              {lineClients.map(client => (
                <button
                  key={client.id}
                  type="button"
                  onClick={() => setCliModal(client)}
                  className="flex flex-col items-center gap-1.5 px-3 py-2.5 rounded-xl border border-[#e0ddd4] bg-[#faf9f5] hover:bg-[#f0ede3] hover:border-[#d0ccc0] transition-colors text-center"
                  title={`Ver ficha de ${client.name}`}
                >
                  {client.logo_url ? (
                    <img
                      src={client.logo_url}
                      alt={client.name}
                      className="w-10 h-10 rounded-full object-cover flex-shrink-0 border border-[#e0ddd4]"
                    />
                  ) : (
                    <span className="w-10 h-10 rounded-full bg-[#f0ede3] flex items-center justify-center flex-shrink-0 text-[13px] font-bold text-[#aaa] uppercase">
                      {client.name?.[0] ?? "?"}
                    </span>
                  )}
                  <div className="w-full min-w-0">
                    <p className="text-[13px] font-medium text-[#333] truncate">{client.name}</p>
                    <p className="text-[11px] text-[#aaa] truncate">
                      {client.monthly_fee != null ? fmtUSD(client.monthly_fee) : "—"}
                      {client.payment_day ? ` · día ${client.payment_day}` : ""}
                    </p>
                  </div>
                </button>
              ))}
            </div>
          ) : (
            <div className="space-y-2">
              {lineClients.map(client => (
                <button
                  key={client.id}
                  type="button"
                  onClick={() => setCliModal(client)}
                  className="w-full flex items-center gap-2 px-3 py-2 rounded-xl border border-[#e0ddd4] hover:bg-[#fafaf7] hover:border-[#d0ccc0] transition-colors text-left"
                  title={`Ver ficha de ${client.name}`}
                >
                  {client.logo_url ? (
                    <img
                      src={client.logo_url}
                      alt={client.name}
                      className="w-7 h-7 rounded-full object-cover flex-shrink-0 border border-[#e0ddd4]"
                    />
                  ) : (
                    <span className="w-7 h-7 rounded-full bg-[#f0ede3] flex items-center justify-center flex-shrink-0 text-[11px] font-bold text-[#aaa] uppercase">
                      {client.name?.[0] ?? "?"}
                    </span>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-[14px] font-medium text-[#333] truncate">{client.name}</p>
                    <p className="text-[11.5px] text-[#aaa]">
                      {client.monthly_fee != null ? fmtUSD(client.monthly_fee) : "—"}
                      {client.payment_day ? ` · día ${client.payment_day}` : ""}
                    </p>
                  </div>
                  <svg
                    width="10" height="10" viewBox="0 0 10 10" fill="none"
                    stroke="currentColor" strokeWidth="1.8" className="text-[#ccc] flex-shrink-0"
                  >
                    <path d="M2 5h6M5 2l3 3-3 3" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </button>
              ))}
            </div>
          )}
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
