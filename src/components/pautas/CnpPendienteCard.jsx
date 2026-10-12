import { COL_META, isLate } from '../tareas/constants'
import { cnpPieceCount, cnpPiecesDelivered } from '../cnp/constants'
import { clientDisplayName } from '../../utils/rowClients'
import { formatDayShort } from '../../utils/audiovisual'

/**
 * Tarjeta compacta de un CNP audiovisual pendiente (panel de "piezas atrasadas"):
 * título, marcas, estado, entrega y piezas entregadas. Clic → abre el CNP en su módulo.
 */
export default function CnpPendienteCard({ cnp, clientsById, usersById, onClick }) {
  const meta = COL_META[cnp.status] ?? { color: '#999', textColor: '#fff' }
  const late = isLate(cnp)
  const asignado = usersById?.get(cnp.assignee_id)
  const total = cnpPieceCount(cnp)
  const entregadas = cnpPiecesDelivered(cnp)

  return (
    <button
      type="button"
      onClick={() => onClick?.(cnp)}
      aria-label={`CNP ${cnp.title ?? 'sin título'} · ${cnp.status}`}
      className="w-full text-left rounded-xl border border-[#e8e4d8] bg-white px-3 py-2.5 transition-colors hover:border-[#111]"
    >
      <div className="flex items-center justify-between gap-2">
        <span
          className={`font-mono text-[12px] ${late ? 'text-[#c0392b] font-semibold' : 'text-[#555]'}`}
        >
          {cnp.due_date ? `Entrega ${formatDayShort(cnp.due_date)}` : 'sin fecha de entrega'}
        </span>
        <span
          className="text-[10.5px] font-semibold px-2 py-0.5 rounded-full"
          style={{ background: meta.color, color: meta.textColor }}
        >
          {cnp.status}
        </span>
      </div>
      <div className="text-[13.5px] font-semibold text-[#111] truncate mt-0.5">
        {cnp.title || 'Sin título'}
      </div>
      <div className="flex items-center justify-between gap-2 mt-1 text-[11px] text-[#999]">
        <span className="truncate">
          {clientDisplayName(cnp, clientsById)}
          {asignado ? ` · ${asignado.first_name ?? ''}`.trimEnd() : ''}
        </span>
        <span className="font-mono shrink-0">
          {entregadas}/{total} piezas
        </span>
      </div>
    </button>
  )
}
