import { useState, useMemo } from 'react'

/**
 * Selector múltiple de clientes/marcas para una reunión — mismo patrón que
 * AttendeePicker.jsx (buscador con sugerencias + chips removibles abajo), pero sin los
 * botones rápidos por cargo (no aplican a clientes). Pensado para el caso de un cliente
 * con varias marcas que hoy comparten reunión, hora y participantes: en vez de crear una
 * reunión por marca, se eligen todas acá y se agenda una sola.
 */
const MAX_SUGGESTIONS = 6

export default function ClientPicker({ clients, selectedIds, onChange }) {
  const [query, setQuery] = useState('')
  const selectedSet = new Set(selectedIds ?? [])
  const selected = (selectedIds ?? []).map((id) => clients.find((c) => c.id === id)).filter(Boolean)

  const suggestions = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return []
    return clients
      .filter((c) => !c.deleted_at && c.name?.toLowerCase().includes(q))
      .sort((a, b) => a.name.localeCompare(b.name, 'es', { sensitivity: 'base' }))
      .slice(0, MAX_SUGGESTIONS)
  }, [query, clients])

  function add(clientId) {
    onChange([...(selectedIds ?? []), clientId])
  }

  function remove(clientId) {
    onChange((selectedIds ?? []).filter((id) => id !== clientId))
  }

  function toggleFromSearch(clientId) {
    if (selectedSet.has(clientId)) remove(clientId)
    else add(clientId)
    setQuery('')
  }

  return (
    <div>
      <div className="relative mb-2.5">
        <input
          type="text"
          className="input-base w-full"
          placeholder="Buscar cliente por nombre…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        {query.trim() && (
          <div
            data-testid="client-suggestions"
            className="absolute z-30 top-full left-0 right-0 mt-1 bg-white border border-[#e0ddd4] rounded-xl shadow-lg overflow-hidden max-h-48 overflow-y-auto"
          >
            {suggestions.length === 0 ? (
              <p className="text-[13px] text-[#999] px-3 py-2">Sin resultados</p>
            ) : (
              suggestions.map((c) => {
                const alreadyAdded = selectedSet.has(c.id)
                return (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => toggleFromSearch(c.id)}
                    title={alreadyAdded ? `Quitar a ${c.name}` : `Agregar a ${c.name}`}
                    className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-[#f5f3eb] transition-colors"
                  >
                    <span className="text-[13px] font-medium text-[#333] flex-1">{c.name}</span>
                    {alreadyAdded && (
                      <svg
                        width="15"
                        height="15"
                        viewBox="0 0 16 16"
                        fill="none"
                        stroke="#16a34a"
                        strokeWidth="2.2"
                        className="flex-shrink-0"
                        aria-hidden="true"
                        data-testid="client-already-added-check"
                      >
                        <path d="M3 8.5l3 3 7-7" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    )}
                  </button>
                )
              })
            )}
          </div>
        )}
      </div>

      {selected.length === 0 ? (
        <p className="text-[13px] text-[#bbb]">Sin clientes agregados.</p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {selected.map((c) => (
            <div
              key={c.id}
              className="flex items-center gap-2 pl-2.5 pr-1 py-1 rounded-xl bg-[#faf9f5] border border-[#ece9df] hover:border-[#d8d4c6] transition-colors"
            >
              <span className="text-[13px] font-medium text-[#333]">{c.name}</span>
              <button
                type="button"
                onClick={() => remove(c.id)}
                aria-label={`Quitar a ${c.name}`}
                className="w-5 h-5 flex items-center justify-center rounded-lg text-[#bbb] hover:text-red-400 hover:bg-red-50 transition-colors flex-shrink-0"
              >
                <svg
                  width="10"
                  height="10"
                  viewBox="0 0 10 10"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                >
                  <path d="M1 1l8 8M9 1L1 9" />
                </svg>
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
