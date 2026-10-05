import PautaRow from './PautaRow'
import {
  LIST_FILTERS,
  LIST_FILTER_LABELS,
  FORMAT_LABELS,
  pautaMatchesList,
  pautaMatchesQuery,
  pautaMatchesPendiente,
  sortForList,
} from '../../utils/audiovisual'

const PENDIENTE_LABELS = { ...FORMAT_LABELS, sinDesglose: 'Sin desglosar' }

/**
 * Vista Lista: chips de estado, filtro por recurso, búsqueda y — cuando se llega desde
 * "Pendiente por editar" — un chip removible que acota a las pautas con pendiente.
 */
export default function AvListView({
  pautas,
  piezasByPauta,
  lines,
  generalLineId,
  usersById,
  recursoUsers,
  filter,
  onFilterChange,
  pendientes,
  onPautaClick,
}) {
  const { status, recursoId, query, pendiente, lineId = null } = filter
  const enLinea = (p) => !lineId || (p.line_id ?? generalLineId) === lineId
  const counts = Object.fromEntries(
    LIST_FILTERS.map((f) => [f, pautas.filter((p) => enLinea(p) && pautaMatchesList(p, f)).length]),
  )
  const visible = sortForList(
    pautas.filter(
      (p) =>
        enLinea(p) &&
        (pendiente
          ? pautaMatchesPendiente(p, pendientes.porPauta, pendiente, generalLineId)
          : pautaMatchesList(p, status)) &&
        pautaMatchesQuery(p, { recursoId, query, usersById }),
    ),
    pendiente ? 'agendadas' : status,
  )
  const lineName = (p) => {
    const id = p.line_id ?? generalLineId
    return (lines ?? []).find((l) => l.id === id)?.name ?? 'Independientes'
  }
  const set = (patch) => onFilterChange({ ...filter, ...patch })

  return (
    <div className="bg-white border border-[#e0ddd4] rounded-2xl overflow-hidden">
      <div
        className="flex flex-wrap items-center gap-2 px-4 py-3 border-b border-[#ece9df]"
        data-tour="lista-filtros"
      >
        {lineId && (
          <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#111] text-[#FFB800] text-[13px] font-semibold">
            Línea: {lineName({ line_id: lineId })}
            <button
              type="button"
              onClick={() => set({ lineId: null })}
              aria-label="Quitar filtro de línea"
              className="w-4 h-4 rounded-full hover:bg-white/20 flex items-center justify-center"
            >
              ✕
            </button>
          </span>
        )}
        {pendiente ? (
          <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#fdf4de] text-[#9a7400] text-[13px] font-semibold">
            Pendiente por editar: {pendiente.formato ? PENDIENTE_LABELS[pendiente.formato] : 'todo'}
            {pendiente.lineId && ` · ${lineName({ line_id: pendiente.lineId })}`}
            <button
              type="button"
              onClick={() => set({ pendiente: null })}
              aria-label="Quitar filtro de pendientes"
              className="w-4 h-4 rounded-full hover:bg-[#f3e2ad] flex items-center justify-center"
            >
              ✕
            </button>
          </span>
        ) : (
          LIST_FILTERS.map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => set({ status: f })}
              aria-pressed={status === f}
              className={`px-3 py-1 rounded-full text-[13px] font-semibold transition-colors ${
                status === f
                  ? 'bg-[#111] text-[#FFB800]'
                  : 'bg-white border border-[#e0ddd4] text-[#555] hover:border-[#111]'
              }`}
            >
              {LIST_FILTER_LABELS[f]}
              <span className="ml-1.5 font-mono text-[11px] opacity-70">{counts[f]}</span>
            </button>
          ))
        )}
        <div className="ml-auto flex items-center gap-2">
          <select
            className="input-base input-compact w-auto"
            aria-label="Filtrar por recurso"
            value={recursoId ?? ''}
            onChange={(e) => set({ recursoId: e.target.value || null })}
          >
            <option value="">Todos los recursos</option>
            {(recursoUsers ?? []).map((u) => (
              <option key={u.user_id} value={u.user_id}>
                {u.first_name} {u.last_name}
              </option>
            ))}
          </select>
          <input
            className="input-base input-compact w-[180px]"
            placeholder="Buscar cliente, tema…"
            aria-label="Buscar"
            value={query ?? ''}
            onChange={(e) => set({ query: e.target.value })}
          />
        </div>
      </div>
      {visible.length === 0 ? (
        <p className="px-4 py-8 text-center text-[13px] text-[#a29b8c]">
          No hay pautas que coincidan con este filtro.
        </p>
      ) : (
        <div>
          {visible.map((p) => (
            <PautaRow
              key={p.id}
              pauta={p}
              piezas={piezasByPauta?.get(p.id) ?? []}
              lineName={lineName(p)}
              usersById={usersById}
              onClick={onPautaClick}
            />
          ))}
        </div>
      )}
    </div>
  )
}
