/**
 * Modo "Ver como": suplantación VISUAL de otro usuario para el desarrollador.
 *
 * Solo cambia el perfil que el frontend usa para decidir qué mostrar (`userProfile`
 * en AuthContext). La sesión de Supabase —y por tanto `auth.uid()` en las policies—
 * sigue siendo la real, así que la app entera queda en SOLO LECTURA mientras el modo
 * está activo: sin ese candado, cualquier escritura saldría con el `user_id` del
 * suplantado (los `created_by` se toman de `userProfile`) pero con el JWT del real.
 *
 * El flag vive en un módulo y no en un contexto de React porque `src/supabase.js`
 * necesita consultarlo para bloquear las escrituras, y no puede importar el contexto
 * (ciclo: AuthContext → supabase → AuthContext).
 */

// Juan Lauretta. Mismo criterio que el "Modo dios" del Sidebar y que
// CEO_ANALYSIS_USER_IDS (ceoAnalysisAccess.js): se identifica por user_id porque
// users.email no es confiable. No se reutiliza esa lista porque incluye a César y
// Jesús, que no deben poder suplantar a nadie.
export const VIEW_AS_USER_IDS = ['2d50a4e5-35db-4be5-b27a-a24d1282ce82']

export const VIEW_AS_STORAGE_KEY = 'mdn_view_as_user_id'

/**
 * RPCs de solo lectura. Todo lo que no esté aquí se bloquea en modo "Ver como"
 * (allowlist, no denylist: un RPC nuevo que escriba no debe colarse por olvido).
 */
export const READONLY_RPCS = ['employee_score_inputs', 'users_on_vacation_today']

/** @param {{ user_id?: string }|null|undefined} profile — debe ser el perfil REAL */
export function canUseViewAs(profile) {
  return !!profile?.user_id && VIEW_AS_USER_IDS.includes(profile.user_id)
}

/** @param {string} fnName */
export function isReadOnlyRpc(fnName) {
  return READONLY_RPCS.includes(fnName)
}

let viewOnly = false

export function isViewOnly() {
  return viewOnly
}

export function setViewOnly(value) {
  viewOnly = !!value
}

/**
 * Lee el user_id suplantado que quedó guardado de un refresco de página.
 * Tolerante a sessionStorage inaccesible (Safari en privado, storage bloqueado).
 */
export function readStoredViewAs() {
  try {
    return window.sessionStorage.getItem(VIEW_AS_STORAGE_KEY) || null
  } catch {
    return null
  }
}

export function storeViewAs(userId) {
  try {
    window.sessionStorage.setItem(VIEW_AS_STORAGE_KEY, userId)
  } catch {
    // Sin persistencia el modo sigue funcionando; solo no sobrevive a un F5.
  }
}

export function clearStoredViewAs() {
  try {
    window.sessionStorage.removeItem(VIEW_AS_STORAGE_KEY)
  } catch {
    // ídem
  }
}
