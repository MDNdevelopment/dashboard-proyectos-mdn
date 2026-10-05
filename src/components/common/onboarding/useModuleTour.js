import { useCallback, useEffect, useRef } from 'react'
import { driver } from 'driver.js'
import 'driver.js/dist/driver.css'
import './tour.css'

export const tourSelector = (target) => `[data-tour="${target}"]`

// Tras cambiar de pestaña o de modo el elemento tarda un render en aparecer.
function waitForTarget(target, timeout = 1000) {
  return new Promise((resolve) => {
    const started = Date.now()
    const tick = () => {
      const el = document.querySelector(tourSelector(target))
      if (el) return resolve(el)
      if (Date.now() - started >= timeout) return resolve(null)
      setTimeout(tick, 50)
    }
    tick()
  })
}

/**
 * Motor de recorridos guiados (envuelve driver.js). Un recorrido es
 * `{ id, steps: [{ target?, titulo, texto, side?, ...extra }] }`; `target` es el valor del
 * atributo `data-tour` del elemento a señalar (sin `target` el paso sale centrado).
 *
 * Antes de mostrar cada paso llama a `onBeforeStep(step)` para que la pantalla cambie de
 * pestaña o modo, y espera a que el elemento exista; si no aparece, salta ese paso. Los
 * pasos solo explican: nunca ejecutan acciones. Se sale en cualquier momento (✕, Esc o clic
 * fuera) y `onFinish(tour, { finished })` se llama siempre al cerrar.
 */
export function useModuleTour({ onBeforeStep, onFinish } = {}) {
  const driverRef = useRef(null)
  const callbacks = useRef({ onBeforeStep, onFinish })
  callbacks.current = { onBeforeStep, onFinish }

  const stop = useCallback(() => {
    const d = driverRef.current
    driverRef.current = null
    d?.destroy()
  }, [])

  useEffect(() => stop, [stop])

  const start = useCallback(
    async (tour) => {
      stop()
      const steps = tour.steps

      // Prepara el paso i (cambia la vista) y dice si se puede mostrar.
      const prepare = async (i) => {
        callbacks.current.onBeforeStep?.(steps[i])
        if (!steps[i].target) return true
        return Boolean(await waitForTarget(steps[i].target))
      }
      // Primer paso mostrable desde `from` avanzando (dir 1) o retrocediendo (dir -1).
      const resolveStep = async (from, dir) => {
        for (let i = from; i >= 0 && i < steps.length; i += dir) {
          if (await prepare(i)) return i
        }
        return -1
      }

      let finished = false
      const d = driver({
        showProgress: true,
        progressText: '{{current}} / {{total}}',
        allowClose: true,
        overlayOpacity: 0.55,
        stagePadding: 6,
        stageRadius: 10,
        popoverClass: 'mappi-tour',
        nextBtnText: 'Siguiente',
        prevBtnText: 'Anterior',
        doneBtnText: 'Terminar',
        steps: steps.map((s) => ({
          element: s.target ? tourSelector(s.target) : undefined,
          popover: {
            title: s.titulo,
            description: s.texto,
            side: s.side ?? 'bottom',
            align: 'start',
          },
        })),
        onNextClick: async () => {
          const next = await resolveStep(d.getActiveIndex() + 1, 1)
          if (driverRef.current !== d) return
          if (next === -1) {
            finished = true
            stop()
          } else {
            d.moveTo(next)
          }
        },
        onPrevClick: async () => {
          const prev = await resolveStep(d.getActiveIndex() - 1, -1)
          if (driverRef.current === d && prev !== -1) d.moveTo(prev)
        },
        onDestroyed: () => {
          if (driverRef.current === d) driverRef.current = null
          callbacks.current.onFinish?.(tour, { finished })
        },
      })

      driverRef.current = d
      const first = await resolveStep(0, 1)
      if (driverRef.current !== d) return
      if (first === -1) {
        driverRef.current = null
        return
      }
      d.drive(first)
    },
    [stop],
  )

  return { start, stop }
}
