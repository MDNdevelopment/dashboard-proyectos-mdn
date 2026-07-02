import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { isFinancePrivileged } from "../../lib/permissions";
import { calcFinanzas, fmtUSD } from "../../utils/metricsFinance";
import { MONTHS } from "../metricas/constants";
import { loadCompanyEmployees, loadClients, loadYearReports } from "../metricas/metricsApi";
import EmployeeFichaContent from "../metricas/EmployeeFichaContent";
import ClientFichaContent from "../metricas/ClientFichaContent";
import EntityGridList, { ViewToggle } from "../common/EntityGridList";

const CURRENT_YEAR = new Date().getFullYear();

/**
 * Ficha de solo lectura de una línea operativa (metric_lines), con drill-down
 * en un solo modal: click en un miembro o cliente reemplaza el contenido por
 * su ficha (EmployeeFichaContent / ClientFichaContent) con botón "← Volver".
 * Escape sube un nivel; en la raíz cierra. El botón X cierra desde cualquier nivel.
 * Miembros y clientes se muestran en vista tarjetas (default) o lista (ViewToggle).
 * Incluye resumen de finanzas del último período de la línea — visible solo para
 * nivel 4 / admin (isFinancePrivileged); sus KPIs navegan a la sección de
 * Finanzas del módulo Reportes si además can('reportes').
 * Props:
 *   line      — objeto de metric_lines (id, name, color, member_user_ids)
 *   companyId — uuid de la empresa
 *   onClose   — callback para cerrar
 */
export default function LineFichaModal({ line, companyId, onClose }) {
  const navigate = useNavigate();
  const { userProfile, can = () => true } = useAuth();
  const privileged = isFinancePrivileged(userProfile);

  const [members, setMembers] = useState(null);       // null = cargando
  const [clients, setClients] = useState(null);       // null = cargando
  const [finReports, setFinReports] = useState(null); // null = cargando, [] = sin datos
  const [drill, setDrill] = useState(null);           // null | { type: 'employee'|'client', entity }
  const [memberView, setMemberView] = useState("tarjetas"); // "lista" | "tarjetas"
  const [clientView, setClientView] = useState("tarjetas"); // "lista" | "tarjetas"

  // Carga on-mount: empleados con joins position/department + clientes de la línea.
  // Los reportes del año (finanzas) solo se piden si el usuario puede verlos.
  useEffect(() => {
    let cancelled = false;
    Promise.all([
      loadCompanyEmployees(companyId),
      loadClients(companyId, line.id),
      privileged ? loadYearReports(companyId, CURRENT_YEAR) : Promise.resolve({ data: [] }),
    ]).then(([empRes, cliRes, repRes]) => {
      if (cancelled) return;
      const memberIds = line.member_user_ids ?? [];
      setMembers((empRes.data ?? []).filter(u => memberIds.includes(u.user_id)));
      setClients(cliRes.data ?? []);
      setFinReports((repRes.data ?? []).filter(r => r.line_id === line.id));
    });
    return () => { cancelled = true; };
  }, [companyId, line.id, line.member_user_ids, privileged]);

  // Escape: en drill-down vuelve a la raíz; en la raíz cierra el modal
  useEffect(() => {
    const fn = e => {
      if (e.key !== "Escape") return;
      if (drill) setDrill(null);
      else onClose();
    };
    document.addEventListener("keydown", fn);
    return () => document.removeEventListener("keydown", fn);
  }, [drill, onClose]);

  const loading = members === null || clients === null;

  // Último período con reporte de la línea (mes más alto del año actual)
  const lastReport = (finReports ?? []).reduce(
    (best, r) => (!best || r.month > best.month ? r : best),
    null
  );

  function goFinanzas(section) {
    onClose();
    navigate(`/reportes/linea/${line.id}?tab=finanzas&section=${section}`);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/25 backdrop-blur-[3px]">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xl max-h-[90vh] overflow-y-auto relative">
        {/* Botón cerrar — cierre total desde cualquier nivel */}
        <button
          type="button"
          onClick={onClose}
          className="absolute top-4 right-4 z-10 w-7 h-7 flex items-center justify-center rounded-lg text-[#999] hover:text-[#111] hover:bg-[#f0ede3] transition-colors"
          aria-label="Cerrar"
        >
          <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12"/>
          </svg>
        </button>

        {drill ? (
          <>
            {/* Barra de retorno al nivel raíz */}
            <div className="px-4 pt-4">
              <button
                type="button"
                onClick={() => setDrill(null)}
                className="flex items-center gap-1.5 text-[13.5px] font-semibold text-[#888] hover:text-[#111] transition-colors"
              >
                <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8">
                  <path d="M13 8H3M7 4L3 8l4 4" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
                Volver a {line.name}
              </button>
            </div>

            {drill.type === "employee" ? (
              <EmployeeFichaContent employee={drill.entity} line={line} onClose={onClose} />
            ) : (
              <ClientFichaContent client={drill.entity} line={line} onClose={onClose} />
            )}
          </>
        ) : (
          <>
            {/* Header — mismo estilo del card de LinesView */}
            <div
              className="px-6 pt-5 pb-4 border-b border-[#f0ede3] pr-12"
              style={{ background: line.color + "14" }}
            >
              <div className="flex items-center gap-2">
                <span
                  className="w-3.5 h-3.5 rounded-full flex-shrink-0"
                  style={{ background: line.color }}
                />
                <h2 className="text-[19px] font-bold text-[#111]">{line.name}</h2>
              </div>
              {!loading && (
                <p className="text-[12.5px] font-mono text-[#999] mt-1">
                  {members.length} {members.length !== 1 ? "miembros" : "miembro"} · {clients.length} {clients.length !== 1 ? "clientes" : "cliente"}
                </p>
              )}
            </div>

            {loading ? (
              <div className="flex items-center justify-center py-16">
                <div className="w-6 h-6 border-2 border-[#FFB800] border-t-transparent rounded-full animate-spin" />
              </div>
            ) : (
              <div className="px-6 py-5 space-y-6">

                {/* Miembros */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-[11.5px] font-mono font-bold uppercase tracking-[0.12em] text-[#aaa]">
                      Miembros
                    </p>
                    {members.length > 0 && (
                      <ViewToggle view={memberView} onChange={setMemberView} />
                    )}
                  </div>
                  {members.length === 0 ? (
                    <p className="text-[13.5px] text-[#bbb]">Sin miembros asignados.</p>
                  ) : (
                    <EntityGridList
                      items={members.map(u => {
                        const name = `${u.first_name ?? ""} ${u.last_name ?? ""}`.trim();
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
                      view={memberView}
                      onItemClick={u => setDrill({ type: "employee", entity: u })}
                    />
                  )}
                </div>

                {/* Clientes */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-[11.5px] font-mono font-bold uppercase tracking-[0.12em] text-[#aaa]">
                      Clientes
                    </p>
                    {clients.length > 0 && (
                      <ViewToggle view={clientView} onChange={setClientView} />
                    )}
                  </div>
                  {clients.length === 0 ? (
                    <p className="text-[13.5px] text-[#bbb]">Sin clientes en esta línea.</p>
                  ) : (
                    <EntityGridList
                      items={clients.map(c => ({
                        id: c.id,
                        name: c.name,
                        secondary: null,
                        imageUrl: c.logo_url,
                        fallbackText: c.name?.[0] ?? "?",
                        fallbackBg: null,
                        title: `Ver ficha de ${c.name}`,
                        raw: c,
                      }))}
                      view={clientView}
                      onItemClick={c => setDrill({ type: "client", entity: c })}
                      gridClass="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-2"
                    />
                  )}
                </div>

                {/* Finanzas del último período — solo nivel 4 / admin */}
                {privileged && (
                  <div>
                    <p className="text-[11.5px] font-mono font-bold uppercase tracking-[0.12em] text-[#aaa] mb-2">
                      Finanzas{lastReport ? ` · ${MONTHS[lastReport.month - 1]} ${CURRENT_YEAR}` : ""}
                    </p>
                    {!lastReport ? (
                      <p className="text-[13.5px] text-[#bbb]">
                        Sin datos financieros para {CURRENT_YEAR}.
                      </p>
                    ) : (() => {
                      const f = calcFinanzas(lastReport.data ?? {});
                      const canGo = can("reportes");
                      return (
                        <div className="grid grid-cols-3 gap-2">
                          <FinKpi
                            label="Ingresos brutos"
                            value={fmtUSD(f.totIngresos)}
                            color="text-green-600"
                            onClick={canGo ? () => goFinanzas("ingresos") : undefined}
                            title={canGo ? "Ir a ingresos" : undefined}
                          />
                          <FinKpi
                            label="Total egresos"
                            value={fmtUSD(f.totEgresos)}
                            color="text-red-500"
                            onClick={canGo ? () => goFinanzas("gastos") : undefined}
                            title={canGo ? "Ir a gastos" : undefined}
                          />
                          <FinKpi
                            label="Diferencia"
                            value={fmtUSD(f.diferencia)}
                            color={f.diferencia >= 0 ? "text-green-600" : "text-red-500"}
                          />
                        </div>
                      );
                    })()}
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

/** Mini-KPI financiero: botón navegable si recibe onClick, div estático si no. */
function FinKpi({ label, value, color, onClick, title }) {
  const inner = (
    <>
      <p className="text-[10.5px] font-mono font-bold uppercase tracking-[0.1em] text-[#aaa] mb-0.5">{label}</p>
      <p className={`text-[15px] font-bold ${color}`}>{value}</p>
    </>
  );
  const base = "p-3 rounded-xl bg-[#faf9f5] border border-[#ece9df] text-left";
  if (!onClick) {
    return <div className={base}>{inner}</div>;
  }
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className={`${base} hover:bg-[#f5f3eb] hover:border-[#d8d4c6] transition-colors`}
    >
      {inner}
    </button>
  );
}
