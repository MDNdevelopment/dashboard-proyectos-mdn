import HuecosSugeridos from './HuecosSugeridos'
import { LUGAR_TIPOS, LUGAR_LABELS } from '../../utils/audiovisual'

/**
 * Paso 2 del asistente: Estudio MDN o locación, y fecha/hora eligiendo un hueco libre.
 * "Sin fecha fija" deja la fecha en blanco para que coordinación la ubique (no aplica al
 * estudio: ahí la hora es la reserva).
 */
export default function WizardPasoCuando({
  values,
  set,
  pautas,
  recursoIds,
  conflicts,
  sinFecha,
  onSinFecha,
  today,
}) {
  const esEstudio = values.lugar_tipo === 'estudio'
  return (
    <div className="space-y-5">
      <section>
        <h3 className="text-[11.5px] font-mono font-bold uppercase tracking-[0.1em] text-[#aaa] mb-2">
          ¿Dónde?
        </h3>
        <div className="grid grid-cols-2 gap-1.5" role="radiogroup" aria-label="Tipo de lugar">
          {LUGAR_TIPOS.map((tipo) => {
            const on = values.lugar_tipo === tipo
            return (
              <button
                key={tipo}
                type="button"
                role="radio"
                aria-checked={on}
                onClick={() => {
                  set('lugar_tipo', tipo)
                  if (tipo === 'estudio' && sinFecha) onSinFecha(false)
                }}
                className={`min-h-[48px] rounded-xl border text-[14px] font-semibold transition-colors ${
                  on
                    ? 'bg-[#111] border-[#111] text-[#FFB800]'
                    : 'bg-white border-[#e0ddd4] text-[#555] hover:border-[#111]'
                }`}
              >
                {tipo === 'estudio' ? '◉ ' : '📍 '}
                {LUGAR_LABELS[tipo]}
              </button>
            )
          })}
        </div>
        {!esEstudio && (
          <input
            className="input-base mt-2 min-h-[44px]"
            value={values.place ?? ''}
            onChange={(e) => set('place', e.target.value)}
            placeholder="¿Dónde? (dirección, local, exterior…)"
            aria-label="Locación"
          />
        )}
      </section>

      <section>
        <div className="flex items-center justify-between gap-2 mb-2">
          <h3 className="text-[11.5px] font-mono font-bold uppercase tracking-[0.1em] text-[#aaa]">
            ¿Cuándo?
          </h3>
          <label
            className={`flex items-center gap-2 text-[12.5px] select-none ${
              esEstudio ? 'text-[#bbb] cursor-not-allowed' : 'text-[#555] cursor-pointer'
            }`}
            title={esEstudio ? 'El estudio se reserva con fecha y hora' : undefined}
          >
            <input
              type="checkbox"
              checked={sinFecha}
              disabled={esEstudio}
              onChange={(e) => onSinFecha(e.target.checked)}
            />
            Sin fecha fija — que coordine Lizdania
          </label>
        </div>
        {sinFecha ? (
          <p className="text-[12.5px] text-[#888] rounded-xl border border-dashed border-[#e0ddd4] px-3 py-3">
            Coordinación le pondrá fecha según la disponibilidad de los recursos.
          </p>
        ) : (
          <HuecosSugeridos
            pautas={pautas}
            clientId={values.client_id}
            lugarTipo={values.lugar_tipo}
            recursoIds={recursoIds}
            date={values.pauta_date}
            salida={values.salida}
            onPickDate={(iso) => {
              set('pauta_date', iso)
              set('salida', null)
            }}
            onPickHora={(hora) => set('salida', hora)}
            today={today}
          />
        )}
        {conflicts.blocking.length > 0 && (
          <p className="mt-2 text-[12.5px] text-[#c0392b]" role="alert">
            ✗ A esa hora el estudio ya está reservado por{' '}
            {conflicts.blocking[0].pauta.client_name ?? 'otra pauta'}. Elige otra hora.
          </p>
        )}
        {conflicts.blocking.length === 0 && conflicts.warnings.length > 0 && (
          <p className="mt-2 text-[12.5px] text-[#9a7400]">
            ⚠ Otra solicitud también pidió el estudio a esa hora; coordinación decidirá.
          </p>
        )}
      </section>
    </div>
  )
}
