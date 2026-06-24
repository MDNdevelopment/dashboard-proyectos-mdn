import { supabase } from './_lib/supabase.js'
import { requireAdmin } from './_lib/requireAdmin.js'

const json = (statusCode, body) => ({
  statusCode,
  headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  body: JSON.stringify(body),
})

export const handler = async (event) => {
  if (event.httpMethod !== 'POST') return json(405, { error: 'Method Not Allowed' })

  // Verificar JWT + admin
  const { error: authError, caller } = await requireAdmin(event)
  if (authError) return authError

  // Parsear body
  let body
  try {
    body = JSON.parse(event.body ?? '{}')
  } catch {
    return json(400, { error: 'Body JSON inválido' })
  }

  const { email, first_name, last_name, department_id, position_id, access_level, admin } = body

  // Validación básica
  if (!email?.trim())      return json(400, { error: 'El email es obligatorio' })
  if (!first_name?.trim()) return json(400, { error: 'El nombre es obligatorio' })
  if (!last_name?.trim())  return json(400, { error: 'El apellido es obligatorio' })

  // 1. Crear cuenta auth via invitación — el empleado recibirá un email para fijar su contraseña
  const { data: inviteData, error: inviteErr } =
    await supabase.auth.admin.inviteUserByEmail(email.trim())

  if (inviteErr) return json(400, { error: inviteErr.message })

  // 2. Insertar perfil en la tabla users
  //    Importante: company_id viene del caller (server-trusted), no del body.
  const { data: employee, error: insertErr } = await supabase
    .from('users')
    .insert({
      user_id:      inviteData.user.id,
      email:        email.trim(),
      first_name:   first_name.trim(),
      last_name:    last_name.trim(),
      department_id: department_id || null,
      position_id:   position_id   || null,
      access_level:  Number(access_level) || 1,
      admin:         !!admin,
      company_id:    caller.company_id,
    })
    .select('*, department:departments(department_name), position:positions(position_name)')
    .single()

  if (insertErr) return json(500, { error: insertErr.message })

  return json(201, employee)
}
