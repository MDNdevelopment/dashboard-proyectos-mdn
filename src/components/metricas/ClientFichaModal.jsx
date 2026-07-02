import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { isFinancePrivileged } from "../../lib/permissions";
import { fmtUSD } from "../../utils/metricsFinance";
import { MONTHS } from "./constants";

/**
 * Modal de solo lectura con la ficha técnica de un cliente (metric_clients).
 * Props:
 *   client  — objeto completo de metric_clients (todos los campos)
 *   line    — objeto de metric_lines (id, name, color) — la línea del cliente
 *   onClose — callback para cerrar
 */
export default function ClientFichaModal({ client, line, onClose }) {
  const navigate = useNavigate();
  const { can = () => true, userProfile } = useAuth();
  const privileged = isFinancePrivileged(userProfile);

  // Cerrar con Escape
  useEffect(() => {
    const fn = e => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", fn);
    return () => document.removeEventListener("keydown", fn);
  }, [onClose]);

  const contacts = client.contacts ?? [];
  const socialLinks = client.social_links ?? [];

  function fmtDate(dateStr) {
    if (!dateStr) return "—";
    const [y, m, d] = dateStr.split("-");
    return `${d}/${m}/${y}`;
  }

  function fmtBirthday(day, month) {
    if (!day && !month) return null;
    const monthName = month ? MONTHS[Number(month) - 1] : null;
    if (day && monthName) return `${day} de ${monthName}`;
    if (day) return `día ${day}`;
    return monthName ?? null;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/25 backdrop-blur-[3px]">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center gap-3 px-6 pt-5 pb-4 border-b border-[#ece9df]">
          {/* Logo o inicial */}
          {client.logo_url ? (
            <img
              src={client.logo_url}
              alt={client.name}
              className="w-10 h-10 rounded-full object-cover flex-shrink-0 border border-[#e0ddd4]"
            />
          ) : (
            <span className="w-10 h-10 rounded-full bg-[#f0ede3] flex items-center justify-center flex-shrink-0 text-[15px] font-bold text-[#aaa] uppercase">
              {client.name?.[0] ?? "?"}
            </span>
          )}
          <div className="flex-1 min-w-0">
            <h2 className="text-[18px] font-bold text-[#111] truncate">{client.name}</h2>
            {line && (
              <span
                className="inline-block mt-0.5 px-2 py-0.5 rounded-full text-[11.5px] font-semibold"
                style={{ background: line.color + "22", color: line.color }}
              >
                {line.name}
              </span>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-7 h-7 flex items-center justify-center rounded-lg text-[#999] hover:text-[#111] hover:bg-[#f0ede3] transition-colors flex-shrink-0"
            aria-label="Cerrar"
          >
            <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12"/>
            </svg>
          </button>
        </div>

        {/* Cuerpo */}
        <div className="px-6 py-5 space-y-5">

          {/* Datos financieros — solo nivel 4 / admin */}
          {privileged && (
            <div className="grid grid-cols-2 gap-3">
              <InfoItem label="Mensualidad">
                {client.monthly_fee != null ? (
                  <span className="text-[16px] font-bold text-[#111]">{fmtUSD(client.monthly_fee)}</span>
                ) : "—"}
              </InfoItem>
              <InfoItem label="Día de pago">
                {client.payment_day ? (
                  <span className="text-[16px] font-bold text-[#111]">día {client.payment_day}</span>
                ) : "—"}
              </InfoItem>
            </div>
          )}

          {/* Fechas */}
          <div className="grid grid-cols-2 gap-3">
            <InfoItem label="Cliente MDN desde">{fmtDate(client.mdn_since)}</InfoItem>
            <InfoItem label="Aniversario empresa">{fmtDate(client.anniversary_date)}</InfoItem>
          </div>

          {/* Web */}
          {client.website && (
            <InfoItem label="Sitio web">
              <a
                href={client.website}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 text-[#555] hover:text-[#111] hover:underline transition-colors text-[14px]"
              >
                <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.7">
                  <circle cx="8" cy="8" r="6.5"/>
                  <path d="M8 1.5c-2 2-2 9 0 13M8 1.5c2 2 2 9 0 13M1.5 8h13" strokeLinecap="round"/>
                </svg>
                {client.website.replace(/^https?:\/\//, "")}
              </a>
            </InfoItem>
          )}

          {/* Redes sociales */}
          {socialLinks.length > 0 && (
            <InfoItem label="Redes sociales">
              <div className="flex flex-wrap gap-2 mt-1">
                {socialLinks.map((s, i) => (
                  <a
                    key={i}
                    href={s.link}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-[#f0ede3] text-[#555] text-[12.5px] font-medium hover:bg-[#e5e0d4] hover:text-[#111] transition-colors"
                  >
                    {s.red}
                  </a>
                ))}
              </div>
            </InfoItem>
          )}

          {/* Contactos */}
          {contacts.length > 0 && (
            <div>
              <p className="text-[11.5px] font-mono font-bold uppercase tracking-[0.12em] text-[#aaa] mb-2">
                Contactos
              </p>
              <div className="space-y-2">
                {contacts.map((c, i) => {
                  const bday = fmtBirthday(c.birth_day, c.birth_month);
                  return (
                    <div key={i} className="flex items-start gap-3 p-3 rounded-xl bg-[#faf9f5] border border-[#ece9df]">
                      <div className="w-7 h-7 rounded-full bg-[#e8e5db] flex items-center justify-center flex-shrink-0 text-[11px] font-bold text-[#888] uppercase">
                        {c.name?.[0] ?? "?"}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-[14px] font-semibold text-[#222]">{c.name}</p>
                        {c.role && <p className="text-[12px] text-[#888]">{c.role}</p>}
                        {bday && <p className="text-[11.5px] text-[#aaa] mt-0.5">🎂 {bday}</p>}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Acciones */}
          {can("tareas") && (
            <div className="pt-1 border-t border-[#ece9df]">
              <button
                type="button"
                onClick={() => {
                  onClose();
                  navigate(`/tareas?view=base&team=${line?.id}&client=${client.id}`);
                }}
                className="flex items-center gap-2 text-[14px] font-semibold text-[#555] hover:text-[#111] transition-colors"
              >
                <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8">
                  <path d="M3 8h10M9 4l4 4-4 4" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
                Ver tareas de este cliente
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function InfoItem({ label, children }) {
  return (
    <div>
      <p className="text-[11.5px] font-mono font-bold uppercase tracking-[0.12em] text-[#aaa] mb-0.5">{label}</p>
      <div className="text-[14px] text-[#555]">{children ?? "—"}</div>
    </div>
  );
}
