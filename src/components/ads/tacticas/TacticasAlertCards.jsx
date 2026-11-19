/**
 * Tarjetas de resumen de la vista "Vigentes". Las tres primeras filtran la tabla al hacer
 * clic (`onFilter(estado)`); la de marcas sin táctica es informativa, porque esas marcas
 * ya se listan justo debajo en "Por hacer".
 *
 * @param {object}   props
 * @param {object}   props.stats   — { vigentes, brandsTotal, vencen3, vencenMes, sinTactica, avgPct }
 * @param {string}   props.estado  — filtro activo ('vigentes' | 'vencen3' | 'vencen_mes' | …)
 * @param {Function} props.onFilter — (estado) => void
 */
export default function TacticasAlertCards({ stats, estado, onFilter }) {
  const base = 'text-left rounded-2xl border px-4 py-3.5 transition-colors'
  const ring = (key) => (estado === key ? ' ring-2 ring-[#FFB800]' : '')

  return (
    <section
      aria-label="Resumen de tácticas"
      className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5"
    >
      <button
        type="button"
        onClick={() => onFilter('vigentes')}
        className={`${base} bg-white border-[#e0ddd4] hover:border-[#FFB800]${ring('vigentes')}`}
      >
        <p className="text-[12px] font-mono font-bold tracking-[0.14em] uppercase text-[#888]">
          Tácticas vigentes
        </p>
        <p className="text-[30px] font-bold text-[#111] leading-tight mt-1">{stats.vigentes}</p>
        <p className="text-[13px] text-[#888]">
          de {stats.brandsTotal} {stats.brandsTotal === 1 ? 'marca' : 'marcas'}
          {stats.avgPct != null && ` · cumplimiento ${stats.avgPct}%`}
        </p>
      </button>

      <button
        type="button"
        onClick={() => onFilter('vencen3')}
        className={`${base} bg-[#fce4e4] border-[#f2b8b8] hover:border-[#8e1b1b]${ring('vencen3')}`}
      >
        <p className="text-[12px] font-mono font-bold tracking-[0.14em] uppercase text-[#8e1b1b]">
          Vencen en 3 días
        </p>
        <p className="text-[30px] font-bold text-[#8e1b1b] leading-tight mt-1">{stats.vencen3}</p>
        <p className="text-[13px] text-[#8e1b1b]">incluye las que vencen hoy</p>
      </button>

      <button
        type="button"
        onClick={() => onFilter('vencen_mes')}
        className={`${base} bg-[#fff1c2] border-[#f0d57a] hover:border-[#6e4a00]${ring('vencen_mes')}`}
      >
        <p className="text-[12px] font-mono font-bold tracking-[0.14em] uppercase text-[#6e4a00]">
          Vencen este mes
        </p>
        <p className="text-[30px] font-bold text-[#6e4a00] leading-tight mt-1">{stats.vencenMes}</p>
        <p className="text-[13px] text-[#6e4a00]">hasta fin de mes</p>
      </button>

      <div className={`${base} bg-white border-[#e0ddd4]`}>
        <p className="text-[12px] font-mono font-bold tracking-[0.14em] uppercase text-[#888]">
          Sin táctica vigente
        </p>
        <p className="text-[30px] font-bold text-[#1565c0] leading-tight mt-1">
          {stats.sinTactica}
        </p>
        <p className="text-[13px] text-[#888]">marcas por hacer</p>
      </div>
    </section>
  )
}
