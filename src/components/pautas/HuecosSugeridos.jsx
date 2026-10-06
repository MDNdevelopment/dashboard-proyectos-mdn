import { useState } from 'react'
import DateInput from '../common/DateInput'
import { diasHabiles, sugerirHuecos, parseISODate, isoDateKey } from '../../utils/audiovisual'

const DOW = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb']
const MON = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']

const ESTADO_STYLE = {
  libre: 'border-[#e0ddd4] bg-white text-[#333] hover:border-[#111]',
  aviso: 'border-[#f3e2ad] bg-[#fdf4de] text-[#9a7400] hover:border-[#9a7400]',
  ocupado: 'border-[#f5c6c6] bg-[#fdecec] text-[#c0392b] line-through cursor-not-allowed',
}
const ESTADO_ICON = { libre: '', aviso: '⚠ ', ocupado: '✗ ' }

/**
 * Elegir fecha y hora viendo primero lo que está libre: 10 días hábiles como fichas (o
 * cualquier otra fecha) y, para el día elegido, las horas 08:00–17:00 marcadas según el
 * estudio / la carga de los recursos (`sugerirHuecos`). Controlado por `date` y `salida`.
 */
export default function HuecosSugeridos({
  pautas,
  clientId,
  lugarTipo,
  recursoIds,
  date,
  salida,
  onPickDate,
  onPickHora,
  today = new Date(),
}) {
  const dias = diasHabiles(today, 10)
  const [otra, setOtra] = useState(Boolean(date && !dias.includes(date)))
  const huecos = date ? sugerirHuecos(pautas, date, { clientId, lugarTipo, recursoIds }) : []
  const horaActual = salida ? String(salida).slice(0, 5) : null
  const minDate = isoDateKey(typeof today === 'string' ? parseISODate(today) : today)

  return (
    <div className="space-y-3">
      <div>
        <span className="block text-[11px] font-mono uppercase tracking-wide text-[#999] mb-1.5">
          ¿Qué día?
        </span>
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Días sugeridos">
          {dias.map((iso) => {
            const d = parseISODate(iso)
            const on = date === iso
            return (
              <button
                key={iso}
                type="button"
                aria-pressed={on}
                onClick={() => {
                  setOtra(false)
                  onPickDate(iso)
                }}
                className={`min-h-[44px] px-3 rounded-xl border text-[13px] font-semibold leading-tight transition-colors ${
                  on
                    ? 'bg-[#111] border-[#111] text-[#FFB800]'
                    : 'bg-white border-[#e0ddd4] text-[#333] hover:border-[#111]'
                }`}
              >
                <span className="block text-[10.5px] font-mono uppercase opacity-70">
                  {DOW[d.getDay()]}
                </span>
                {d.getDate()} {MON[d.getMonth()]}
              </button>
            )
          })}
          <button
            type="button"
            aria-pressed={otra}
            onClick={() => setOtra(true)}
            className={`min-h-[44px] px-3 rounded-xl border text-[13px] font-semibold transition-colors ${
              otra
                ? 'bg-[#111] border-[#111] text-[#FFB800]'
                : 'bg-white border-dashed border-[#c7c2b4] text-[#666] hover:border-[#111]'
            }`}
          >
            Otra fecha…
          </button>
        </div>
        {otra && (
          <div className="mt-2 max-w-[200px]">
            <DateInput
              value={date ?? ''}
              onChange={(iso) => onPickDate(iso || null)}
              min={minDate}
              id="wizard-otra-fecha"
            />
          </div>
        )}
      </div>

      {date && (
        <div>
          <span className="block text-[11px] font-mono uppercase tracking-wide text-[#999] mb-1.5">
            ¿A qué hora{lugarTipo === 'estudio' ? ' sale al estudio' : ' salen'}?
          </span>
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Horas sugeridas">
            {huecos.map((h) => {
              const on = horaActual === h.hora
              const ocupado = h.estado === 'ocupado'
              return (
                <button
                  key={h.hora}
                  type="button"
                  aria-pressed={on}
                  disabled={ocupado}
                  title={h.motivo ?? undefined}
                  aria-label={`${h.hora}${h.motivo ? ` · ${h.motivo}` : ''}`}
                  onClick={() => onPickHora(h.hora)}
                  className={`min-h-[44px] min-w-[72px] px-2 rounded-xl border text-[13px] font-mono font-semibold transition-colors ${
                    on ? 'bg-[#111] border-[#111] text-[#FFB800]' : ESTADO_STYLE[h.estado]
                  }`}
                >
                  {ESTADO_ICON[h.estado]}
                  {h.hora}
                </button>
              )
            })}
          </div>
          <p className="mt-1.5 text-[11.5px] text-[#999]">
            {lugarTipo === 'estudio'
              ? '✗ ocupado por otra pauta en el estudio · ⚠ otra solicitud pide esa hora'
              : '⚠ ese día todos los recursos ya tienen pautas; igual puedes pedirla'}
          </p>
        </div>
      )}
    </div>
  )
}
