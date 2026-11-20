const MAX_LOGOS = 24

/**
 * Tarjeta "Por hacer" del Dashboard: las marcas sin táctica vigente ni programada, resumidas
 * en sus logos. Clic en un logo abre la ficha de la marca; "Ver en Base" abre la lista completa
 * (Estado "Sin táctica"), donde está el atajo para cargar cada táctica.
 *
 * @param {object}   props
 * @param {Array}    props.brands          — clientes (metric_clients) sin táctica vigente
 * @param {Set}      props.insumoClientIds — marcas con insumo pendiente de la táctica anterior
 * @param {Function} props.onOpenBrand     — (clientId) => void, abre la ficha de la marca
 * @param {Function} props.onViewInBase    — () => void, abre Base con el Estado "Sin táctica"
 */
export default function TacticasPorHacer({
  brands,
  insumoClientIds = new Set(),
  onOpenBrand,
  onViewInBase,
}) {
  if (brands.length === 0) return null

  const sorted = [...brands].sort((a, b) => (a.name ?? '').localeCompare(b.name ?? '', 'es'))
  const visible = sorted.slice(0, MAX_LOGOS)
  const rest = sorted.length - visible.length

  return (
    <section
      aria-label="Por hacer"
      className="bg-white border border-[#e0ddd4] rounded-2xl p-5 mb-5"
    >
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div>
          <p className="text-[12px] font-mono font-bold tracking-[0.14em] uppercase text-[#888]">
            Por hacer
          </p>
          <h2 className="text-[18px] font-bold text-[#111]">
            {brands.length} {brands.length === 1 ? 'marca' : 'marcas'} sin táctica vigente
          </h2>
        </div>
        <button
          type="button"
          onClick={onViewInBase}
          className="text-[14px] font-bold px-3.5 py-2 rounded-xl bg-[#111] text-white hover:bg-[#222] transition-colors"
        >
          Ver en Base
        </button>
      </div>

      <ul className="flex flex-wrap gap-2.5">
        {visible.map((b) => {
          const insumo = insumoClientIds.has(b.id)
          return (
            <li key={b.id}>
              <button
                type="button"
                onClick={() => onOpenBrand(b.id)}
                title={insumo ? `${b.name} · con insumo` : b.name}
                aria-label={`Ver ficha de ${b.name}${insumo ? ' (con insumo)' : ''}`}
                className="relative block rounded-full ring-2 ring-white hover:ring-[#FFB800] transition-shadow"
              >
                {b.logo_url ? (
                  <img
                    src={b.logo_url}
                    alt=""
                    className="w-11 h-11 rounded-full object-cover border border-[#e0ddd4]"
                  />
                ) : (
                  <span className="w-11 h-11 rounded-full bg-[#f0ede3] border border-[#e0ddd4] flex items-center justify-center text-[15px] font-bold text-[#999] uppercase">
                    {b.name?.[0]}
                  </span>
                )}
                {insumo && (
                  <span
                    aria-hidden="true"
                    className="absolute -top-0.5 -right-0.5 w-3 h-3 rounded-full bg-[#1565c0] ring-2 ring-white"
                  />
                )}
              </button>
            </li>
          )
        })}
        {rest > 0 && (
          <li>
            <button
              type="button"
              onClick={onViewInBase}
              aria-label={`Ver las ${rest} marcas restantes en Base`}
              className="w-11 h-11 rounded-full bg-[#111] text-white text-[13px] font-mono font-bold flex items-center justify-center hover:bg-[#222]"
            >
              +{rest}
            </button>
          </li>
        )}
      </ul>
      {sorted.some((b) => insumoClientIds.has(b.id)) && (
        <p className="flex items-center gap-1.5 text-[12.5px] text-[#888] mt-3">
          <span aria-hidden="true" className="w-2.5 h-2.5 rounded-full bg-[#1565c0]" />
          Con insumo de la táctica anterior
        </p>
      )}
    </section>
  )
}
