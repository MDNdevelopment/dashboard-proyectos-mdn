import { useState } from 'react'
import { setFechaEntregaPauta, setFechaEntregaFormato } from './avPautasApi'
import {
  fechaEntregaInfo,
  formatDayShort,
  pautaErrorMessage,
  isoDateKey,
  FORMAT_LABELS,
  FORMAT_ICONS,
} from '../../utils/audiovisual'

const ATAJOS = [
  ['Mañana', 1],
  ['En 3 días', 3],
  ['En 1 semana', 7],
]

function sumarDias(hoy, dias) {
  const [y, m, d] = hoy.split('-').map(Number)
  return isoDateKey(new Date(y, m - 1, d + dias))
}

/**
 * Fecha de entrega de las piezas de UNA pauta realizada. Con un solo formato es un campo para
 * todos sus lotes; con varios, una fecha POR FORMATO (fotos para mañana, video para la semana
 * que viene) con atajos. El ajuste por lote va en la tabla de Edición. Se llena a mano: no hay
 * fecha supuesta. Editable para quien puede fijarla (`canEdit`), también si ya venció. Para el
 * resto, solo lectura. Un formato sin
 * lotes aún no tiene dónde guardar fecha: se le pone al asignar su primer editor.
 */
export default function FechaEntregaPauta({
  pauta,
  piezas,
  formats = [],
  canEdit,
  hoy,
  onPiezaChanged,
}) {
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)
  const global = fechaEntregaInfo(piezas, hoy)
  if (pauta.status !== 'realizada' || !global.tieneLotes) return null

  const porFormato = formats.length > 1
  const filas = porFormato ? formats : [null]

  async function guardar(formato, info, fecha) {
    if (fecha === (info.fecha ?? '')) return
    setError(null)
    setBusy(true)
    const { data, error: err } = formato
      ? await setFechaEntregaFormato(pauta.id, formato, fecha)
      : await setFechaEntregaPauta(pauta.id, fecha)
    setBusy(false)
    if (err) setError(pautaErrorMessage(err))
    else (data ?? []).forEach((row) => onPiezaChanged?.(row))
  }

  return (
    <div className="mb-3 space-y-1.5" data-testid="fecha-entrega-pauta">
      {filas.map((formato) => {
        const lotes = formato ? (piezas ?? []).filter((l) => l.formato === formato) : piezas
        const info = fechaEntregaInfo(lotes, hoy)
        if (!info.tieneLotes) {
          return (
            <div key={formato} className="text-[11.5px] text-[#999]">
              {FORMAT_ICONS[formato]} {FORMAT_LABELS[formato]}: asigna un editor para ponerle fecha.
            </div>
          )
        }
        const editable = canEdit
        const pendiente = !info.fecha && !info.mixta
        const nombre = formato ? FORMAT_LABELS[formato] : null
        return (
          <div key={formato ?? 'todas'} className="flex flex-wrap items-center gap-2">
            <span className="text-[10.5px] font-mono uppercase tracking-wide text-[#999]">
              {nombre ? `Entrega · ${FORMAT_ICONS[formato]} ${nombre}` : 'Fecha de entrega'}
            </span>
            {editable ? (
              <>
                <input
                  type="date"
                  className="input-base input-compact w-auto font-mono"
                  aria-label={
                    nombre ? `Fecha de entrega de ${nombre}` : 'Fecha de entrega de las piezas'
                  }
                  value={info.fecha ?? ''}
                  disabled={busy}
                  onChange={(e) => guardar(formato, info, e.target.value)}
                />
                {porFormato &&
                  ATAJOS.map(([texto, dias]) => (
                    <button
                      key={texto}
                      type="button"
                      disabled={busy}
                      onClick={() => guardar(formato, info, sumarDias(hoy, dias))}
                      className="px-2 py-0.5 rounded-full border border-[#e5e2d6] bg-white text-[11px] text-[#555] hover:border-[#FFB800]"
                      aria-label={`${texto}: entrega de ${nombre}`}
                    >
                      {texto}
                    </button>
                  ))}
              </>
            ) : (
              <span className="font-mono text-[13px] font-semibold text-[#333]">
                {info.mixta
                  ? 'varias fechas'
                  : info.fecha
                    ? formatDayShort(info.fecha)
                    : 'sin fecha'}
              </span>
            )}
            {info.mixta && editable && (
              <span className="text-[11px] text-[#999]">(varias fechas)</span>
            )}
            {editable && pendiente && (
              <span className="text-[11.5px] text-[#9a7400]">
                Pendiente: ponle fecha para que la edición se mida a tiempo.
              </span>
            )}
            {!canEdit && !info.vencida && !formato && (
              <span className="text-[11px] text-[#999]">
                La fija coordinación o la jefa de la línea.
              </span>
            )}
          </div>
        )
      })}
      {!canEdit && porFormato && (
        <div className="text-[11px] text-[#999]">La fija coordinación o la jefa de la línea.</div>
      )}
      {error && (
        <span className="text-[12px] text-red-700" role="alert">
          {error}
        </span>
      )}
    </div>
  )
}
