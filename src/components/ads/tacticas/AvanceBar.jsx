import { AVANCE_TRAMOS, avanceTramo } from '../../../utils/tacticas'

/**
 * Barra del avance (acciones hechas / totales) pintada con el color de su tramo (`AVANCE_TRAMOS`).
 * `size="sm"` para la tabla de Base: solo "X/N · %" y la barra (la leyenda de arriba explica los
 * colores). `size="lg"` para el detalle: además, el nombre del tramo.
 *
 * @param {object} props
 * @param {number} props.done
 * @param {number} props.total
 * @param {'sm'|'lg'} [props.size]
 */
export default function AvanceBar({ done, total, size = 'sm' }) {
  if (!total) return <span className="text-[#bbb]">—</span>
  const pct = Math.round((done / total) * 100)
  const tramo = avanceTramo(pct)
  const lg = size === 'lg'

  return (
    <div className={lg ? 'w-full' : 'w-[110px]'} title={lg ? undefined : tramo.label}>
      <div className="flex items-baseline justify-between gap-2 mb-1">
        <span
          className={`font-mono font-semibold text-[#111] whitespace-nowrap ${
            lg ? 'text-[14px]' : 'text-[13px]'
          }`}
        >
          {done}/{total} · {pct}%
        </span>
        {lg && (
          <span className="flex items-center gap-1 text-[13px] font-semibold text-[#666] whitespace-nowrap">
            <span
              aria-hidden="true"
              className="w-2 h-2 rounded-full flex-none"
              style={{ background: tramo.hex }}
            />
            {tramo.label}
          </span>
        )}
      </div>
      <div
        role="img"
        aria-label={`Avance: ${pct}% (${tramo.label})`}
        className={`${lg ? 'h-2.5' : 'h-1.5'} bg-[#efece3] rounded-full overflow-hidden`}
      >
        <div
          className="h-full rounded-full transition-[width] duration-500"
          style={{ width: `${pct}%`, background: tramo.hex }}
        />
      </div>
    </div>
  )
}

/** Leyenda de los 5 tramos del avance, para poner arriba de la tabla de Base. */
export function AvanceLeyenda() {
  return (
    <ul
      aria-label="Escala de avance"
      className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[13px] text-[#666]"
    >
      <li className="text-[12px] font-mono font-bold tracking-[0.12em] uppercase text-[#888]">
        Avance
      </li>
      {AVANCE_TRAMOS.map((t) => (
        <li key={t.key} className="flex items-center gap-1.5">
          <span
            aria-hidden="true"
            className="w-3 h-3 rounded flex-none"
            style={{ background: t.hex }}
          />
          <span className="font-semibold text-[#333]">{t.label}</span>
          <span className="font-mono text-[#999]">{t.range}</span>
        </li>
      ))}
    </ul>
  )
}
