import AttendeePicker from '../reuniones/AttendeePicker'

/** Paso 3 del asistente: detalles opcionales (requerimientos, grilla, asistentes, extra). */
export default function WizardPasoDetalles({ values, set, employees }) {
  return (
    <div className="space-y-5">
      <p className="text-[12.5px] text-[#888]">
        Todo lo de este paso es opcional. Puedes enviar ya y completar después desde el detalle.
      </p>

      <section>
        <h3 className="text-[11.5px] font-mono font-bold uppercase tracking-[0.1em] text-[#aaa] mb-2">
          Requerimientos
        </h3>
        <textarea
          className="input-base"
          rows={3}
          aria-label="Requerimientos"
          value={values.requirements}
          onChange={(e) => set('requirements', e.target.value)}
          placeholder="Herramientas, ropa, modelo, props…"
        />
      </section>

      <section>
        <h3 className="text-[11.5px] font-mono font-bold uppercase tracking-[0.1em] text-[#aaa] mb-2">
          Grilla y piezas
        </h3>
        <input
          className="input-base min-h-[44px]"
          aria-label="Enlace de la grilla"
          value={values.link}
          onChange={(e) => set('link', e.target.value)}
          placeholder="Enlace de la grilla (Drive) — debe estar 2 días antes"
        />
        <textarea
          className="input-base mt-2"
          rows={2}
          aria-label="Descripción de piezas"
          value={values.piezas_desc}
          onChange={(e) => set('piezas_desc', e.target.value)}
          placeholder="Piezas esperadas si no hay grilla. Ej: 3 reels — promo, testimonio, producto"
        />
        <label className="flex items-center gap-2 mt-3 text-[13px] text-[#555] cursor-pointer select-none min-h-[44px]">
          <input
            type="checkbox"
            checked={values.extra}
            onChange={(e) => set('extra', e.target.checked)}
          />
          Pauta extra (fuera del plan mensual)
        </label>
      </section>

      <details className="group">
        <summary className="cursor-pointer list-none text-[11.5px] font-mono font-bold uppercase tracking-[0.1em] text-[#aaa] mb-2 select-none">
          <span className="inline-block w-3 transition-transform group-open:rotate-90">›</span>{' '}
          Asistentes
          {values.attendee_ids.length > 0 && (
            <span className="ml-1 text-[#111]">({values.attendee_ids.length})</span>
          )}
        </summary>
        <AttendeePicker
          employees={employees ?? []}
          selectedIds={values.attendee_ids}
          onChange={(ids) => set('attendee_ids', ids)}
          hideQuickGroups
        />
      </details>
    </div>
  )
}
