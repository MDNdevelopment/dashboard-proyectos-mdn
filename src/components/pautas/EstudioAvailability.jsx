import {
  estudioConflicts,
  estudioSlotsForDay,
  studioWindow,
  formatTime12,
  STUDIO_WINDOW_HOURS,
} from '../../utils/audiovisual'

/**
 * Disponibilidad del Estudio MDN para una fecha/hora candidata, calculada en vivo sobre las
 * pautas en memoria (ver `estudioConflicts`). Pinta la ocupación del día y un veredicto:
 * libre, choque bloqueante (no se puede guardar) o aviso (solicitud pendiente / pauta sin
 * hora). El padre decide si bloquea el guardado leyendo `estudioConflicts` por su cuenta;
 * este componente es solo presentación.
 */
export default function EstudioAvailability({ pautas, date, salida, clientId, excludeId }) {
  if (!date) {
    return (
      <p className="text-[12.5px] text-[#888]" data-testid="estudio-availability">
        Elige la fecha para ver la disponibilidad del estudio.
      </p>
    )
  }
  const slots = estudioSlotsForDay(pautas, date, excludeId)
  const { blocking, warnings } = estudioConflicts(pautas, { date, salida, clientId, excludeId })
  const mine = studioWindow(salida)

  return (
    <div
      className="rounded-xl border border-[#e8e4d8] bg-[#faf9f5] px-3 py-2.5"
      data-testid="estudio-availability"
    >
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-[11px] font-mono uppercase tracking-wide text-[#999]">
          Estudio MDN · ocupación del día
        </span>
        <span className="text-[11px] text-[#aaa]">cada pauta ocupa {STUDIO_WINDOW_HOURS}h</span>
      </div>

      {slots.length === 0 ? (
        <p className="text-[12.5px] text-[#555]">Nadie ha reservado el estudio ese día.</p>
      ) : (
        <ul className="space-y-1">
          {slots.map(({ pauta, start, end, status }) => (
            <li key={pauta.id} className="flex items-center gap-2 text-[12.5px]">
              <span
                className={`inline-block w-2 h-2 rounded-full ${
                  status === 'solicitada' ? 'bg-[#e0b23d]' : 'bg-[#3b6fd4]'
                }`}
              />
              <span className="font-mono text-[#555] min-w-[120px]">
                {start ? `${formatTime12(start)} – ${formatTime12(end)}` : 'sin hora'}
              </span>
              <span className="text-[#111] truncate">{pauta.client_name || 'Sin cliente'}</span>
              {status === 'solicitada' && (
                <span className="text-[10.5px] font-mono uppercase text-[#b98900]">solicitud</span>
              )}
            </li>
          ))}
        </ul>
      )}

      <div className="mt-2 text-[12.5px]">
        {!salida ? (
          <span className="text-[#888]">Indica la hora de salida para validar el horario.</span>
        ) : blocking.length > 0 ? (
          <span className="text-[#c0392b] font-semibold" role="alert">
            Ocupado: choca con {blocking[0].pauta.client_name || 'otra pauta'} (
            {formatTime12(studioWindow(blocking[0].pauta.salida).start)} –{' '}
            {formatTime12(studioWindow(blocking[0].pauta.salida).end)}). Elige otra hora.
          </span>
        ) : (
          <span className="text-[#1f8a43] font-semibold">
            Libre de {formatTime12(mine.start)} a {formatTime12(mine.end)}.
          </span>
        )}
        {warnings.map(({ kind, pauta }) => (
          <div key={`${kind}-${pauta.id}`} className="text-[#b98900] mt-0.5">
            {kind === 'solicitada'
              ? `Aviso: ${pauta.client_name || 'otra línea'} también pidió el estudio a esa hora (solicitud pendiente).`
              : `Aviso: ${pauta.client_name || 'otra pauta'} tiene el estudio ese día sin hora definida.`}
          </div>
        ))}
      </div>
    </div>
  )
}
