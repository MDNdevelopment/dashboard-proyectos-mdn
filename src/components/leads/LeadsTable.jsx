import { useState } from "react";
import { STATUS_LABELS, STATUS_BADGE } from "./constants";

const COLUMNS = [
  { key: "nombre", label: "Nombre", sortable: true },
  { key: "empresa", label: "Empresa", sortable: true },
  { key: "servicios", label: "Servicios / Página", sortable: false },
  { key: "status", label: "Estado", sortable: true },
  { key: "created_at", label: "Recibido", sortable: true },
];

/**
 * Tabla de leads con sorting por columna y filtros de búsqueda/servicio — mismo patrón
 * de src/components/ads/AdsList.jsx (COLUMNS declarativo, handleSort/SortIcon, filtered→sorted).
 * `leads` ya viene filtrado por periodo + estado (cards de resumen) desde LeadsPage; esta
 * tabla añade solo búsqueda de texto y filtro por servicio sobre ese subconjunto.
 */
export default function LeadsTable({ leads, onSelectLead }) {
  const [search, setSearch] = useState("");
  const [filterServicio, setFilterServicio] = useState("all");
  const [sortKey, setSortKey] = useState("created_at");
  const [sortAsc, setSortAsc] = useState(false);

  const servicios = [...new Set(leads.flatMap((l) => l.servicios ?? []))].sort();

  const filtered = leads.filter((l) => {
    if (filterServicio !== "all" && !(l.servicios ?? []).includes(filterServicio)) return false;
    if (search) {
      const q = search.toLowerCase();
      if (
        !l.nombre?.toLowerCase().includes(q) &&
        !l.empresa?.toLowerCase().includes(q) &&
        !l.email?.toLowerCase().includes(q) &&
        !l.telefono?.toLowerCase().includes(q) &&
        !l.mensaje?.toLowerCase().includes(q)
      ) return false;
    }
    return true;
  });

  const sorted = [...filtered].sort((a, b) => {
    let va = a[sortKey] ?? "";
    let vb = b[sortKey] ?? "";
    if (typeof va === "string") va = va.toLowerCase();
    if (typeof vb === "string") vb = vb.toLowerCase();
    if (va < vb) return sortAsc ? -1 : 1;
    if (va > vb) return sortAsc ? 1 : -1;
    return 0;
  });

  function handleSort(key) {
    if (sortKey === key) setSortAsc((a) => !a);
    else { setSortKey(key); setSortAsc(true); }
  }

  function clearFilters() {
    setSearch("");
    setFilterServicio("all");
  }

  const SortIcon = ({ col }) => {
    if (!col.sortable) return null;
    const active = sortKey === col.key;
    return (
      <svg width="8" height="8" viewBox="0 0 8 8" fill="none" className={`inline ml-1 flex-shrink-0 ${active ? "opacity-100" : "opacity-30"}`}>
        {sortAsc && active
          ? <path d="M4 1L7 6H1L4 1Z" fill="currentColor" />
          : <path d="M4 7L1 2H7L4 7Z" fill="currentColor" />}
      </svg>
    );
  };

  return (
    <div>
      {/* Toolbar: búsqueda + filtro por servicio */}
      <div className="flex flex-wrap gap-2 mb-3">
        <div className="relative flex-1 min-w-[160px] sm:min-w-[200px]">
          <svg
            className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[#999] pointer-events-none"
            width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2"
          >
            <circle cx="6.5" cy="6.5" r="5" />
            <path d="M10.5 10.5L14 14" strokeLinecap="round" />
          </svg>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar nombre, empresa, email, teléfono..."
            className="input-base text-[14px] py-1.5 pl-8 w-full"
          />
        </div>
        {servicios.length > 0 && (
          <select
            value={filterServicio}
            onChange={(e) => setFilterServicio(e.target.value)}
            className="input-base text-[14px] py-1.5"
          >
            <option value="all">Todos los servicios</option>
            {servicios.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        )}
        {(search || filterServicio !== "all") && (
          <button
            onClick={clearFilters}
            className="px-3 py-1.5 rounded-lg border border-[#e0ddd4] text-[14px] font-medium text-[#555] hover:bg-[#f5f3eb] transition-colors"
          >
            Limpiar
          </button>
        )}
      </div>

      <p className="text-[13px] font-mono text-[#888] mb-2">
        {sorted.length} {sorted.length === 1 ? "resultado" : "resultados"}
        {filtered.length !== leads.length && ` de ${leads.length}`}
      </p>

      {sorted.length === 0 ? (
        <div className="bg-white rounded-xl border border-[#e0ddd4] p-10 text-center">
          <p className="text-[15px] text-[#888]">
            {leads.length === 0 ? "No hay leads para mostrar." : "Sin resultados para esos filtros."}
          </p>
        </div>
      ) : (
        <div className="bg-white border border-[#e0ddd4] rounded-2xl overflow-hidden overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-[#ece9df] bg-[#fafaf7]">
                {COLUMNS.map((col) => (
                  <th
                    key={col.key}
                    onClick={col.sortable ? () => handleSort(col.key) : undefined}
                    className={`px-3 py-2.5 text-[12px] font-mono font-bold tracking-[0.14em] uppercase text-[#888] whitespace-nowrap ${
                      col.sortable ? "cursor-pointer select-none hover:text-[#111]" : ""
                    }`}
                  >
                    {col.label}
                    <SortIcon col={col} />
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sorted.map((lead) => (
                <tr
                  key={lead.id}
                  onClick={() => onSelectLead(lead)}
                  className="border-b border-[#f0ede3] last:border-0 hover:bg-[#fafaf7] transition-colors cursor-pointer"
                >
                  <td className="px-3 py-2.5 text-[14px] font-medium text-[#111] max-w-[160px] truncate">{lead.nombre}</td>
                  <td className="px-3 py-2.5 text-[14px] text-[#444] max-w-[160px] truncate">{lead.empresa}</td>
                  <td className="px-3 py-2.5 text-[13px] text-[#666] max-w-[220px]">
                    <div className="flex flex-wrap gap-1">
                      {(lead.servicios ?? []).map((s) => (
                        <span key={s} className="font-mono px-1.5 py-0.5 rounded bg-[#f5f3eb] text-[11.5px] whitespace-nowrap">{s}</span>
                      ))}
                      {lead.tipo_pagina && (
                        <span className="font-mono px-1.5 py-0.5 rounded bg-[#f5f3eb] text-[11.5px] whitespace-nowrap">{lead.tipo_pagina}</span>
                      )}
                    </div>
                  </td>
                  <td className="px-3 py-2.5">
                    <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full whitespace-nowrap ${STATUS_BADGE[lead.status]}`}>
                      {STATUS_LABELS[lead.status]}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-[13px] text-[#888] whitespace-nowrap">
                    {new Date(lead.created_at).toLocaleDateString("es-VE", { day: "2-digit", month: "short", year: "numeric" })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
