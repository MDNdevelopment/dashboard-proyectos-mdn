/**
 * Tarjetas de resumen de la vista "Vigentes": cuántas marcas hay, cuántas tácticas están
 * vigentes y cuántas marcas no tienen ninguna. Lo que vence pronto no va aquí: llega como
 * notificación (`campaign_due_soon`) y se ve en el Gantt y en el filtro Estado.
 *
 * "Tácticas vigentes" filtra la tabla al hacer clic (`onFilter('vigentes')`, quita el filtro de
 * estado); las otras dos son informativas, porque las marcas sin táctica ya se listan en
 * "Por hacer".
 *
 * @param {object}   props
 * @param {object}   props.stats   — { brandsTotal, brandsConVigente, vigentes, sinTactica, avgPct }
 * @param {string}   props.estado  — filtro activo ('vigentes' | 'vencen3' | …)
 * @param {Function} props.onFilter — (estado) => void
 */
export default function TacticasAlertCards({ stats, estado, onFilter }) {
  const base = 'text-left rounded-2xl border px-4 py-3.5 transition-colors'
  const label = 'text-[12px] font-mono font-bold tracking-[0.14em] uppercase text-[#888]'

  return (
    <section
      aria-label="Resumen de tácticas"
      className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-5"
    >
      <div className={`${base} bg-white border-[#e0ddd4]`}>
        <p className={label}>Marcas</p>
        <p className="text-[30px] font-bold text-[#111] leading-tight mt-1">{stats.brandsTotal}</p>
        <p className="text-[13px] text-[#888]">{stats.brandsConVigente} con táctica vigente</p>
      </div>

      <button
        type="button"
        onClick={() => onFilter('vigentes')}
        className={`${base} bg-white border-[#e0ddd4] hover:border-[#FFB800]${
          estado === 'vigentes' ? ' ring-2 ring-[#FFB800]' : ''
        }`}
      >
        <p className={label}>Tácticas vigentes</p>
        <p className="text-[30px] font-bold text-[#1e5e24] leading-tight mt-1">{stats.vigentes}</p>
        <p className="text-[13px] text-[#888]">
          {stats.avgPct != null
            ? `cumplimiento promedio ${stats.avgPct}%`
            : 'en marcha o programadas'}
        </p>
      </button>

      <div className={`${base} bg-white border-[#e0ddd4]`}>
        <p className={label}>Sin táctica vigente</p>
        <p className="text-[30px] font-bold text-[#1565c0] leading-tight mt-1">
          {stats.sinTactica}
        </p>
        <p className="text-[13px] text-[#888]">
          {stats.sinTactica === 1 ? 'marca por hacer' : 'marcas por hacer'}
        </p>
      </div>
    </section>
  )
}
