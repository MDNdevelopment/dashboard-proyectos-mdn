import DateInput from '../common/DateInput'
import EstudioAvailability from './EstudioAvailability'
import { LUGAR_TIPOS, LUGAR_LABELS } from '../../utils/audiovisual'

/**
 * Bloque "Cuándo y dónde" compartido por el formulario de solicitud, Agendar y Reagendar:
 * fecha, hora de salida/llegada y tipo de lugar (Estudio MDN con disponibilidad en vivo, o
 * locación con texto libre). Controlado: `value` trae los campos y `onChange(field, v)`.
 */
export default function PautaCuandoDondeFields({
  value,
  onChange,
  pautas,
  clientId,
  excludeId,
  dateLabel = 'Fecha',
  dateRequired = false,
}) {
  const esEstudio = value.lugar_tipo === 'estudio'
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div>
          <label className="block text-[11px] font-mono uppercase tracking-wide text-[#999] mb-1">
            {dateLabel}
            {(dateRequired || esEstudio) && <span className="text-[#c0392b]"> *</span>}
          </label>
          <DateInput
            value={value.pauta_date ?? ''}
            onChange={(iso) => onChange('pauta_date', iso || null)}
            id="pauta-fecha"
          />
        </div>
        <div>
          <label
            htmlFor="pauta-salida"
            className="block text-[11px] font-mono uppercase tracking-wide text-[#999] mb-1"
          >
            Salida{esEstudio && <span className="text-[#c0392b]"> *</span>}
          </label>
          <input
            id="pauta-salida"
            type="time"
            className="input-base"
            value={value.salida ? String(value.salida).slice(0, 5) : ''}
            onChange={(e) => onChange('salida', e.target.value || null)}
          />
        </div>
        <div>
          <label
            htmlFor="pauta-llegada"
            className="block text-[11px] font-mono uppercase tracking-wide text-[#999] mb-1"
          >
            Llegada
          </label>
          <input
            id="pauta-llegada"
            type="time"
            className="input-base"
            value={value.llegada ? String(value.llegada).slice(0, 5) : ''}
            onChange={(e) => onChange('llegada', e.target.value || null)}
          />
        </div>
      </div>

      <div>
        <span className="block text-[11px] font-mono uppercase tracking-wide text-[#999] mb-1">
          Lugar
        </span>
        <div className="flex gap-1.5" role="radiogroup" aria-label="Tipo de lugar">
          {LUGAR_TIPOS.map((tipo) => {
            const on = (value.lugar_tipo ?? 'locacion') === tipo
            return (
              <button
                key={tipo}
                type="button"
                role="radio"
                aria-checked={on}
                onClick={() => onChange('lugar_tipo', tipo)}
                className={`px-3 py-1.5 rounded-lg text-[13px] font-semibold border transition-colors ${
                  on
                    ? 'bg-[#111] border-[#111] text-[#FFB800]'
                    : 'bg-white border-[#e0ddd4] text-[#555] hover:border-[#111]'
                }`}
              >
                {LUGAR_LABELS[tipo]}
              </button>
            )
          })}
        </div>
        {!esEstudio && (
          <input
            className="input-base mt-2"
            value={value.place ?? ''}
            onChange={(e) => onChange('place', e.target.value)}
            placeholder="¿Dónde? (dirección, local, exterior…)"
            aria-label="Locación"
          />
        )}
      </div>

      {esEstudio && (
        <EstudioAvailability
          pautas={pautas}
          date={value.pauta_date}
          salida={value.salida}
          clientId={clientId}
          excludeId={excludeId}
        />
      )}
    </div>
  )
}
