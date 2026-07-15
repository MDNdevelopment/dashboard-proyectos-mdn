import { supabase } from './_lib/supabase.js'
import { requireAdmin } from './_lib/requireAdmin.js'

const json = (statusCode, body) => ({
  statusCode,
  headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  body: JSON.stringify(body),
})

// ban_duration acepta un string tipo "876000h" (100 años) para banear indefinidamente;
// 'none' remueve el baneo. Ver supabase.auth.admin.updateUserById.
const BAN_FOREVER = '876000h'
const BAN_NONE = 'none'

export const handler = async (event) => {
  if (event.httpMethod !== 'POST') return json(405, { error: 'Method Not Allowed' })

  // Verificar JWT + admin
  const { error: authError, caller } = await requireAdmin(event)
  if (authError) return authError

  let body
  try {
    body = JSON.parse(event.body ?? '{}')
  } catch {
    return json(400, { error: 'Body JSON inválido' })
  }

  const { user_id, action } = body

  if (!user_id?.trim()) return json(400, { error: 'user_id es obligatorio' })
  if (action !== 'archive' && action !== 'restore') {
    return json(400, { error: "action debe ser 'archive' o 'restore'" })
  }
  if (user_id === caller.user_id) {
    return json(400, { error: 'No puedes archivar tu propia cuenta' })
  }

  // El empleado objetivo debe pertenecer a la misma empresa que el caller.
  const { data: target, error: targetErr } = await supabase
    .from('users')
    .select('user_id, company_id')
    .eq('user_id', user_id)
    .single()

  if (targetErr || !target) return json(404, { error: 'Empleado no encontrado' })
  if (target.company_id !== caller.company_id) return json(403, { error: 'Forbidden' })

  // 1. Bloquear/desbloquear el login en auth.users (service role).
  const { error: banErr } = await supabase.auth.admin.updateUserById(user_id, {
    ban_duration: action === 'archive' ? BAN_FOREVER : BAN_NONE,
  })
  if (banErr) return json(500, { error: banErr.message })

  // 2. Marcar/desmarcar el perfil en la tabla users.
  const { data: employee, error: updateErr } = await supabase
    .from('users')
    .update({ deleted_at: action === 'archive' ? new Date().toISOString() : null })
    .eq('user_id', user_id)
    .select('*, department:departments(department_name), position:positions(position_name)')
    .single()

  if (updateErr) return json(500, { error: updateErr.message })

  return json(200, employee)
}
