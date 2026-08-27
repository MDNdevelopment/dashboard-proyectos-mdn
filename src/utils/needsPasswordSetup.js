/**
 * Determina si una sesión de Supabase pertenece a un empleado invitado que todavía
 * no fijó su contraseña.
 *
 * `create-employee.js` marca la cuenta con `user_metadata.must_set_password: true` al
 * invitarla; `ResetPasswordPage` la limpia (poniéndola en `false`) al guardar la
 * contraseña. No se puede derivar esto de la URL del link de invitación porque el
 * cliente de Supabase consume el hash `#access_token` antes de que React monte.
 *
 * @param {object|null} session - sesión del contexto Auth (puede ser null)
 * @returns {boolean}
 */
export function needsPasswordSetup(session) {
  return session?.user?.user_metadata?.must_set_password === true
}
