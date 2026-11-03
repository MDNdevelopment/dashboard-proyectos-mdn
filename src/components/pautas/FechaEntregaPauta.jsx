import { useState } from 'react'
import { setFechaEntregaPauta } from './avPautasApi'
import { fechaEntregaInfo, formatDayShort, pautaErrorMessage } from '../../utils/audiovisual'

/**
 * Fecha de entrega de las piezas de UNA pauta realizada (un solo campo para todos sus lotes;
 * el ajuste por lote va en la tabla de Edición). Se llena a mano: no hay fecha supuesta.
 * Editable para quien puede fijarla (`canEdit`); una fecha ya vencida solo la mueve la jefa de
 * la línea (`canMoveVencida`). Para el resto, solo lectura.
 */
export default function FechaEntregaPauta({
  pauta,
  piezas,
  canEdit,
  canMoveVencida = false,
  hoy,
  onPiezaChanged,
}) {
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)
  const info = fechaEntregaInfo(piezas, hoy)
  if (pauta.status !== 'realizada' || !info.tieneLotes) return null

  async function guardar(fecha) {
    if (fecha === (info.fecha ?? '')) return
    setError(null)
    setBusy(true)
    const { data, error: err } = await setFechaEntregaPauta(pauta.id, fecha)
    setBusy(false)
    if (err) setError(pautaErrorMessage(err))
    else (data ?? []).forEach((row) => onPiezaChanged?.(row))
  }

  const editable = canEdit && (!info.vencida || canMoveVencida)
  const pendiente = !info.fecha && !info.mixta
  return (
    <div className="mb-3 flex flex-wrap items-center gap-2" data-testid="fecha-entrega-pauta">
      <span className="text-[10.5px] font-mono uppercase tracking-wide text-[#999]">
        Fecha de entrega
      </span>
      {editable ? (
        <input
          type="date"
          className="input-base input-compact w-auto font-mono"
          aria-label="Fecha de entrega de las piezas"
          value={info.fecha ?? ''}
          disabled={busy}
          onChange={(e) => guardar(e.target.value)}
        />
      ) : (
        <span className="font-mono text-[13px] font-semibold text-[#333]">
          {info.mixta ? 'varias fechas' : info.fecha ? formatDayShort(info.fecha) : 'sin fecha'}
        </span>
      )}
      {info.mixta && editable && <span className="text-[11px] text-[#999]">(varias fechas)</span>}
      {editable && pendiente && (
        <span className="text-[11.5px] text-[#9a7400]">
          Pendiente: ponle fecha para que la edición se mida a tiempo.
        </span>
      )}
      {info.vencida && !canMoveVencida && (
        <span className="text-[11.5px] text-[#c0392b]">
          Ya venció: solo la jefa de la línea puede cambiarla.
        </span>
      )}
      {!canEdit && !info.vencida && (
        <span className="text-[11px] text-[#999]">La fija coordinación o la jefa de la línea.</span>
      )}
      {error && (
        <span className="text-[12px] text-red-700" role="alert">
          {error}
        </span>
      )}
    </div>
  )
}
