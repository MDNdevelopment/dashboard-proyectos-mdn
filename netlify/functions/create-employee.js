import { supabase } from './_lib/supabase.js'
import { requireAdmin } from './_lib/requireAdmin.js'
import { classifyEmployeeCreation } from '../../src/lib/employees.js'

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

  const {
    email,
    first_name,
    last_name,
    phone_number,
    birth_date,
    hire_date,
    department_id,
    position_id,
    access_level,
    admin,
    on_probation,
  } = body

  // Validación básica
  if (!email?.trim()) return json(400, { error: 'El email es obligatorio' })
  if (!first_name?.trim()) return json(400, { error: 'El nombre es obligatorio' })
  if (!last_name?.trim()) return json(400, { error: 'El apellido es obligatorio' })

  const cleanEmail = email.trim().toLowerCase()

  // 0. Si ya existe un perfil con este email (activo o archivado), no reintentar la
  //    invitación/insert: inviteUserByEmail reutiliza la cuenta auth existente y el
  //    insert siguiente violaría users_pkey. Bloquear con un mensaje claro en su lugar.
  const { data: existing } = await supabase
    .from('users')
    .select('user_id, deleted_at')
    .eq('company_id', caller.company_id)
    .ilike('email', cleanEmail)
    .maybeSingle()

  const classification = classifyEmployeeCreation(existing)
  if (classification === 'active-duplicate') {
    return json(409, { error: 'Ya existe un empleado activo con ese email.' })
  }
  if (classification === 'archived') {
    return json(409, {
      error: 'Ese email pertenece a un empleado archivado. Restáuralo desde "Ver eliminados".',
    })
  }

  // 1. Crear cuenta auth via invitación — el empleado recibirá un email para fijar su contraseña
  //    redirectTo explícito: sin esto, Supabase usa el "Site URL" configurado en el panel
  //    (Authentication > URL Configuration), que puede quedar desactualizado si cambia el dominio.
  //    data.must_set_password: bandera en user_metadata que ProtectedRoute usa para bloquear
  //    el acceso al dashboard hasta que el invitado fije su contraseña (ver ResetPasswordPage).
  const { data: inviteData, error: inviteErr } = await supabase.auth.admin.inviteUserByEmail(
    cleanEmail,
    {
      redirectTo: 'https://gestion.mdnpublicidad.com/reset-password',
      data: { must_set_password: true },
    },
  )

  if (inviteErr) return json(400, { error: inviteErr.message })

  // 2. Insertar perfil en la tabla users
  //    Importante: company_id viene del caller (server-trusted), no del body.
  const { data: employee, error: insertErr } = await supabase
    .from('users')
    .insert({
      user_id: inviteData.user.id,
      email: cleanEmail,
      first_name: first_name.trim(),
      last_name: last_name.trim(),
      phone_number: phone_number?.trim() || null,
      birth_date: birth_date || null,
      hire_date: hire_date || null,
      department_id: department_id || null,
      position_id: position_id || null,
      access_level: Number(access_level) || 1,
      admin: !!admin,
      on_probation: !!on_probation,
      company_id: caller.company_id,
    })
    .select('*, department:departments(department_name), position:positions(position_name)')
    .single()

  if (insertErr) {
    // Red de seguridad ante carreras o cuentas auth huérfanas: no filtrar el mensaje
    // crudo de Postgres al usuario final.
    if (insertErr.code === '23505') {
      return json(409, { error: 'Ya existe un empleado con ese email.' })
    }
    return json(500, { error: insertErr.message })
  }

  return json(201, employee)
}
