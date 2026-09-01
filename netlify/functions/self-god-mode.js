import { supabase } from './_lib/supabase.js'
import { requireUser } from './_lib/requireUser.js'
import { CEO_ANALYSIS_USER_IDS } from '../../src/lib/ceoAnalysisAccess.js'

const json = (statusCode, body) => ({
  statusCode,
  headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  body: JSON.stringify(body),
})

// El toggle "Modo dios" del Sidebar deja que Juan cambie su propio access_level/admin
// sin pasar por Empresa → Empleados. Antes escribía con el cliente anon directo a
// `users`, pero el trigger anti-escalada (20260828160000) bloquea ese UPDATE porque
// is_company_admin() evalúa el admin ACTUAL del caller, no el que está por asignarse —
// un no-admin (incluido Juan mientras admin=false) nunca puede tocar esos campos por
// esa vía. Este endpoint usa el service-role (el mismo bypass que update-employee.js)
// y valida server-side que el caller sea exactamente el usuario de CEO_ANALYSIS_USER_IDS.
export const handler = async (event) => {
  if (event.httpMethod !== 'POST') return json(405, { error: 'Method Not Allowed' })

  const { error: authError, caller } = await requireUser(event)
  if (authError) return authError

  if (!CEO_ANALYSIS_USER_IDS.includes(caller.user_id)) {
    return json(403, { error: 'Forbidden' })
  }

  let body
  try {
    body = JSON.parse(event.body ?? '{}')
  } catch {
    return json(400, { error: 'Body JSON inválido' })
  }

  const updatePayload = {}
  if ('access_level' in body) updatePayload.access_level = Number(body.access_level) || 1
  if ('admin' in body) updatePayload.admin = !!body.admin

  if (Object.keys(updatePayload).length === 0) {
    return json(400, { error: 'Nada para actualizar' })
  }

  const { data: profile, error: updateErr } = await supabase
    .from('users')
    .update(updatePayload)
    .eq('user_id', caller.user_id)
    .select('*')
    .maybeSingle()

  if (updateErr || !profile) {
    console.error('self-god-mode: error al actualizar', updateErr)
    return json(500, { error: 'No se pudo guardar el cambio' })
  }

  return json(200, profile)
}
