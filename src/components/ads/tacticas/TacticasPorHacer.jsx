import { useState } from 'react'
import ClientCell from '../ClientCell'
import { fmtDate } from '../campaignSpendApi'

const COLLAPSED_COUNT = 6

/**
 * Fila de "marcas por hacer": las que no tienen ninguna táctica vigente ni programada.
 * Muestra cuándo terminó la última (si hubo) y, con `ads.manage`, un atajo para cargar
 * la siguiente con la marca ya elegida.
 *
 * @param {object}   props
 * @param {Array}    props.brands        — clientes (metric_clients) sin táctica vigente
 * @param {Map}      props.latestByBrand — client_id → última táctica de la marca
 * @param {Set}      props.insumoClientIds — marcas que tienen un insumo pendiente de la táctica anterior
 * @param {boolean}  props.canManage
 * @param {Function} props.onCreate      — (clientId) => void, abre el formulario con la marca
 * @param {Function} props.onOpenBrand   — (clientId) => void, abre la ficha de la marca
 */
export default function TacticasPorHacer({
  brands,
  latestByBrand,
  insumoClientIds = new Set(),
  canManage,
  onCreate,
  onOpenBrand,
}) {
  const [expanded, setExpanded] = useState(false)
  if (brands.length === 0) return null

  const sorted = [...brands].sort((a, b) => (a.name ?? '').localeCompare(b.name ?? '', 'es'))
  const visible = expanded ? sorted : sorted.slice(0, COLLAPSED_COUNT)

  return (
    <section
      aria-labelledby="tacticas-por-hacer"
      className="bg-white border border-[#e0ddd4] rounded-2xl p-4 mb-5"
    >
      <div className="flex items-center justify-between gap-3 mb-3">
        <h2 id="tacticas-por-hacer" className="text-[16px] font-bold text-[#111]">
          Por hacer · {brands.length} {brands.length === 1 ? 'marca' : 'marcas'} sin táctica vigente
        </h2>
        {brands.length > COLLAPSED_COUNT && (
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="text-[13.5px] font-semibold text-[#555] hover:text-[#111]"
          >
            {expanded ? 'Ver menos' : `Ver las ${brands.length}`}
          </button>
        )}
      </div>

      <ul className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2">
        {visible.map((b) => {
          const last = latestByBrand.get(b.id)
          return (
            <li
              key={b.id}
              className="flex items-center justify-between gap-2 border border-[#f0ede3] rounded-xl px-3 py-2"
            >
              <div className="min-w-0">
                <button
                  type="button"
                  onClick={() => onOpenBrand(b.id)}
                  className="text-[14px] font-semibold text-[#111] hover:underline text-left"
                >
                  <ClientCell name={b.name} logoUrl={b.logo_url} />
                </button>
                <p className="text-[12.5px] text-[#888] mt-0.5 truncate">
                  {last
                    ? `Última terminó el ${fmtDate(last.end_date)}`
                    : 'Sin tácticas registradas'}
                </p>
                {insumoClientIds.has(b.id) && (
                  <span className="inline-block mt-1 text-[11px] font-mono font-bold uppercase tracking-wide px-1.5 py-0.5 rounded bg-[#e3f2fd] text-[#1565c0]">
                    Con insumo
                  </span>
                )}
              </div>
              {canManage && (
                <button
                  type="button"
                  onClick={() => onCreate(b.id)}
                  aria-label={`Cargar táctica de ${b.name}`}
                  className="flex-shrink-0 text-[13px] font-semibold px-2.5 py-1 rounded-lg bg-[#FFB800] text-[#111] hover:bg-[#e6a600] transition-colors"
                >
                  Cargar táctica
                </button>
              )}
            </li>
          )
        })}
      </ul>
    </section>
  )
}
