/**
 * Control numérico −/valor/+ de guardado inmediato — reemplaza al `<input type="number">`
 * con `onBlur` (patrón anterior en PautaDetailModal.jsx) para reparto de piezas y conteos
 * similares. Cada click dispara `onChange(delta)` de una vez: el valor mostrado es
 * SIEMPRE el prop `value` (no hay estado local que pueda desincronizarse del dato real
 * cuando llega una actualización por realtime).
 *
 * Props:
 *   value    — número actual mostrado
 *   onChange — (delta) => void | Promise<void> — delta es +1/-1 (o `step`)
 *   min      — límite inferior para el botón "−" (default 0)
 *   max      — límite superior para el botón "+" (opcional)
 *   step     — magnitud del delta (default 1)
 *   disabled — deshabilita ambos botones (p. ej. mientras hay una escritura en vuelo)
 *   label    — texto para aria-label de los botones, ej. "piezas de Ana Pérez"
 */
export default function Stepper({
  value,
  onChange,
  min = 0,
  max,
  step = 1,
  disabled = false,
  label = 'cantidad',
}) {
  const canDecrement = !disabled && value - step >= min
  const canIncrement = !disabled && (max === undefined || value + step <= max)

  return (
    <div className="inline-flex items-center gap-1.5">
      <button
        type="button"
        aria-label={`Quitar ${label}`}
        disabled={!canDecrement}
        onClick={() => onChange(-step)}
        className="w-6 h-6 flex items-center justify-center rounded-lg border border-[#e0ddd4] text-[#666] hover:bg-[#f5f3eb] disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
      >
        −
      </button>
      <span className="font-mono text-[13px] font-semibold text-[#222] w-5 text-center tabular-nums">
        {value}
      </span>
      <button
        type="button"
        aria-label={`Agregar ${label}`}
        disabled={!canIncrement}
        onClick={() => onChange(step)}
        className="w-6 h-6 flex items-center justify-center rounded-lg border border-[#e0ddd4] text-[#666] hover:bg-[#f5f3eb] disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
      >
        +
      </button>
    </div>
  )
}
