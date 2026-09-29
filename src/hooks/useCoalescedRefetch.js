import { useCallback, useEffect, useRef } from 'react'

/**
 * Agrupa muchas peticiones de recarga seguidas en UNA sola.
 *
 * Nace de una tormenta real de requests en Finanzas: un `.insert([...])` de 67
 * facturas (la facturación de un mes) emite 67 eventos `postgres_changes` —
 * Postgres notifica por FILA, no por sentencia — y la suscripción recargaba el
 * periodo entero en cada uno (~7 consultas). Preparar un mes costaba ~470
 * requests por sesión abierta; con dos navegadores se midieron 3.424 GET en un
 * minuto contra un baseline de 30-60.
 *
 * Dos mecanismos, porque el debounce solo no alcanza:
 *  - Debounce de cola: cada llamada reinicia el temporizador, así la ráfaga
 *    entera (llega en decenas de ms) termina en una única ejecución.
 *  - Guarda de "ya hay una recarga en vuelo": si la ráfaga sigue llegando
 *    mientras la recarga corre, no se lanza otra en paralelo — se deja UNA
 *    pendiente para el final, no N.
 *
 * Todo vive en refs a propósito: agendar una recarga no debe re-renderizar.
 *
 * @param {() => any} fn        Qué ejecutar (puede devolver promesa).
 * @param {number}    delayMs   Espera antes de ejecutar. 500 ms por defecto:
 *   por encima del jitter de una ráfaga y por debajo de lo perceptible. Las
 *   acciones propias del usuario no pasan por aquí, llaman a su refetch directo.
 * @returns {Function} `schedule()` para agendar, con `schedule.cancel()` para
 *   descartar lo agendado (cambio de periodo, desmontaje).
 */
export function useCoalescedRefetch(fn, delayMs = 500) {
  // Se refresca en cada render para que el temporizador dispare SIEMPRE la
  // versión vigente de `fn`. Si capturara la del momento de suscribirse, una
  // recarga agendada justo antes de cambiar de mes traería los datos del mes
  // viejo y los pisaría sobre los del nuevo.
  const fnRef = useRef(fn)
  fnRef.current = fn

  const timerRef = useRef(null)
  const inFlightRef = useRef(false)
  const pendingRef = useRef(false)
  const cancelledRef = useRef(false)

  const schedule = useCallback(() => {
    if (cancelledRef.current) return
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => {
      timerRef.current = null
      if (cancelledRef.current) return
      if (inFlightRef.current) {
        // Llegaron eventos mientras la recarga anterior seguía viva: una sola
        // pasada más al terminar, por muchos que hayan sido.
        pendingRef.current = true
        return
      }
      inFlightRef.current = true
      // El catch y el finally NO son opcionales: si `fn` rechaza (red caída,
      // RLS) y la bandera se quedara en true, esta recarga no volvería a
      // dispararse en toda la sesión y nadie se enteraría.
      Promise.resolve()
        .then(() => fnRef.current?.())
        .catch(() => {})
        .finally(() => {
          inFlightRef.current = false
          if (cancelledRef.current) return
          if (pendingRef.current) {
            pendingRef.current = false
            schedule()
          }
        })
    }, delayMs)
  }, [delayMs])

  schedule.cancel = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = null
    pendingRef.current = false
  }, [])

  // Al desmontar se corta todo: una recarga agendada después de salir de la
  // página solo haría un request inútil y un setState sobre algo desmontado.
  useEffect(() => {
    cancelledRef.current = false
    return () => {
      cancelledRef.current = true
      if (timerRef.current) clearTimeout(timerRef.current)
      timerRef.current = null
      pendingRef.current = false
    }
  }, [])

  return schedule
}

export default useCoalescedRefetch
