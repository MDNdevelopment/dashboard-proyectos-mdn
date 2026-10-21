import { formatTime12 } from '../../utils/audiovisual'

/**
 * "Es la misma salida" — el único lugar donde se afirma que varias pautas son UNA grabación.
 *
 * Una pauta de grupo (p. ej. las 5 cuentas de San Lucas) es una fila de `av_pautas` por
 * cuenta, todas a la misma hora. Sin este dato el recurso aparecía con 5 pautas ese día y, a
 * partir de la segunda cuenta, asignarlo quedaba BLOQUEADO por choque de horario. Al marcar la
 * casilla las pautas comparten `sesion_id` y pasan a contar como una sola salida (ver
 * `salidasVinculables` y `mismaSesion` en utils/audiovisual.js).
 *
 * Props:
 *   opciones  — `salidasVinculables(candidate, sameDayPautas)`
 *   value     — `key` de la opción marcada, o null
 *   onChange  — (key|null)
 */
export default function MismaSalidaPicker({ opciones, value, onChange }) {
  if (!opciones?.length) return null
  return (
    <div className="rounded-xl border border-[#f0e3bd] bg-[#fdf9ef] px-3 py-2.5 space-y-1.5">
      <span className="block font-mono uppercase tracking-wide text-[#9a7400] text-[10.5px]">
        ¿Es la misma salida?
      </span>
      {opciones.map((o) => (
        <label key={o.key} className="flex items-start gap-2 text-[13px] text-[#555]">
          <input
            type="checkbox"
            className="mt-0.5 accent-[#FFB800]"
            checked={value === o.key}
            onChange={(e) => onChange(e.target.checked ? o.key : null)}
          />
          <span>
            Se graba junto con <strong className="text-[#111]">{o.label}</strong>
            {o.pautas[0]?.salida ? ` (${formatTime12(o.pautas[0].salida)})` : ''} — cuenta como una
            sola salida del recurso.
          </span>
        </label>
      ))}
    </div>
  )
}
