import { useState } from 'react'
import { setFechaEntregaPauta } from './avPautasApi'
import { fechaEntregaInfo, formatDayShort, pautaErrorMessage } from '../../utils/audiovisual'

/** Chip "sin confirmar": la fecha es la supuesta por defecto (pauta + 7 días). */
export function SinConfirmarChip() {
  return (
    <span
      className="inline-flex items-center px-1.5 py-0.5 rounded-full bg-[#fdf4de] text-[#9a7400] border border-[#f3e2ad] text-[10px] font-mono uppercase tracking-wide"
      title="Fecha supuesta (7 días después de la pauta). Confírmala o muévela."
    >
      sin confirmar
    </span>
  )
}

/**
 * Fecha de entrega de las piezas de UNA pauta realizada (un solo campo para todos sus lotes;
 * el ajuste por lote va en la tabla de Edición). Editable solo para quien puede fijarla
 * (`canEdit`) y mientras ninguna fecha haya vencido; para el resto, solo lectura.
 */
export default function FechaEntregaPauta({ pauta, piezas, canEdit, hoy, onPiezaChanged }) {
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)
  const info = fechaEntregaInfo(piezas, hoy)
  if (pauta.status !== 'realizada' || !info.tieneLotes) return null

  async function guardar(fecha, confirmar = false) {
    if (!fecha || (fecha === info.fecha && !confirmar)) return
    setError(null)
    setBusy(true)
    const { data, error: err } = await setFechaEntregaPauta(pauta.id, fecha)
    setBusy(false)
    if (err) setError(pautaErrorMessage(err))
    else (data ?? []).forEach((row) => onPiezaChanged?.(row))
  }

  const editable = canEdit && !info.vencida
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
          min={hoy}
          disabled={busy}
          onChange={(e) => guardar(e.target.value)}
        />
      ) : (
        <span className="font-mono text-[13px] font-semibold text-[#333]">
          {info.mixta ? 'varias fechas' : info.fecha ? formatDayShort(info.fecha) : 'sin fecha'}
        </span>
      )}
      {info.mixta && editable && <span className="text-[11px] text-[#999]">(varias fechas)</span>}
      {info.fecha && !info.confirmada && <SinConfirmarChip />}
      {editable && info.fecha && !info.confirmada && (
        <button
          type="button"
          disabled={busy}
          onClick={() => guardar(info.fecha, true)}
          className="text-[11.5px] font-semibold text-[#2563eb] hover:underline disabled:opacity-50"
        >
          Confirmar fecha
        </button>
      )}
      {info.vencida && (
        <span className="text-[11.5px] text-[#c0392b]">
          Ya venció: una fecha vencida no se puede mover.
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
