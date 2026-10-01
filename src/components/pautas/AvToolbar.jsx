export const VIEWS = [
  { key: 'calendario', label: 'Calendario' },
  { key: 'lista', label: 'Lista' },
  { key: 'rendimiento', label: 'Rendimiento' },
]

/**
 * Barra superior del módulo: alcance por línea (pills), pestañas de vista (Calendario /
 * Lista / Rendimiento, con el nº de solicitudes pendientes de aprobar) y acciones globales.
 */
export default function AvToolbar({
  canViewAll,
  lines,
  generalLine,
  scopeLineId,
  allLinesKey,
  onScopeChange,
  view,
  onViewChange,
  pendingCount,
  canCreate,
  createLabel,
  onCreate,
  onWhatsApp,
}) {
  const pill = (active) =>
    `px-3 py-1 rounded-full text-[14.5px] font-semibold transition-all ${
      active
        ? 'bg-[#FFB800] text-[#111]'
        : 'bg-white border border-[#e0ddd4] text-[#555] hover:border-[#FFB800] hover:text-[#111]'
    }`
  return (
    <div className="space-y-3 mb-4">
      <div className="flex flex-wrap items-center gap-1.5">
        {!canViewAll ? (
          <span className={pill(true)}>{lines[0]?.name ?? 'Sin línea'}</span>
        ) : (
          <>
            <button
              onClick={() => onScopeChange(allLinesKey)}
              className={pill(scopeLineId === allLinesKey)}
            >
              Todos
            </button>
            {lines.map((l) => (
              <button
                key={l.id}
                onClick={() => onScopeChange(l.id)}
                className={pill(scopeLineId === l.id)}
              >
                {l.name}
              </button>
            ))}
            {generalLine && (
              <button
                onClick={() => onScopeChange(generalLine.id)}
                className={pill(scopeLineId === generalLine.id)}
              >
                {generalLine.name}
              </button>
            )}
          </>
        )}
        <div className="ml-auto flex items-center gap-2">
          <button
            onClick={onWhatsApp}
            className="flex items-center gap-1.5 text-[12.5px] font-semibold text-[#111] bg-[#25D366]/15 border border-[#25D366]/40 px-3 py-1.5 rounded-lg hover:bg-[#25D366]/25 transition-colors"
          >
            Generar agenda WhatsApp
          </button>
          {canCreate && (
            <button
              onClick={onCreate}
              className="flex items-center gap-1.5 text-[13px] font-semibold text-[#111] bg-[#FFB800] px-3 py-1.5 rounded-lg hover:brightness-95"
            >
              + {createLabel}
            </button>
          )}
        </div>
      </div>

      <div className="flex items-center gap-1 border-b border-[#e8e4d8]" role="tablist">
        {VIEWS.map((v) => {
          const active = view === v.key
          return (
            <button
              key={v.key}
              role="tab"
              aria-selected={active}
              onClick={() => onViewChange(v.key)}
              className={`relative px-3.5 py-2 text-[14px] font-semibold transition-colors ${
                active ? 'text-[#111]' : 'text-[#888] hover:text-[#111]'
              }`}
            >
              {v.label}
              {v.key === 'lista' && pendingCount > 0 && (
                <span
                  className="ml-1.5 inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-[#e0b23d] text-[#111] text-[10.5px] font-mono font-bold"
                  title={`${pendingCount} solicitudes por aprobar`}
                  aria-label={`${pendingCount} solicitudes por aprobar`}
                >
                  {pendingCount}
                </span>
              )}
              {active && (
                <span className="absolute left-0 right-0 -bottom-px h-[2px] bg-[#FFB800] rounded-full" />
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}
