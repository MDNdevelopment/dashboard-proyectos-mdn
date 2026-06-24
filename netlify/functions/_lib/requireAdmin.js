import { supabase } from './supabase.js'

const errJson = (statusCode, message) => ({
  statusCode,
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ error: message }),
})

/**
 * Verifica que el caller tenga un JWT válido Y sea admin.
 * Distinto de requireBearer (que valida el secreto compartido MCP_API_TOKEN).
 *
 * @returns {{ error: object } | { caller: { user_id: string, company_id: string } }}
 *   - error: objeto response listo para retornar desde el handler
 *   - caller: perfil del usuario autenticado (incluye company_id de confianza)
 */
export async function requireAdmin(event) {
  const header =
    event.headers?.authorization ?? event.headers?.Authorization ?? ''
  const token = header.startsWith('Bearer ') ? header.slice(7) : ''

  if (!token) return { error: errJson(401, 'Unauthorized') }

  // Verificar JWT con el cliente service-role
  const { data: { user }, error: authErr } = await supabase.auth.getUser(token)
  if (authErr || !user) return { error: errJson(401, 'Unauthorized') }

  // Confirmar que el caller tiene admin === true en la tabla users
  const { data: profile, error: profileErr } = await supabase
    .from('users')
    .select('user_id, admin, company_id')
    .eq('user_id', user.id)
    .single()

  if (profileErr || !profile) return { error: errJson(401, 'Unauthorized') }
  if (!profile.admin) return { error: errJson(403, 'Forbidden') }

  return { caller: profile }
}
