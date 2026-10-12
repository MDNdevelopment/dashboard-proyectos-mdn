/**
 * Card chica de Finanzas (label + valor + sub opcional). Sin `onClick` es un <div>
 * informativo; con `onClick` es un <button> con hover de marca, y `active` marca el
 * filtro que esa card dejó aplicado en la tabla de abajo.
 *
 * @param {string} label
 * @param {ReactNode} value
 * @param {string} [sub]
 * @param {string} [accent] - color hex del valor, default `#111`
 * @param {() => void} [onClick]
 * @param {boolean} [active] - resalta el borde con el color de marca
 */
export default function FinStat({ label, value, sub, accent = '#111', onClick, active = false }) {
  const body = (
    <>
      <p className="text-[11px] uppercase text-[#999]">{label}</p>
      <p className="font-bold text-[16px]" style={{ color: accent }}>
        {value}
      </p>
      {sub && <p className="text-[11px] text-[#999]">{sub}</p>}
    </>
  )
  const base = `bg-white border rounded-xl p-3 text-left ${active ? 'border-[#FFB800]' : 'border-[#e0ddd4]'}`

  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        aria-pressed={active}
        className={`${base} transition-colors hover:border-[#FFB800] cursor-pointer`}
      >
        {body}
      </button>
    )
  }
  return <div className={base}>{body}</div>
}
