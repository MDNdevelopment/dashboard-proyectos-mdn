/**
 * Chip "EXTRA" para pautas fuera del plan mensual (`pauta.extra`). Se muestra en las
 * cuatro vistas del módulo (solicitudes, agendadas, realizadas, calendario) y en el
 * detalle, siempre con el mismo estilo. Devuelve `null` si la pauta no está marcada.
 */
export default function ExtraBadge({ pauta, className = '' }) {
  if (!pauta?.extra) return null
  return (
    <span
      className={`inline-flex items-center text-[10px] font-mono font-bold uppercase tracking-wide text-[#b9440e] bg-[#fdece1] border border-[#f3c7a8] rounded px-1.5 py-0.5 ${className}`}
    >
      Extra
    </span>
  )
}
