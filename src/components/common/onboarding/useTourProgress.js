import { useCallback, useEffect, useState } from 'react'

const storageKey = (moduleKey, userId) => `mappi.tours.${moduleKey}.${userId ?? 'anon'}`

// El progreso es solo una comodidad visual (✓ y punto amarillo): si el storage no está
// disponible (ventana privada, datos bloqueados) todo sigue funcionando sin él.
function read(key) {
  try {
    const raw = localStorage.getItem(key)
    const value = raw ? JSON.parse(raw) : null
    return {
      done: Array.isArray(value?.done) ? value.done : [],
      menuSeen: value?.menuSeen === true,
    }
  } catch {
    return { done: [], menuSeen: false }
  }
}

function write(key, state) {
  try {
    localStorage.setItem(key, JSON.stringify(state))
  } catch {
    // sin storage: solo se pierde el recordatorio
  }
}

/**
 * Recorridos ya vistos de un módulo, por persona (`userId`): `done` = ids de recorridos
 * terminados o cerrados; `menuSeen` = ya se le mostró el menú de bienvenida.
 */
export function useTourProgress(moduleKey, userId) {
  const key = storageKey(moduleKey, userId)
  const [state, setState] = useState(() => read(key))

  // "Ver como" cambia de persona sin desmontar la página.
  useEffect(() => {
    setState(read(key))
  }, [key])

  const update = useCallback(
    (fn) =>
      setState((prev) => {
        const next = fn(prev)
        if (next !== prev) write(key, next)
        return next
      }),
    [key],
  )
  const markDone = useCallback(
    (id) => update((p) => (p.done.includes(id) ? p : { ...p, done: [...p.done, id] })),
    [update],
  )
  const markMenuSeen = useCallback(
    (seen = true) => update((p) => (p.menuSeen === seen ? p : { ...p, menuSeen: seen })),
    [update],
  )

  return { done: state.done, menuSeen: state.menuSeen, markDone, markMenuSeen }
}
