import ClientCell from '../ClientCell'
import DaysPill from './DaysPill'
import { fmtDate } from '../campaignSpendApi'
import { checklistCounts, daysLeft, isProgramada } from '../../../utils/tacticas'

/**
 * Tabla de la vista "Vigentes": una fila por táctica en marcha, ordenada por la que vence primero.
 *
 * @param {object}   props
 * @param {Array}    props.campaigns     — tácticas a mostrar (ya filtradas)
 * @param {string}   props.today         — hoy en Caracas (YYYY-MM-DD)
 * @param {Map}      props.clientsById
 * @param {Map}      props.latestByBrand — client_id → última táctica (para avisar el link de Drive faltante)
 * @param {Function} props.leadOf        — (clientId) => nombre de la jefa | null
 * @param {boolean}  props.canManage
 * @param {Function} props.onSelect      — (campaign) => void, abre el detalle
 * @param {Function} props.onOpenBrand   — (clientId) => void, abre la ficha de la marca
 */
export default function TacticasVigentesTable({
  campaigns,
  today,
  clientsById,
  latestByBrand,
  leadOf,
  canManage,
  onSelect,
  onOpenBrand,
}) {
  const rows = [...campaigns].sort((a, b) => (a.end_date ?? '').localeCompare(b.end_date ?? ''))

  if (rows.length === 0) {
    return (
      <div className="text-center py-12 bg-white border border-[#e0ddd4] rounded-2xl">
        <p className="text-[16px] font-medium text-[#888]">
          Sin tácticas para los filtros aplicados
        </p>
      </div>
    )
  }

  const th =
    'px-3 py-2.5 text-[12px] font-mono font-bold tracking-[0.14em] uppercase text-[#888] whitespace-nowrap'

  return (
    <div className="bg-white border border-[#e0ddd4] rounded-2xl overflow-hidden overflow-x-auto">
      <table className="w-full text-left min-w-[820px]">
        <thead>
          <tr className="border-b border-[#ece9df] bg-[#fafaf7]">
            <th className={th}>Marca</th>
            <th className={th}>Táctica</th>
            <th className={th}>Jefa</th>
            <th className={th}>Vence</th>
            <th className={th}>Días</th>
            <th className={th}>Avance</th>
            <th className={th}>Drive</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((c) => {
            const { done, total } = checklistCounts(c.checklist)
            const programada = isProgramada(c, today)
            const isLatest = latestByBrand.get(c.client_id)?.id === c.id
            const client = clientsById?.get(c.client_id)
            return (
              <tr
                key={c.id}
                onClick={() => onSelect(c)}
                className="border-b border-[#f0ede3] hover:bg-[#fafaf7] transition-colors cursor-pointer"
              >
                <td className="px-3 py-2.5 text-[14px] font-semibold text-[#111] whitespace-nowrap">
                  {c.client_id ? (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation()
                        onOpenBrand(c.client_id)
                      }}
                      className="hover:underline text-left"
                      aria-label={`Ver ficha de ${c.client}`}
                    >
                      <ClientCell name={c.client} logoUrl={client?.logo_url} />
                    </button>
                  ) : (
                    <ClientCell name={c.client} />
                  )}
                </td>
                <td className="px-3 py-2.5 text-[14px] text-[#333] max-w-[240px]">
                  <span className="font-medium">{c.name}</span>
                  {programada && (
                    <span className="block text-[11px] font-mono font-semibold text-[#1565c0] mt-0.5">
                      Programada · empieza el {fmtDate(c.start_date)}
                    </span>
                  )}
                </td>
                <td className="px-3 py-2.5 text-[14px] text-[#555] whitespace-nowrap">
                  {leadOf(c.client_id) ?? '—'}
                </td>
                <td className="px-3 py-2.5 text-[14px] text-[#333] whitespace-nowrap">
                  {fmtDate(c.end_date)}
                </td>
                <td className="px-3 py-2.5">
                  <DaysPill days={daysLeft(c, today)} />
                </td>
                <td className="px-3 py-2.5 text-[13px] font-mono font-semibold text-[#555] whitespace-nowrap">
                  {total > 0 ? `${done}/${total}` : '—'}
                </td>
                <td className="px-3 py-2.5 text-[14px] whitespace-nowrap">
                  {c.drive_url ? (
                    <a
                      href={c.drive_url}
                      target="_blank"
                      rel="noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      className="font-semibold text-[#111] underline decoration-[#FFB800] underline-offset-2"
                    >
                      Carpeta
                    </a>
                  ) : isLatest && canManage ? (
                    <span className="text-[12.5px] font-semibold text-[#c77700]">
                      Falta el link
                    </span>
                  ) : (
                    <span className="text-[#bbb]">—</span>
                  )}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
