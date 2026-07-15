import { useState, useMemo } from "react";

/**
 * Selector de participantes de una reunión. Pensado para reducir fricción: botones
 * rápidos por cargo (cada click REEMPLAZA la selección por ese cargo — el último botón
 * presionado predomina, no se acumulan) + una barra de búsqueda para agregar/quitar
 * individualmente + "Quitar a todos". Solo se listan los participantes ya agregados
 * (no toda la plantilla) — igual que la lista de miembros en Empresa › Líneas.
 *
 * Los cargos se resuelven por `access_level` (fuente confiable, ver ARQUITECTURA.md),
 * no por `position_name` (texto libre por empresa):
 *   nivel 4 = Directores · nivel 3 = Jefes · nivel 2 = Coordinadores · nivel 1 = resto.
 */
const QUICK_GROUPS = [
  { key: "l4", label: "Solo directores", test: (u) => u.access_level >= 4 },
  { key: "l3-only", label: "Solo jefes", test: (u) => u.access_level === 3 },
  { key: "l3", label: "Directores y jefes", test: (u) => u.access_level >= 3 },
  { key: "l2-only", label: "Solo coordinadores", test: (u) => u.access_level === 2 },
  { key: "l2", label: "Directores, jefes y coordinadores", test: (u) => u.access_level >= 2 },
  { key: "all", label: "Toda la empresa", test: () => true },
];

const MAX_SUGGESTIONS = 6;

function fullName(u) {
  return `${u.first_name ?? ""} ${u.last_name ?? ""}`.trim();
}

function initials(u) {
  return `${u.first_name?.[0] ?? ""}${u.last_name?.[0] ?? ""}`.toUpperCase();
}

export default function AttendeePicker({ employees, selectedIds, onChange }) {
  const [query, setQuery] = useState("");
  const selectedSet = new Set(selectedIds ?? []);
  const selected = employees.filter((u) => selectedSet.has(u.user_id));

  // Un empleado archivado (deleted_at) no puede agregarse de nuevo, pero si ya
  // estaba en `selectedIds` (reunión pasada) sigue resolviéndose vía `selected`
  // arriba, que filtra sobre la lista completa `employees`, no sobre esta.
  const suggestions = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return employees
      .filter((u) => !u.deleted_at && fullName(u).toLowerCase().includes(q))
      .slice(0, MAX_SUGGESTIONS);
  }, [query, employees]);

  /** Reemplaza la selección completa por el cargo elegido — el último botón predomina. */
  function setGroup(test) {
    onChange(employees.filter((u) => !u.deleted_at && test(u)).map((u) => u.user_id));
  }

  function clearAll() {
    onChange([]);
  }

  function add(userId) {
    onChange([...selectedIds, userId]);
  }

  function remove(userId) {
    onChange(selectedIds.filter((id) => id !== userId));
  }

  function toggleFromSearch(userId) {
    if (selectedSet.has(userId)) remove(userId);
    else add(userId);
    setQuery("");
  }

  return (
    <div>
      <p className="text-[11.5px] font-mono font-bold uppercase tracking-[0.1em] text-[#aaa] mb-1.5">
        Preseleccionar por cargo
      </p>
      <div className="flex flex-wrap gap-2.5 mb-3">
        {QUICK_GROUPS.map((g) => (
          <button
            key={g.key}
            type="button"
            onClick={() => setGroup(g.test)}
            title={`Preselecciona a ${g.label.toLowerCase()} — reemplaza la selección actual`}
            className="text-[12.5px] font-semibold px-2.5 py-1 rounded-lg border border-[#e0ddd4] text-[#444] hover:bg-[#FFB800]/20 hover:border-[#FFB800] transition-colors"
          >
            {g.label}
          </button>
        ))}
        <button
          type="button"
          onClick={clearAll}
          title="Quita a todos los participantes agregados"
          className="text-[12.5px] font-semibold px-2.5 py-1 rounded-lg border border-[#e0ddd4] text-[#b91c1c] hover:bg-red-50 hover:border-red-300 transition-colors"
        >
          Quitar a todos
        </button>
      </div>

      {/* Buscador para agregar individualmente */}
      <p className="text-[11.5px] font-mono font-bold uppercase tracking-[0.1em] text-[#aaa] mb-1.5">
        Buscar por nombre
      </p>
      <div className="relative mb-2.5">
        <input
          type="text"
          className="input-base w-full"
          placeholder="Buscar empleado por nombre…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        {query.trim() && (
          <div data-testid="attendee-suggestions" className="absolute z-10 top-full left-0 right-0 mt-1 bg-white border border-[#e0ddd4] rounded-xl shadow-lg overflow-hidden max-h-48 overflow-y-auto">
            {suggestions.length === 0 ? (
              <p className="text-[13px] text-[#999] px-3 py-2">Sin resultados</p>
            ) : (
              suggestions.map((u) => {
                const name = fullName(u);
                const alreadyAdded = selectedSet.has(u.user_id);
                return (
                  <button
                    key={u.user_id}
                    type="button"
                    onClick={() => toggleFromSearch(u.user_id)}
                    title={alreadyAdded ? `Quitar a ${name}` : `Agregar a ${name}`}
                    className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-[#f5f3eb] transition-colors"
                  >
                    <span aria-hidden="true" className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold flex-shrink-0 overflow-hidden bg-[#eee]">
                      {u.avatar_url ? (
                        <img src={u.avatar_url} alt="" className="w-full h-full object-cover" />
                      ) : (
                        <span className="text-[#888]">{initials(u)}</span>
                      )}
                    </span>
                    <span className="text-[13px] font-medium text-[#333] flex-1">{name}</span>
                    {alreadyAdded && (
                      <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="#16a34a" strokeWidth="2.2" className="flex-shrink-0" aria-hidden="true" data-testid="already-added-check">
                        <path d="M3 8.5l3 3 7-7" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    )}
                  </button>
                );
              })
            )}
          </div>
        )}
      </div>

      {/* Participantes agregados — mismo estilo de pill removible que Empresa › Líneas */}
      {selected.length === 0 ? (
        <p className="text-[13px] text-[#bbb]">Sin participantes agregados.</p>
      ) : (
        <div className="flex flex-wrap gap-2 max-h-40 overflow-y-auto">
          {selected.map((u) => {
            const name = fullName(u);
            return (
              <div
                key={u.user_id}
                className="flex items-center gap-2 pl-2 pr-1 py-1 rounded-xl bg-[#faf9f5] border border-[#ece9df] hover:border-[#d8d4c6] transition-colors"
              >
                <span className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold flex-shrink-0 overflow-hidden bg-[#eee]">
                  {u.avatar_url ? (
                    <img src={u.avatar_url} alt={name} className="w-full h-full object-cover" />
                  ) : (
                    <span className="text-[#888]">{initials(u)}</span>
                  )}
                </span>
                <span className="text-[13px] font-medium text-[#333]">{name}</span>
                <button
                  type="button"
                  onClick={() => remove(u.user_id)}
                  aria-label={`Quitar a ${name}`}
                  className="w-5 h-5 flex items-center justify-center rounded-lg text-[#bbb] hover:text-red-400 hover:bg-red-50 transition-colors flex-shrink-0"
                >
                  <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                    <path d="M1 1l8 8M9 1L1 9" />
                  </svg>
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
