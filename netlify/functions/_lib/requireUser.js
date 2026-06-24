import { supabase } from './supabase.js'

const errJson = (statusCode, message) => ({
  statusCode,
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ error: message }),
})

/**
 * Verifica que el caller tenga un JWT válido (cualquier usuario autenticado).
 * A diferencia de requireAdmin, NO exige admin === true — acepta evaluadores
 * con access_level >= 2.
 *
 * @returns {{ error: object } | { caller: { user_id: string, company_id: string } }}
 *   - error: objeto response listo para retornar desde el handler
 *   - caller: perfil del usuario autenticado (incluye company_id de confianza)
 */
export async function requireUser(event) {
  const header =
    event.headers?.authorization ?? event.headers?.Authorization ?? ''
  const token = header.startsWith('Bearer ') ? header.slice(7) : ''

  if (!token) return { error: errJson(401, 'Unauthorized') }

  // Verificar JWT con el cliente service-role
  const { data: { user }, error: authErr } = await supabase.auth.getUser(token)
  if (authErr || !user) return { error: errJson(401, 'Unauthorized') }

  // Obtener company_id de confianza desde la tabla users
  const { data: profile, error: profileErr } = await supabase
    .from('users')
    .select('user_id, company_id')
    .eq('user_id', user.id)
    .single()

  if (profileErr || !profile) return { error: errJson(401, 'Unauthorized') }

  return { caller: profile }
}
