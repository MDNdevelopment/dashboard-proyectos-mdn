import { supabase } from './_lib/supabase.js'
import { requireCapability } from './_lib/requireCapability.js'
import { canAccessModule } from '../../src/lib/permissions.js'

const json = (statusCode, body) => ({
  statusCode,
  headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  body: JSON.stringify(body),
})

export const handler = async (event) => {
  if (event.httpMethod !== 'POST') return json(405, { error: 'Method Not Allowed' })

  // Verificar JWT + capacidad de RRHH (admin siempre pasa)
  const { error: authError, caller } = await requireCapability(event, 'empresa.empleados.manage')
  if (authError) return authError

  let body
  try {
    body = JSON.parse(event.body ?? '{}')
  } catch {
    return json(400, { error: 'Body JSON inválido' })
  }

  const {
    user_id,
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
    avatar_url,
    monthly_salary,
  } = body

  if (!user_id?.trim()) return json(400, { error: 'user_id es obligatorio' })
  if (!first_name?.trim()) return json(400, { error: 'El nombre es obligatorio' })
  if (!last_name?.trim()) return json(400, { error: 'El apellido es obligatorio' })

  // El empleado objetivo debe pertenecer a la misma empresa que el caller
  // (el service-role bypassa RLS, así que esta comprobación es obligatoria).
  const { data: target, error: targetErr } = await supabase
    .from('users')
    .select('user_id, company_id, admin, access_level')
    .eq('user_id', user_id)
    .single()

  if (targetErr || !target) return json(404, { error: 'Empleado no encontrado' })
  if (target.company_id !== caller.company_id) return json(403, { error: 'Forbidden' })

  // Anti-escalada: quien edita sin ser admin (p.ej. RRHH con
  // 'empresa.empleados.manage') no puede otorgar admin ni cambiar el nivel de
  // acceso del empleado, aunque el body los incluya — se conserva el valor
  // actual del empleado en vez de degradarlo (mismo criterio que
  // create-employee.js, que no permite asignar estos campos sin ser admin).
  const safeAdmin = caller.admin ? !!admin : target.admin
  const safeAccessLevel = caller.admin ? Number(access_level) || 1 : target.access_level

  const updatePayload = {
    first_name: first_name.trim(),
    last_name: last_name.trim(),
    phone_number: phone_number?.trim() || null,
    birth_date: birth_date || null,
    hire_date: hire_date || null,
    department_id: department_id || null,
    position_id: position_id || null,
    access_level: safeAccessLevel,
    admin: safeAdmin,
    on_probation: !!on_probation,
    avatar_url: avatar_url || null,
  }

  // Sueldo: solo lo escribe quien tiene permisos financieros
  // (admin, access_level >= 3, o la capability 'empresa.empleados.sensible').
  let privileged = caller.admin || (caller.access_level ?? 0) >= 3
  if (!privileged) {
    const { data: permRow, error: permErr } = await supabase
      .from('module_permissions')
      .select('rules')
      .eq('company_id', caller.company_id)
      .eq('module_key', 'empresa.empleados.sensible')
      .maybeSingle()
    if (permErr) return json(500, { error: 'Error verificando permisos' })

    const configByModule = { 'empresa.empleados.sensible': permRow?.rules ?? null }
    privileged = canAccessModule('empresa.empleados.sensible', caller, configByModule)
  }
  if (privileged) {
    updatePayload.monthly_salary =
      monthly_salary !== '' && monthly_salary != null ? Number(monthly_salary) : null
  }

  const { data: employee, error: updateErr } = await supabase
    .from('users')
    .update(updatePayload)
    .eq('user_id', user_id)
    .select('*, department:departments(department_name), position:positions(position_name)')
    .maybeSingle()

  if (updateErr) {
    console.error('update-employee: error al actualizar', updateErr)
    return json(500, { error: 'No se pudo guardar el empleado' })
  }
  if (!employee) {
    return json(500, {
      error: 'No se pudo guardar el empleado: la base de datos rechazó el cambio',
    })
  }

  return json(200, employee)
}
