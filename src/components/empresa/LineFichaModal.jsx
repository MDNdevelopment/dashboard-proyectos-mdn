import { useEffect, useState } from "react";
import { loadCompanyEmployees, loadClients } from "../metricas/metricsApi";
import EmployeeFichaContent from "../metricas/EmployeeFichaContent";
import ClientFichaContent from "../metricas/ClientFichaContent";

/**
 * Ficha de solo lectura de una línea operativa (metric_lines), con drill-down
 * en un solo modal: click en un miembro o cliente reemplaza el contenido por
 * su ficha (EmployeeFichaContent / ClientFichaContent) con botón "← Volver".
 * Escape sube un nivel; en la raíz cierra. El botón X cierra desde cualquier nivel.
 * Props:
 *   line      — objeto de metric_lines (id, name, color, member_user_ids)
 *   companyId — uuid de la empresa
 *   onClose   — callback para cerrar
 */
export default function LineFichaModal({ line, companyId, onClose }) {
  const [members, setMembers] = useState(null); // null = cargando
  const [clients, setClients] = useState(null); // null = cargando
  const [drill, setDrill] = useState(null);     // null | { type: 'employee'|'client', entity }

  // Carga on-mount: empleados con joins position/department + clientes de la línea
  useEffect(() => {
    let cancelled = false;
    Promise.all([
      loadCompanyEmployees(companyId),
      loadClients(companyId, line.id),
    ]).then(([empRes, cliRes]) => {
      if (cancelled) return;
      const memberIds = line.member_user_ids ?? [];
      setMembers((empRes.data ?? []).filter(u => memberIds.includes(u.user_id)));
      setClients(cliRes.data ?? []);
    });
    return () => { cancelled = true; };
  }, [companyId, line.id, line.member_user_ids]);

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
                  <p className="text-[11.5px] font-mono font-bold uppercase tracking-[0.12em] text-[#aaa] mb-2">
                    Miembros
                  </p>
                  {members.length === 0 ? (
                    <p className="text-[13.5px] text-[#bbb]">Sin miembros asignados.</p>
                  ) : (
                    <div className="space-y-1.5">
                      {members.map(u => {
                        const name = `${u.first_name ?? ""} ${u.last_name ?? ""}`.trim();
                        return (
                          <button
                            key={u.user_id}
                            type="button"
                            onClick={() => setDrill({ type: "employee", entity: u })}
                            title={`Ver información de ${name}`}
                            className="w-full flex items-center gap-3 p-2.5 rounded-xl bg-[#faf9f5] border border-[#ece9df] hover:border-[#d8d4c6] hover:bg-[#f5f3eb] transition-colors text-left"
                          >
                            {u.avatar_url ? (
                              <img
                                src={u.avatar_url}
                                alt=""
                                className="w-8 h-8 rounded-full object-cover flex-shrink-0"
                              />
                            ) : (
                              <div
                                className="w-8 h-8 rounded-full flex-shrink-0 flex items-center justify-center text-[12px] font-bold text-[#111]"
                                style={{ background: line.color + "44" }}
                              >
                                {(u.first_name?.[0] ?? "") + (u.last_name?.[0] ?? "")}
                              </div>
                            )}
                            <div className="flex-1 min-w-0">
                              <p className="text-[14px] font-semibold text-[#222] truncate">{name}</p>
                              {u.position?.position_name && (
                                <p className="text-[12px] text-[#999] truncate">{u.position.position_name}</p>
                              )}
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Clientes */}
                <div>
                  <p className="text-[11.5px] font-mono font-bold uppercase tracking-[0.12em] text-[#aaa] mb-2">
                    Clientes
                  </p>
                  {clients.length === 0 ? (
                    <p className="text-[13.5px] text-[#bbb]">Sin clientes en esta línea.</p>
                  ) : (
                    <div className="space-y-1.5">
                      {clients.map(c => (
                        <button
                          key={c.id}
                          type="button"
                          onClick={() => setDrill({ type: "client", entity: c })}
                          title={`Ver ficha de ${c.name}`}
                          className="w-full flex items-center gap-3 p-2.5 rounded-xl bg-[#faf9f5] border border-[#ece9df] hover:border-[#d8d4c6] hover:bg-[#f5f3eb] transition-colors text-left"
                        >
                          {c.logo_url ? (
                            <img
                              src={c.logo_url}
                              alt=""
                              className="w-8 h-8 rounded-full object-cover flex-shrink-0 border border-[#e0ddd4]"
                            />
                          ) : (
                            <span className="w-8 h-8 rounded-full bg-[#f0ede3] flex items-center justify-center flex-shrink-0 text-[13px] font-bold text-[#aaa] uppercase">
                              {c.name?.[0] ?? "?"}
                            </span>
                          )}
                          <p className="flex-1 min-w-0 text-[14px] font-semibold text-[#222] truncate">{c.name}</p>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
