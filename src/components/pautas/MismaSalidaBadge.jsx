import { hermanasDeSalida } from '../../utils/audiovisual'

/**
 * Chip "Misma salida" para una pauta que comparte `sesion_id` con otras: una grabación de
 * grupo registrada como una pauta por cuenta. Hace visible por qué el recurso no aparece
 * sobrecargado aunque tenga varias pautas ese día (ver MismaSalidaPicker.jsx). Devuelve
 * `null` si la pauta no está agrupada.
 */
export default function MismaSalidaBadge({ pauta, pautas, className = '' }) {
  const hermanas = hermanasDeSalida(pauta, pautas)
  if (hermanas.length === 0) return null
  const n = hermanas.length + 1
  return (
    <span
      title={`Una sola salida para ${n} cuentas: ${[pauta, ...hermanas]
        .map((p) => p.client_name || 'sin cliente')
        .join(', ')}`}
      className={`inline-flex items-center text-[10px] font-mono font-bold uppercase tracking-wide text-[#8a6d00] bg-[#fdf4de] border border-[#f0e3bd] rounded px-1.5 py-0.5 ${className}`}
    >
      Misma salida · {n} cuentas
    </span>
  )
}
