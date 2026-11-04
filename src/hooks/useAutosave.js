import { useCallback, useEffect, useRef, useState } from 'react'

export const AUTOSAVE_DELAY_MS = 1000

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b)

/**
 * Autoguardado con debounce para un formulario largo (Reportes → Operaciones / Finanzas).
 *
 * - `value` es el estado editable; `reset(v)` fija la línea base (lo cargado del servidor o
 *   lo recién guardado). Hasta que haya una base no se guarda nada, así que abrir una vista
 *   nunca escribe por sí sola.
 * - Cada cambio reinicia el temporizador; al vencer llama a `onSave(value, prev)` donde `prev`
 *   es el último valor persistido (para guardar solo lo que cambió). `onSave` devuelve `null`
 *   si todo bien, o el error.
 * - El guardado pendiente se fuerza al cambiar `contextKey` (otro mes/línea), al desmontar,
 *   al ocultarse la pestaña y al cerrar la página. Se usa el `onSave` del render que agendó el
 *   cambio, así que escribe en el mes/línea donde se editó aunque ya se haya navegado a otro.
 * - Los guardados se serializan; si falla, el valor sigue pendiente y el siguiente cambio (o
 *   `retry`) lo reintenta.
 *
 * @returns {{ status: 'idle'|'pending'|'saving'|'saved'|'error', reset: Function, retry: Function }}
 */
export function useAutosave({ value, enabled, onSave, contextKey, delay = AUTOSAVE_DELAY_MS }) {
  const [status, setStatus] = useState('idle')
  const savedRef = useRef(null)
  const latestRef = useRef({ value, onSave })
  const timerRef = useRef(null)
  const pendingRef = useRef(null)
  const runningRef = useRef(null)
  const mountedRef = useRef(true)

  latestRef.current = { value, onSave }

  const setSafeStatus = useCallback((s) => {
    if (mountedRef.current) setStatus(s)
  }, [])

  const run = useCallback(async () => {
    clearTimeout(timerRef.current)
    timerRef.current = null
    const job = pendingRef.current
    pendingRef.current = null
    if (!job) return
    // Serializa: espera el guardado en curso y luego compara contra lo ya persistido.
    while (runningRef.current) await runningRef.current
    if (same(job.value, savedRef.current)) {
      setSafeStatus('idle')
      return
    }
    const prev = savedRef.current
    setSafeStatus('saving')
    const p = (async () => {
      let err = null
      try {
        err = await job.save(job.value, prev)
      } catch (e) {
        err = e ?? new Error('Error al guardar')
      }
      if (err) {
        setSafeStatus('error')
        return
      }
      savedRef.current = job.value
      setSafeStatus('saved')
    })()
    runningRef.current = p
    await p
    runningRef.current = null
  }, [setSafeStatus])

  const runRef = useRef(run)
  runRef.current = run

  // Agenda un guardado cuando el valor se aparta de lo persistido.
  useEffect(() => {
    if (!enabled || savedRef.current === null) return
    if (same(value, savedRef.current)) {
      clearTimeout(timerRef.current)
      timerRef.current = null
      pendingRef.current = null
      return
    }
    pendingRef.current = { value, save: onSave }
    setSafeStatus('pending')
    clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => runRef.current(), delay)
    // `onSave` se captura a propósito en cada cambio de valor, no como dependencia.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, enabled, delay])

  // Fuerza el guardado pendiente al cambiar de contexto (mes/línea) y al desmontar.
  useEffect(() => {
    mountedRef.current = true
    return () => {
      runRef.current()
    }
  }, [contextKey])

  useEffect(
    () => () => {
      mountedRef.current = false
    },
    [],
  )

  // Pestaña oculta o página que se cierra: guarda lo pendiente; si queda algo sin escribir, avisa.
  useEffect(() => {
    const flush = () => {
      if (document.visibilityState === 'hidden') runRef.current()
    }
    const onBeforeUnload = (e) => {
      if (pendingRef.current || runningRef.current) {
        runRef.current()
        e.preventDefault()
        e.returnValue = ''
      }
    }
    const onPageHide = () => runRef.current()
    document.addEventListener('visibilitychange', flush)
    window.addEventListener('pagehide', onPageHide)
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => {
      document.removeEventListener('visibilitychange', flush)
      window.removeEventListener('pagehide', onPageHide)
      window.removeEventListener('beforeunload', onBeforeUnload)
    }
  }, [])

  const reset = useCallback((v) => {
    clearTimeout(timerRef.current)
    timerRef.current = null
    pendingRef.current = null
    savedRef.current = v
    setStatus('idle')
  }, [])

  const retry = useCallback(() => {
    const { value: v, onSave: save } = latestRef.current
    pendingRef.current = { value: v, save }
    runRef.current()
  }, [])

  return { status, reset, retry }
}
