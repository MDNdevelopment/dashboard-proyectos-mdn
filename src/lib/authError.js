/**
 * Códigos y mensajes de error de Supabase/PostgREST que indican que la sesión
 * ya no es válida (token expirado, refresh token revocado, JWT inválido, etc.).
 * Fuente única de verdad: se usa en AuthContext para decidir si hacer signOut.
 */

const AUTH_ERROR_CODES = new Set([
  'PGRST301',                      // JWT inválido en PostgREST
  'refresh_token_not_found',
  'refresh_token_already_used',
  'session_not_found',
  'bad_jwt',
])

const AUTH_ERROR_MESSAGES = [
  'jwt expired',
  'invalid refresh token',
  'invalid claim',
  'not authenticated',
]

/**
 * Devuelve true si el error de Supabase indica que la sesión ya no es válida.
 * @param {object|null} error - El error del objeto `{ data, error }` de Supabase.
 */
export function isAuthError(error) {
  if (!error) return false
  if (error.status === 401 || error.status === 403) return true
  if (error.code && AUTH_ERROR_CODES.has(error.code)) return true
  if (error.message) {
    const msg = error.message.toLowerCase()
    return AUTH_ERROR_MESSAGES.some(m => msg.includes(m))
  }
  return false
}
