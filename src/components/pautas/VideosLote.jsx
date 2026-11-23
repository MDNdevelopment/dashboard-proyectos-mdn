import { useState } from 'react'
import StatusPill from '../common/StatusPill'
import useVideosDeLote from '../../hooks/useVideosDeLote'
import {
  PIEZA_STATUS_META,
  PIEZA_STATUS_ORDER,
  resumenEstadosVideos,
} from '../../utils/audiovisual'

/**
 * Estado de cada video de un lote (`av_pauta_videos`). El lote sigue contando `listas` solo:
 * un trigger lo iguala a los videos en "Listo", así que aquí nunca se escribe `listas`.
 * `editable` = quien puede mover los estados de ese editor (`canActOnEditorGroup`).
 */
export default function VideosLote({ lote, etiqueta, editable, puedeCancelar = false }) {
  const { videos, loading, error, actualizar } = useVideosDeLote(lote.id, lote.cantidad)
  const [abierto, setAbierto] = useState(false)
  const resumen = resumenEstadosVideos(videos)
  const hayCancelados = videos.some((v) => v.status === 'cancelado')
  const opciones = puedeCancelar
    ? PIEZA_STATUS_ORDER
    : PIEZA_STATUS_ORDER.filter((s) => s !== 'cancelado')

  return (
    <div className="mt-1.5">
      <button
        type="button"
        onClick={() => setAbierto((v) => !v)}
        aria-expanded={abierto}
        aria-label={`${abierto ? 'Ocultar' : 'Ver'} videos de ${etiqueta}`}
        className="text-left text-[11.5px] font-semibold text-[#2563eb] hover:underline"
      >
        {abierto ? '▾' : '▸'} {loading ? 'videos…' : resumen || 'videos'}
      </button>
      {abierto && (
        <ul className="mt-1.5 space-y-1" aria-label={`Videos de ${etiqueta}`}>
          {videos.map((v, i) => (
            <VideoItem
              key={`${v.id}-${v.nombre ?? ''}`}
              opciones={v.status === 'cancelado' ? PIEZA_STATUS_ORDER : opciones}
              video={v}
              indice={i + 1}
              editable={editable}
              onChange={(fields) => actualizar(v.id, fields)}
            />
          ))}
          {hayCancelados && (
            <li className="text-[11px] text-[#999]">
              Un video cancelado no cuenta como listo: baja las asignadas para quitarlo del lote.
            </li>
          )}
          {error && (
            <li role="alert" className="text-[11.5px] text-red-700">
              {error}
            </li>
          )}
        </ul>
      )}
    </div>
  )
}

function VideoItem({ video, indice, editable, opciones, onChange }) {
  const [nombre, setNombre] = useState(video.nombre ?? '')
  return (
    <li className="flex items-center gap-2">
      <span className="w-5 text-[10.5px] font-mono text-[#aaa]">{indice}</span>
      {editable ? (
        <input
          className="input-base input-compact flex-1 min-w-[90px]"
          value={nombre}
          placeholder={`Video ${indice}`}
          aria-label={`Nombre del video ${indice}`}
          onChange={(e) => setNombre(e.target.value)}
          onBlur={() => nombre !== (video.nombre ?? '') && onChange({ nombre })}
        />
      ) : (
        <span className="flex-1 text-[12px] text-[#333] truncate">
          {video.nombre || `Video ${indice}`}
        </span>
      )}
      <StatusPill
        value={video.status}
        meta={PIEZA_STATUS_META}
        options={opciones}
        editable={editable}
        size="sm"
        onChange={(status) => onChange({ status })}
      />
    </li>
  )
}
