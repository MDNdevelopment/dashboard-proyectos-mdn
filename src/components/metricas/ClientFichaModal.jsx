import { useEffect } from "react";
import ClientFichaContent from "./ClientFichaContent";

/**
 * Modal de solo lectura con la ficha técnica de un cliente (metric_clients).
 * Wrapper fino: overlay + botón X + Escape; el cuerpo vive en ClientFichaContent
 * (embebible también desde LineFichaModal en drill-down).
 * Props:
 *   client  — objeto completo de metric_clients (todos los campos)
 *   line    — objeto de metric_lines (id, name, color) — la línea del cliente
 *   onClose — callback para cerrar
 */
export default function ClientFichaModal({ client, line, onClose, employees = [] }) {
  // Cerrar con Escape
  useEffect(() => {
    const fn = e => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", fn);
    return () => document.removeEventListener("keydown", fn);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/25 backdrop-blur-[3px]">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col relative">
        {/* Botón cerrar */}
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

        <ClientFichaContent client={client} line={line} onClose={onClose} employees={employees} />
      </div>
    </div>
  );
}
