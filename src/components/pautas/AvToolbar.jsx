/**
 * Barra superior del módulo: alcance por línea (pills), pestañas de vista (según el rol,
 * con badges) y acciones globales. `views` = [{ key, label, badge?, badgeLabel? }].
 */
export default function AvToolbar({
  canViewAll,
  lines,
  generalLine,
  scopeLineId,
  allLinesKey,
  onScopeChange,
  views,
  view,
  onViewChange,
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
        {views.map((v) => {
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
              {v.badge > 0 && (
                <span
                  className={`ml-1.5 inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full text-[10.5px] font-mono font-bold ${
                    v.badgeTone === 'red' ? 'bg-[#e45b5b] text-white' : 'bg-[#e0b23d] text-[#111]'
                  }`}
                  title={v.badgeLabel}
                  aria-label={v.badgeLabel}
                >
                  {v.badge}
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
