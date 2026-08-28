-- Bloque 1.1: users tenía DELETE abierto a "public" (sin login) y UPDATE sin
-- with_check, permitiendo que cualquier usuario autenticado se pusiera
-- admin=true o subiera su access_level. Ver plan.md Bloque 1, hallazgo 1.1.

-- Fija search_path en is_company_admin() (Bloque 3, hallazgo 8) — SECURITY
-- DEFINER sin search_path fijo es vulnerable a hijacking del esquema.
create or replace function public.is_company_admin()
returns boolean
language sql
stable security definer
set search_path = public
as $function$
  select coalesce(
    (select admin from public.users where user_id = auth.uid()),
    false
  )
$function$;

drop policy if exists "Enable delete for users" on public.users;
drop policy if exists "can update" on public.users;
drop policy if exists "Enable insert for authenticated users only" on public.users;

create policy "users_delete_admin_only"
on public.users
for delete
to authenticated
using (public.is_company_admin());

create policy "users_insert_admin_only"
on public.users
for insert
to authenticated
with check (public.is_company_admin());

create policy "users_update_self_or_admin"
on public.users
for update
to authenticated
using (auth.uid() = user_id or public.is_company_admin())
with check (auth.uid() = user_id or public.is_company_admin());

-- RLS por sí sola no puede proteger columnas individuales dentro de una fila
-- propia: este trigger bloquea que un usuario no-admin, aun editando su propia
-- fila, cambie campos de privilegio/sensibles.
create or replace function public.prevent_users_privilege_escalation()
returns trigger
language plpgsql
security definer
set search_path = public
as $function$
begin
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

drop trigger if exists trg_prevent_users_privilege_escalation on public.users;

create trigger trg_prevent_users_privilege_escalation
before update on public.users
for each row execute function public.prevent_users_privilege_escalation();
