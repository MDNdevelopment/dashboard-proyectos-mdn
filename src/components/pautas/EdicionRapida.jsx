import StatusPill from '../common/StatusPill'
import useVideosDeLote from '../../hooks/useVideosDeLote'
import {
  FORMAT_LABELS,
  FORMAT_ICONS,
  PIEZA_STATUS_LABELS,
  PIEZA_STATUS_META,
  PIEZA_STATUS_ORDER,
  formatDayShort,
  siguienteEstadoVideo,
} from '../../utils/audiovisual'

/**
 * Un lote propio por entregar: sus videos con el estado de cada uno y un toque para avanzar
 * (Pendiente → En edición → Espera de aprobación → Listo). `listas` del lote lo recalcula el
 * trigger `av_pauta_videos_sync_listas`, así que aquí solo se escribe el estado del video.
 */
export default function EdicionRapida({ lote, pauta, onPautaClick }) {
  const { videos, error, actualizar } = useVideosDeLote(lote.id, lote.cantidad)
  const cantidad = Number(lote.cantidad) || 0
  const listas = Number(lote.listas) || 0
  const formato = FORMAT_LABELS[lote.formato] ?? lote.formato

  return (
    <li className="rounded-2xl border border-[#e8e4d8] bg-white px-4 py-3">
      <div className="flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={() => onPautaClick?.(pauta)}
          className="min-w-0 text-left"
          aria-label={`Ver pauta ${pauta.client_name ?? ''}`}
        >
          <p className="text-[14px] font-bold text-[#111] truncate">
            {pauta.client_name ?? 'Sin cliente'}
            <span className="font-mono font-normal text-[12px] text-[#999]">
              {pauta.pauta_date ? ` · ${formatDayShort(pauta.pauta_date)}` : ''}
            </span>
          </p>
          <p className="text-[12.5px] text-[#666]">
            {FORMAT_ICONS[lote.formato]} {FORMAT_LABELS[lote.formato] ?? lote.formato} ·{' '}
            <span className="font-mono">
              <strong className="text-[#111]">{listas}</strong>/{cantidad}
            </span>{' '}
            listas
          </p>
        </button>
      </div>
      <div className="mt-2 flex items-center gap-2">
        <span className="flex-1 h-[6px] rounded-full bg-[#ece9df] overflow-hidden">
          <span
            className="block h-full bg-[#1f8a43]"
            style={{ width: `${cantidad ? Math.round((listas / cantidad) * 100) : 0}%` }}
          />
        </span>
      </div>
      <ul
        className="mt-3 space-y-2"
        aria-label={`Videos de ${formato} de ${pauta.client_name ?? 'pauta'}`}
      >
        {videos.map((v, i) => {
          const siguiente = siguienteEstadoVideo(v.status)
          return (
            <li key={v.id} className="flex items-center gap-2">
              <span className="flex-1 min-w-0 text-[13px] text-[#333] truncate">
                {v.nombre || `Video ${i + 1}`}
              </span>
              <StatusPill
                value={v.status}
                meta={PIEZA_STATUS_META}
                options={PIEZA_STATUS_ORDER.filter(
                  (s) => s !== 'cancelado' || v.status === 'cancelado',
                )}
                editable
                size="sm"
                onChange={(status) => actualizar(v.id, { status })}
              />
              {siguiente && (
                <button
                  type="button"
                  onClick={() => actualizar(v.id, { status: siguiente })}
                  aria-label={`Pasar video ${i + 1} a ${PIEZA_STATUS_LABELS[siguiente]}`}
                  className="min-h-[36px] px-3 rounded-lg text-[12.5px] font-semibold text-[#1f8a43] border border-[#cfe8d6] hover:bg-[#edf7f0]"
                >
                  →
                </button>
              )}
            </li>
          )
        })}
      </ul>
      {error && (
        <div
          className="mt-2 px-3 py-2 rounded-lg bg-red-50 text-red-700 text-[12.5px]"
          role="alert"
        >
          {error}
        </div>
      )}
    </li>
  )
}
