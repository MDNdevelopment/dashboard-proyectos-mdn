import { useEffect } from "react";
import { Avatar } from "../tareas/UserPickerSingle";
import { JUSTIFICATIVOS_REUNION } from "./constants";

/** Adapta un objeto cliente (logo_url) al shape que espera <Avatar> (avatar_url). */
function clientAvatar(c) {
  return {
    first_name: c?.name ?? "",
    last_name: "",
    avatar_url: c?.logo_url ?? null,
    user_id: c?.id,
  };
}

/**
 * Modal de cobertura de reuniones por marca (Reportes → Operaciones, sección "1. Reuniones
 * realizadas"). Lista todas las marcas activas de la línea: check verde si ya tienen al
 * menos una reunión "realizada" en el período (heldClientIds, de loadHeldClientIdsForLine),
 * o un <select> de justificativo (No aplica / Reprogramado por el cliente / No cumplió) si no.
 * Mismo patrón de wrapper que ClientFichaModal.jsx (overlay + botón X + Escape).
 *
 * Props:
 *   clients            — marcas activas de la línea (metric_clients, ya filtradas por !deleted_at)
 *   heldClientIds       — array de client_id con reunión realizada en el período
 *   justificativos       — objeto { [clienteId]: valorJustificativo }
 *   onSetJustificativo(clienteId, value) — guarda/quita el justificativo de una marca
 *   onClose
 */
export default function ReunionesClientesModal({
  clients, heldClientIds, justificativos, onSetJustificativo, onClose,
}) {
  useEffect(() => {
    const fn = e => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", fn);
    return () => document.removeEventListener("keydown", fn);
  }, [onClose]);

  const heldSet = new Set(heldClientIds);
  const sorted = [...clients].sort((a, b) => (a.name ?? "").localeCompare(b.name ?? ""));
  const heldCount = sorted.filter(c => heldSet.has(c.id)).length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/25 backdrop-blur-[3px]">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col relative">
        <button
          type="button"
          onClick={onClose}
          className="absolute top-4 right-4 w-7 h-7 flex items-center justify-center rounded-lg text-[#999] hover:text-[#111] hover:bg-[#f0ede3] transition-colors"
          aria-label="Cerrar"
        >
          <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12"/>
          </svg>
        </button>

        <div className="px-5 pt-5 pb-3 border-b border-[#e0ddd4] flex-shrink-0">
          <p className="text-[15px] font-bold text-[#111]">Cobertura de reuniones por marca</p>
          <p className="text-[12px] text-[#888] mt-0.5">
            {heldCount}/{sorted.length} marca{sorted.length === 1 ? "" : "s"} con reunión realizada
          </p>
        </div>

        <div className="px-5 py-3 overflow-y-auto space-y-2">
          {sorted.length === 0 && (
            <p className="text-[13px] text-[#888] py-4 text-center">Esta línea no tiene marcas activas.</p>
          )}
          {sorted.map(client => {
            const held = heldSet.has(client.id);
            return (
              <div key={client.id} className="flex items-center justify-between gap-3 py-1.5">
                <div className="flex items-center gap-2 min-w-0">
                  <Avatar user={clientAvatar(client)} size={22} />
                  <span className="text-[14px] text-[#111] truncate">{client.name}</span>
                </div>
                {held ? (
                  <span className="flex items-center gap-1 text-[13px] text-green-600 font-medium flex-shrink-0">
                    <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7"/>
                    </svg>
                    Reunión realizada
                  </span>
                ) : (
                  <select
                    className="input-base text-[13px] py-1 flex-shrink-0 max-w-[220px]"
                    value={justificativos?.[client.id] ?? ""}
                    onChange={e => onSetJustificativo(client.id, e.target.value)}
                  >
                    <option value="">— Justificativo —</option>
                    {JUSTIFICATIVOS_REUNION.map(opt => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </select>
                )}
              </div>
            );
          })}
        </div>

        <div className="px-5 py-3 border-t border-[#e0ddd4] flex-shrink-0 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="text-[13px] font-mono text-[#555] hover:text-[#111] transition-colors"
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
}
