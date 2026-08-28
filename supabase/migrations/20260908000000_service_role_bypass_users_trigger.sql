-- El trigger prevent_users_privilege_escalation (20260828160000) decide con
-- is_company_admin(), que lee auth.uid(). Las Netlify Functions escriben con
-- service_role: auth.uid() es NULL ahí, así que is_company_admin() siempre
-- daba false y el trigger abortaba CUALQUIER UPDATE del backend que tocara
-- access_level/admin/deleted_at/monthly_salary/company_id/user_id — incluido
-- archive-employee.js (siempre escribe deleted_at) y update-employee.js al
-- guardar sueldo o nivel, tumbando el UPDATE completo (también avatar_url).
--
-- Las Netlify Functions ya validan capacidad y anti-escalada antes de llegar
-- aquí (requireCapability.js, update-employee.js), así que el trigger solo
-- necesita proteger las escrituras directas de usuarios autenticados vía RLS.
create or replace function public.prevent_users_privilege_escalation()
returns trigger
language plpgsql
security definer
set search_path = public
as $function$
begin
  if coalesce(auth.role(), '') = 'service_role' then
    return new;
  end if;

  if not public.is_company_admin() then
    if new.access_level is distinct from old.access_level
      or new.admin is distinct from old.admin
      or new.deleted_at is distinct from old.deleted_at
      or new.monthly_salary is distinct from old.monthly_salary
      or new.company_id is distinct from old.company_id
      or new.user_id is distinct from old.user_id
    then
      raise exception 'No autorizado para modificar campos protegidos de users';
    end if;
  end if;
  return new;
end;
$function$;
