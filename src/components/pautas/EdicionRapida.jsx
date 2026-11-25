import { useState } from 'react'
import StatusPill from '../common/StatusPill'
import useVideosDeLote from '../../hooks/useVideosDeLote'
import { BigStepper } from './CapturaRapida'
import { updatePieza } from './avPautasApi'
import {
  FORMAT_LABELS,
  FORMAT_ICONS,
  FOTO_FORMAT,
  PIEZA_STATUS_LABELS,
  PIEZA_STATUS_META,
  PIEZA_STATUS_ORDER,
  formatDayShort,
  planLoteChange,
  pautaErrorMessage,
  siguienteEstadoVideo,
} from '../../utils/audiovisual'

/**
 * Un lote propio por entregar. Video y Reel llevan el estado de cada video; las fotos se
 * llevan por cantidad (listas / asignadas), porque un lote puede tener cientos y no tiene
 * sentido darle estado a cada una.
 */
export default function EdicionRapida({ lote, ...props }) {
  return lote.formato === FOTO_FORMAT ? (
    <EdicionRapidaFoto lote={lote} {...props} />
  ) : (
    <EdicionRapidaVideos lote={lote} {...props} />
  )
}

/**
 * Un lote propio por entregar: listas / asignadas con −/+ y "todo listo". Pasa por
 * `planLoteChange` (listas nunca supera cantidad) y `updatePieza`, como el detalle.
 */
function EdicionRapidaFoto({ lote, pauta, onPiezaChanged, onPautaClick }) {
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)
  const cantidad = Number(lote.cantidad) || 0
  const listas = Number(lote.listas) || 0
  const label = `listas de ${FORMAT_LABELS[lote.formato] ?? lote.formato} de ${pauta.client_name ?? 'pauta'}`

  async function mover(delta) {
    const plan = planLoteChange({ lote, key: 'listas', delta })
    if (plan.action !== 'update') return
    setError(null)
    setBusy(true)
    const { data, error: err } = await updatePieza(lote.id, plan.fields)
    setBusy(false)
    if (err) setError(pautaErrorMessage(err))
    else if (data) onPiezaChanged(data)
  }

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
        <BigStepper value={listas} max={cantidad} label={label} onChange={mover} />
      </div>
      <div className="mt-2 flex items-center gap-2">
        <span className="flex-1 h-[6px] rounded-full bg-[#ece9df] overflow-hidden">
          <span
            className="block h-full bg-[#1f8a43]"
            style={{ width: `${cantidad ? Math.round((listas / cantidad) * 100) : 0}%` }}
          />
        </span>
        <button
          type="button"
          disabled={busy || listas >= cantidad}
          onClick={() => mover(cantidad - listas)}
          className="min-h-[36px] px-3 rounded-lg text-[12.5px] font-semibold text-[#1f8a43] border border-[#cfe8d6] hover:bg-[#edf7f0] disabled:opacity-30"
        >
          ✓ todo listo
        </button>
      </div>
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

/**
 * Un lote propio por entregar: sus videos con el estado de cada uno y un toque para avanzar
 * (Pendiente → En edición → Espera de aprobación → Listo). `listas` del lote lo recalcula el
 * trigger `av_pauta_videos_sync_listas`, así que aquí solo se escribe el estado del video.
 */
function EdicionRapidaVideos({ lote, pauta, onPautaClick }) {
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
