import { ASSUMED_DURATION_HOURS, formatTime12 } from '../../utils/audiovisual'

/**
 * Avisos NO bloqueantes al asignar un recurso (`resourceConflicts` en utils/audiovisual.js).
 * El usuario puede confirmar y guardar igual. Dos tipos:
 *   - `daily_limit`      — el recurso queda con RESOURCE_DAILY_LIMIT o más pautas ese día.
 *   - `probable_overlap` — choca con otra pauta solo al asumir ASSUMED_DURATION_HOURS para
 *                          la que no tiene hora de cierre. Al depender de una suposición se
 *                          pregunta en vez de bloquear (los choques ciertos ni llegan acá:
 *                          se bloquean en AvPhaseTable).
 *
 * Distinto de ConfirmDeleteDialog (que exige tipear el nombre): acá no hay nada
 * irreversible, solo un chequeo antes de un guardado que puede repetirse varias veces al día.
 *
 * Props:
 *   warnings   — array de resourceConflicts (ver `kind` arriba)
 *   dateLabel  — '4 sep' (formatDayShort del caller) para el mensaje
 *   onConfirm  — el usuario decide asignar igual
 *   onCancel   — cierra sin guardar
 */
function warningText(w, dateLabel) {
  if (w.kind === 'probable_overlap') {
    const otra = w.pauta.client_name || 'otra pauta'
    const desde = formatTime12(w.pauta.salida) || '—'
    return w.pauta.llegada ? (
      <>
        <strong>{w.name}</strong> podría chocar con la pauta de {otra} ({desde} –{' '}
        {formatTime12(w.pauta.llegada)}) el {dateLabel}. ¿Asignar igual?
      </>
    ) : (
      <>
        <strong>{w.name}</strong> tiene la pauta de {otra} a las {desde} el {dateLabel}, sin hora de
        cierre. Asumiendo {ASSUMED_DURATION_HOURS} horas, se solaparían. ¿Asignar igual?
      </>
    )
  }
  return (
    <>
      <strong>{w.name}</strong> quedaría con {w.count} pautas el {dateLabel}. ¿Asignar igual?
    </>
  )
}

export default function ResourceWarningDialog({ warnings, dateLabel, onConfirm, onCancel }) {
  const soloSolapes = warnings.every((w) => w.kind === 'probable_overlap')
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/25 backdrop-blur-[3px]">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-[#ece9df] flex-shrink-0">
          <h2 className="text-[18px] font-bold text-[#111]">
            {soloSolapes ? 'Posible choque de horario' : 'Recurso con varias pautas'}
          </h2>
          <button
            type="button"
            onClick={onCancel}
            className="w-7 h-7 flex items-center justify-center rounded-lg text-[#999] hover:text-[#111] hover:bg-[#f0ede3] transition-colors"
            aria-label="Cerrar"
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 14 14"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
            >
              <path d="M2 2l10 10M12 2L2 12" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-5 space-y-3">
          {warnings.map((w) => (
            <div
              key={`${w.kind}:${w.resourceId}`}
              className="px-3 py-2 rounded-lg bg-[#fdf4de] text-[#9a7400] text-[13.5px]"
            >
              {warningText(w, dateLabel)}
            </div>
          ))}

          <div className="flex items-center justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={onCancel}
              className="px-4 py-2 rounded-xl text-[15px] font-semibold text-[#555] border border-[#e0ddd4] hover:bg-[#f5f3eb] transition-colors"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={onConfirm}
              className="px-4 py-2 rounded-xl text-[15px] font-bold bg-[#FFB800] text-[#111] hover:brightness-95 transition-colors"
            >
              Asignar igual
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
