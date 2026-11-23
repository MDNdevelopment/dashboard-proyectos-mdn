import ClientCell from '../ClientCell'
import { fmtDate } from '../campaignSpendApi'

/**
 * Tabla de Base con el Estado "Por hacer": una fila por marca sin táctica vigente ni
 * programada (no son tácticas). Muestra su última táctica y, con `ads.manage`, el atajo
 * para cargar la siguiente con la marca ya elegida.
 *
 * @param {object}   props
 * @param {Array}    props.brands          — marcas (metric_clients) sin táctica vigente, ya filtradas
 * @param {Map}      props.latestByBrand   — client_id → última táctica de la marca
 * @param {Set}      props.insumoClientIds — marcas con insumo pendiente de la táctica anterior
 * @param {Function} props.leadOf          — (clientId) => nombre de la jefa | null
 * @param {Map}      props.linesById
 * @param {boolean}  props.canManage
 * @param {Function} props.onCreate        — (clientId) => void, abre el formulario con la marca
 * @param {Function} props.onOpenBrand     — (clientId) => void, abre la ficha de la marca
 */
export default function TacticasPorHacerTable({
  brands,
  latestByBrand,
  insumoClientIds = new Set(),
  leadOf,
  linesById,
  canManage,
  onCreate,
  onOpenBrand,
}) {
  const rows = [...brands].sort((a, b) => (a.name ?? '').localeCompare(b.name ?? '', 'es'))
  const th =
    'px-4 py-3 text-[12.5px] font-mono font-bold tracking-[0.12em] uppercase text-[#888] whitespace-nowrap'

  return (
    <div className="bg-white rounded-xl border border-[#e0ddd4] overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-left text-[15px] min-w-[760px]">
          <thead>
            <tr className="border-b border-[#ece9df] bg-[#faf9f5]">
              <th className={th}>Marca</th>
              <th className={th}>Línea</th>
              <th className={th}>Jefa</th>
              <th className={th}>Última táctica</th>
              <th className={th}>Terminó</th>
              <th className="px-4 py-3">
                <span className="sr-only">Acciones</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((b) => {
              const last = latestByBrand.get(b.id)
              return (
                <tr
                  key={b.id}
                  onClick={() => onOpenBrand(b.id)}
                  className="border-b border-[#f5f3eb] last:border-0 hover:bg-[#faf9f5] cursor-pointer transition-colors"
                >
                  <td className="px-4 py-3 font-medium text-[#111] whitespace-nowrap">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation()
                        onOpenBrand(b.id)
                      }}
                      className="hover:underline text-left"
                      aria-label={`Ver ficha de ${b.name}`}
                    >
                      <ClientCell name={b.name} logoUrl={b.logo_url} />
                    </button>
                    {insumoClientIds.has(b.id) && (
                      <span className="ml-2 align-middle inline-block text-[11px] font-mono font-bold uppercase tracking-wide px-1.5 py-0.5 rounded bg-[#e3f2fd] text-[#1565c0]">
                        Con insumo
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-[14px] text-[#555] whitespace-nowrap">
                    {linesById.get(b.line_id)?.name ?? 'Sin línea'}
                  </td>
                  <td className="px-4 py-3 text-[14px] text-[#555] whitespace-nowrap">
                    {leadOf(b.id) ?? '—'}
                  </td>
                  <td className="px-4 py-3 text-[14px] text-[#333] max-w-[240px]">
                    {last ? (
                      <span className="line-clamp-2">{last.name}</span>
                    ) : (
                      <span className="text-[#bbb]">Sin tácticas registradas</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-[14px] font-mono text-[#666] whitespace-nowrap">
                    {last ? fmtDate(last.end_date) : '—'}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {canManage && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation()
                          onCreate(b.id)
                        }}
                        aria-label={`Cargar táctica de ${b.name}`}
                        className="text-[13px] font-semibold px-2.5 py-1 rounded-lg bg-[#FFB800] text-[#111] hover:bg-[#e6a600] transition-colors whitespace-nowrap"
                      >
                        Cargar táctica
                      </button>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
