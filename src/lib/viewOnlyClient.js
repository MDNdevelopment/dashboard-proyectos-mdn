/**
 * Candado de escritura del modo "Ver como" (ver viewAs.js).
 *
 * El proyecto no tiene una capa de servicios única: conviven 9 módulos `*Api.js` con
 * ~57 escrituras sueltas en componentes y hooks. El único punto por el que pasan TODAS
 * es el cliente de Supabase, así que el bloqueo se aplica ahí (`wrapSupabaseClient`).
 *
 * El stub NO lanza: devuelve un resultado con forma de respuesta de PostgREST
 * (`{ data, error }`). El patrón dominante en el código es
 * `const { error } = await …; if (error) setError(…)`, así que resolver con error
 * reutiliza el manejo que ya existe en cada formulario; un `throw` desde un handler
 * sin try/catch dejaría la vista en blanco.
 */
import { isViewOnly, isReadOnlyRpc } from './viewAs'

export const VIEW_ONLY_MESSAGE =
  'Modo "Ver como": la aplicación está en solo lectura. Sal del modo para guardar cambios.'

export const VIEW_ONLY_ERROR = {
  code: 'VIEW_ONLY',
  message: VIEW_ONLY_MESSAGE,
  details: null,
  hint: 'Sal del modo "Ver como" desde la barra superior.',
}

const WRITE_METHODS = ['insert', 'update', 'upsert', 'delete']

/**
 * Guarda para las escrituras que NO pasan por el cliente de Supabase: los endpoints
 * Netlify con service-role (`/api/employees*`, `/api/self-god-mode`). Devuelve el
 * mensaje a mostrar si hay que abortar, o null si se puede seguir.
 *
 * @returns {string|null}
 */
export function blockedByViewOnly() {
  return isViewOnly() ? VIEW_ONLY_MESSAGE : null
}

/** Resultado que resuelve cualquier cadena bloqueada. */
export function viewOnlyResult() {
  return {
    data: null,
    error: { ...VIEW_ONLY_ERROR },
    count: null,
    status: 403,
    statusText: 'Forbidden',
  }
}

/**
 * Objeto encadenable y thenable: responde a cualquier método (`select`, `eq`,
 * `single`, `order`…) devolviéndose a sí mismo, y al hacerle `await` resuelve el
 * error de solo lectura. Así `.insert(x).select().single()` funciona igual que una
 * cadena real, pero nunca llega a la red.
 */
export function viewOnlyQuery() {
  const settled = () => Promise.resolve(viewOnlyResult())
  const stub = new Proxy(
    {},
    {
      get(_target, prop) {
        if (prop === 'then') return (onOk, onErr) => settled().then(onOk, onErr)
        if (prop === 'catch') return (onErr) => settled().catch(onErr)
        if (prop === 'finally') return (onEnd) => settled().finally(onEnd)
        if (typeof prop === 'symbol') return undefined
        return () => stub
      },
    },
  )
  return stub
}

/**
 * Envuelve el cliente de Supabase. Lecturas, auth y realtime pasan intactos.
 * Solo se intercepta cuando `isViewOnly()` es true, así que fuera del modo
 * "Ver como" el comportamiento es idéntico al del cliente sin envolver.
 *
 * @param {import('@supabase/supabase-js').SupabaseClient} client
 */
export function wrapSupabaseClient(client) {
  const originalFrom = client.from.bind(client)
  const originalRpc = client.rpc.bind(client)

  client.from = (table) => {
    const builder = originalFrom(table)
    if (!isViewOnly()) return builder
    // Proxy en vez de sobrescribir los métodos del builder: mutarlo dejaría el
    // objeto tocado para siempre si el cliente reutilizara instancias, y el
    // bloqueo sobreviviría a la salida del modo "Ver como".
    const guarded = new Proxy(builder, {
      get(target, prop, receiver) {
        if (WRITE_METHODS.includes(prop)) return () => viewOnlyQuery()
        const value = Reflect.get(target, prop, receiver)
        if (typeof value !== 'function') return value
        return (...args) => {
          const out = value.apply(target, args)
          // Los métodos encadenables devuelven `this`: hay que seguir devolviendo
          // el proxy para que un write encadenado más adelante también caiga.
          return out === target ? guarded : out
        }
      },
    })
    return guarded
  }

  client.rpc = (fn, args, options) => {
    if (isViewOnly() && !isReadOnlyRpc(fn)) return viewOnlyQuery()
    return originalRpc(fn, args, options)
  }

  return client
}
