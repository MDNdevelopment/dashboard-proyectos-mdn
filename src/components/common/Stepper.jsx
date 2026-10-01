import { useEffect, useRef, useState } from 'react'

// Clics seguidos se acumulan y se mandan juntos en vez de uno por clic — ver `queue`/`flush`
// más abajo. 350ms es suficiente para una ráfaga de clics humanos sin notarse como demora.
const FLUSH_MS = 350

function clamp(n, min, max) {
  let v = n
  if (typeof min === 'number') v = Math.max(v, min)
  if (typeof max === 'number') v = Math.min(v, max)
  return v
}

/**
 * Control numérico −/valor/+ de guardado inmediato — reemplaza al `<input type="number">`
 * con `onBlur` (patrón anterior en PautaDetailModal.jsx) para reparto de piezas y conteos
 * similares.
 *
 * El valor mostrado SIEMPRE deriva del prop `value` (no hay estado local que sea la
 * fuente de verdad del número — así nunca se desincroniza de una actualización por
 * realtime). La única excepción, acotada a propósito:
 *
 *  - Mientras el usuario escribe en el campo, `draft` guarda el texto — vive SOLO entre el
 *    foco y el blur/Enter/Escape.
 *  - Los clics de "−"/"+" y el valor escrito por teclado no llaman a `onChange` uno por
 *    uno: se acumulan en un delta pendiente (`queue`) que se envía en una sola llamada tras
 *    `FLUSH_MS` de inactividad, o de inmediato si no hay otra escritura en vuelo. Esto es
 *    lo que arregla que clics rápidos en "+" perdieran incrementos: antes cada clic
 *    disparaba un `onChange(±1)` que el handler del llamador resolvía sumando sobre el
 *    valor del render en que ocurrió el clic (lost update) — con varios clics en la misma
 *    ventana, los `onChange` posteriores pisaban el resultado del primero. Acumular el
 *    delta y mandar una sola llamada por ráfaga, serializada (nunca dos `onChange` en
 *    vuelo a la vez), elimina esa carrera sin que el llamador tenga que cambiar nada: el
 *    contrato sigue siendo `onChange(delta)` con delta relativo.
 *  - El pendiente vive, como máximo, mientras dura el debounce + la escritura en curso: no
 *    es un valor que se quede desincronizado por mucho tiempo. Si llega un `value` nuevo
 *    por props mientras hay algo pendiente (otro usuario, realtime), se fuerza un flush
 *    inmediato del delta acumulado contra ese valor nuevo — es relativo, así que re-basarlo
 *    es correcto y no pierde el clic.
 *
 * Props:
 *   value    — número actual (fuente de verdad)
 *   onChange — (delta) => void | Promise<void> — delta puede ser cualquier entero, no solo
 *              ±step: el camino de escritura manda el delta completo entre lo escrito y el
 *              valor real.
 *   min      — límite inferior (default 0)
 *   max      — límite superior (opcional)
 *   step     — magnitud de los botones −/+ (default 1); no limita lo que se puede escribir
 *   disabled — deshabilita botones e input (p. ej. mientras hay una escritura en vuelo)
 *   label    — texto para aria-label, ej. "piezas de Ana Pérez" → "Agregar piezas de Ana
 *              Pérez" / "Quitar piezas de Ana Pérez" / "Cantidad de piezas de Ana Pérez"
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
  const [pending, setPending] = useState(0) // delta acumulado, aún no enviado
  const [inFlight, setInFlight] = useState(0) // delta ya enviado, cuyo write no resolvió
  const [draft, setDraft] = useState(null) // texto del input — solo mientras tiene foco
  const pendingRef = useRef(0)
  const busyRef = useRef(false)
  const timerRef = useRef(null)
  const onChangeRef = useRef(onChange)
  const lastValueRef = useRef(value)
  const skipCommitRef = useRef(false) // Escape dispara blur() -> no debe commitear el draft

  useEffect(() => {
    onChangeRef.current = onChange
  }, [onChange])

  function flush() {
    clearTimeout(timerRef.current)
    const delta = pendingRef.current
    if (!delta || busyRef.current) return
    pendingRef.current = 0
    setPending(0)
    setInFlight((d) => d + delta)
    busyRef.current = true
    Promise.resolve(onChangeRef.current(delta))
      .catch(() => {})
      .finally(() => {
        busyRef.current = false
        setInFlight((d) => d - delta)
        // Si llegó más mientras este write estaba en vuelo, encadenar el siguiente.
        if (pendingRef.current) flush()
      })
  }

  // Un `value` nuevo por props (realtime, otro usuario) mientras hay algo pendiente: hacer
  // flush ya contra la base nueva, en vez de dejarlo esperando el debounce con una base
  // potencialmente obsoleta.
  useEffect(() => {
    if (value !== lastValueRef.current) {
      lastValueRef.current = value
      if (pendingRef.current) flush()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value])

  // Flush de lo pendiente si el componente se desmonta a mitad de ráfaga (p. ej. se cierra
  // el modal): un clic que ya se hizo no debe perderse en silencio.
  useEffect(() => {
    return () => {
      if (pendingRef.current) onChangeRef.current(pendingRef.current)
    }
  }, [])

  const shown = value + pending + inFlight

  function queue(delta) {
    const hadPending = Boolean(pendingRef.current)
    pendingRef.current += delta
    setPending(pendingRef.current)
    clearTimeout(timerRef.current)
    // Flanco de subida: si no hay nada pendiente ni en vuelo, el primer clic de una ráfaga
    // se manda de inmediato (comportamiento sincrónico — igual que antes, para quien hace
    // un solo clic). Los clics siguientes de la misma ráfaga solo se acumulan y se mandan
    // juntos cuando se acaban.
    if (!hadPending && !busyRef.current) {
      flush()
    } else {
      timerRef.current = setTimeout(flush, FLUSH_MS)
    }
  }

  const canDecrement = !disabled && shown - step >= min
  const canIncrement = !disabled && (max === undefined || shown + step <= max)

  function commit() {
    if (skipCommitRef.current) {
      skipCommitRef.current = false
      return
    }
    const text = draft
    setDraft(null)
    if (text === null || text === '') return
    const n = parseInt(text, 10)
    if (Number.isNaN(n)) return
    const target = clamp(n, min, max)
    const delta = target - shown
    if (delta === 0) return
    pendingRef.current += delta
    setPending(pendingRef.current)
    clearTimeout(timerRef.current)
    flush()
  }

  return (
    <div className="inline-flex items-center gap-1.5">
      <button
        type="button"
        aria-label={`Quitar ${label}`}
        disabled={!canDecrement}
        onClick={() => queue(-step)}
        className="w-6 h-6 flex items-center justify-center rounded-lg border border-[#e0ddd4] text-[#666] hover:bg-[#f5f3eb] disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
      >
        −
      </button>
      <input
        type="text"
        inputMode="numeric"
        autoComplete="off"
        aria-label={`Cantidad de ${label}`}
        disabled={disabled}
        value={draft ?? String(shown)}
        onFocus={(e) => {
          setDraft(String(shown))
          e.target.select()
        }}
        onChange={(e) => {
          const next = e.target.value
          if (/^\d*$/.test(next)) setDraft(next)
        }}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault()
            // No depende de que el blur() dispare onBlur (en jsdom no siempre ocurre si el
            // elemento no quedó realmente enfocado) — se confirma acá y además se intenta
            // soltar el foco visualmente.
            commit()
            e.target.blur()
          } else if (e.key === 'Escape') {
            skipCommitRef.current = true
            setDraft(null)
            e.target.blur()
          }
        }}
        className="font-mono text-[13px] font-semibold text-[#222] w-11 text-center tabular-nums rounded-lg border border-[#e0ddd4] bg-transparent focus:border-[#FFB800] focus:outline-none disabled:opacity-50"
      />
      <button
        type="button"
        aria-label={`Agregar ${label}`}
        disabled={!canIncrement}
        onClick={() => queue(step)}
        className="w-6 h-6 flex items-center justify-center rounded-lg border border-[#e0ddd4] text-[#666] hover:bg-[#f5f3eb] disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
      >
        +
      </button>
    </div>
  )
}
