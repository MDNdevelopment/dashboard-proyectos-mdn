-- Tabla de permisos por módulo (scopeada por company_id para multi-empresa)
create table if not exists public.module_permissions (
  id          uuid primary key default gen_random_uuid(),
  company_id  text not null,
  module_key  text not null,
  rules       jsonb not null default '{"rules":[]}',
  updated_at  timestamptz not null default now(),
  unique (company_id, module_key)
);

-- RLS
alter table public.module_permissions enable row level security;

-- Helper: ¿es admin de la empresa?
-- Sigue el mismo patrón que task_user_privileged() en 20260629000000_tasks_level1_rls.sql
create or replace function public.is_company_admin()
returns boolean
language sql
security definer
stable
as $$
  select coalesce(
    (select admin from public.users where user_id = auth.uid()),
    false
  )
$$;

-- Lectura: cualquier usuario autenticado puede leer (la app filtra por company_id)
create policy "mp_select"
  on public.module_permissions
  for select
  to authenticated
  using (true);

-- Escritura: solo admins
create policy "mp_insert"
  on public.module_permissions
  for insert
  to authenticated
  with check (is_company_admin());

create policy "mp_update"
  on public.module_permissions
  for update
  to authenticated
  using (is_company_admin())
  with check (is_company_admin());

create policy "mp_delete"
  on public.module_permissions
  for delete
  to authenticated
  using (is_company_admin());

-- Actualizar updated_at automáticamente
create or replace function public.mp_set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger mp_updated_at
  before update on public.module_permissions
  for each row execute procedure public.mp_set_updated_at();
