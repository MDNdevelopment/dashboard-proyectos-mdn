import { ISL_OPCIONES, IVA_RET_OPCIONES } from '../../utils/retenciones'

/**
 * Los tres checks de retención (ISL, IVA, municipal) con sus selectores de tasa.
 *
 * Vive en un archivo propio porque se marca en el momento del COBRO —ahí el
 * cliente entrega su comprobante de retención— y no al configurar la marca ni
 * al emitir la factura: un mismo cliente varía el ISLR entre 2% y 5% de un mes
 * a otro, así que una configuración fija en su perfil envejece mal y se acaba
 * aplicando la tasa equivocada "porque ya venía puesta".
 *
 * Props:
 *   value      — config normalizada { isl, islRate, iva, ivaRate, municipal }
 *   onChange   — (patch) => void, parche parcial sobre la config
 *   disabled   — solo lectura (mes cerrado, o consultar un cobro ya hecho)
 *   idPrefix   — para no colisionar si hubiera dos instancias en la página
 */
export default function RetencionesFields({ value, onChange, disabled = false, idPrefix = 'ret' }) {
  return (
    <div className="space-y-2.5">
      <RetencionCheck
        id={`${idPrefix}-isl`}
        label="ISL"
        activa={value.isl}
        rate={value.islRate}
        opciones={ISL_OPCIONES}
        disabled={disabled}
        // Al activar se elige una tasa por defecto: un check marcado sin tasa
        // deja el cálculo a medias y la base lo rechaza con un CHECK.
        onToggle={(v) =>
          onChange({ isl: v, islRate: v ? (value.islRate ?? ISL_OPCIONES[0]) : null })
        }
        onRate={(v) => onChange({ islRate: v })}
      />
      <RetencionCheck
        id={`${idPrefix}-iva`}
        label="IVA"
        activa={value.iva}
        rate={value.ivaRate}
        opciones={IVA_RET_OPCIONES}
        disabled={disabled}
        onToggle={(v) =>
          onChange({ iva: v, ivaRate: v ? (value.ivaRate ?? IVA_RET_OPCIONES[0]) : null })
        }
        onRate={(v) => onChange({ ivaRate: v })}
      />
      <label
        htmlFor={`${idPrefix}-mun`}
        className="flex items-center gap-2 text-[13px] text-[#555]"
      >
        <input
          id={`${idPrefix}-mun`}
          type="checkbox"
          checked={value.municipal}
          onChange={(e) => onChange({ municipal: e.target.checked })}
          disabled={disabled}
        />
        Impuesto municipal <span className="text-[#999]">1%</span>
      </label>
    </div>
  )
}

function RetencionCheck({ id, label, activa, rate, opciones, onToggle, onRate, disabled }) {
  return (
    <div className="flex items-center gap-3 flex-wrap">
      <label htmlFor={id} className="flex items-center gap-2 text-[13px] text-[#555]">
        <input
          id={id}
          type="checkbox"
          checked={activa}
          onChange={(e) => onToggle(e.target.checked)}
          disabled={disabled}
        />
        {label}
      </label>
      {/* La tasa solo aparece con la retención activa: elegir el porcentaje de
          algo que no se aplica solo genera dudas. */}
      {activa && (
        <div className="flex items-center gap-1">
          {opciones.map((o) => (
            <button
              key={o}
              type="button"
              onClick={() => onRate(o)}
              disabled={disabled}
              className={`px-2 py-0.5 rounded-lg text-[12px] font-semibold transition-colors ${
                Number(rate) === o
                  ? 'bg-[#111] text-white'
                  : 'bg-[#f0ede3] text-[#777] hover:bg-[#e5e0d4]'
              }`}
            >
              {o * 100}%
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
