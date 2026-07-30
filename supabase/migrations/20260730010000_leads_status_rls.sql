-- ─────────────────────────────────────────────────────────────────────────────
-- Módulo "Leads": estado de seguimiento comercial + acceso restringido.
--
-- La tabla public.leads ya existe (recibe los envíos del formulario de
-- contacto de la web vía service_role) y ya tiene RLS habilitado, pero sin
-- ninguna policy — hoy ningún usuario autenticado puede leerla ni escribirla
-- desde el panel. Esta migración:
--   1. Añade el ciclo de vida comercial del lead (status + quién/cuándo lo
--      movió).
--   2. Abre acceso de lectura/actualización SOLO a nivel 3, 4 o admin, con el
--      mismo patrón de función gate que client_private_can_access() en
--      20260730000000_client_private_contact.sql.
--   3. Siembra las capacidades 'leads' y 'leads.manage' en module_permissions
--      con min_level 3 (mismo criterio de nivel que la RLS, para que la UI y
--      la base de datos coincidan).
--
-- No se crean policies de INSERT/DELETE: los leads entran desde la web con
-- service_role (que bypassa RLS) y no se borran desde el panel.
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.leads
  add column status text not null default 'pendiente'
    check (status in ('pendiente', 'contactado', 'cancelado')),
  add column updated_at timestamptz,
  add column updated_by uuid references public.users(user_id);

-- Predicado de acceso: nivel >= 3 o admin (mismo patrón que
-- client_private_can_access en 20260730000000_client_private_contact.sql).
create or replace function public.leads_can_access()
returns boolean
language sql stable security definer set search_path = public
as $$
  select coalesce(admin, false) or coalesce(access_level, 1) >= 3
  from public.users
  where user_id = auth.uid()
$$;

comment on function public.leads_can_access() is
  'true si el usuario autenticado es admin o tiene access_level >= 3. '
  'Gate de acceso al módulo Leads (formularios de contacto de la web).';

-- Lectura: solo nivel 3/4/admin
create policy "leads_read" on public.leads
  for select to authenticated
  using (leads_can_access());

-- Actualización de estado: solo nivel 3/4/admin
create policy "leads_update" on public.leads
  for update to authenticated
  using     (leads_can_access())
  with check (leads_can_access());

-- ── Seed de capacidades ─────────────────────────────────────────────────────
-- 'leads' (ver el módulo) y 'leads.manage' (cambiar estado) → nivel 3+.
-- ON CONFLICT DO NOTHING: no pisa configuraciones que el admin ya haya guardado.
do $$
declare
  cid text;
begin
  for cid in
    select distinct company_id::text from public.users where company_id is not null
  loop
    insert into public.module_permissions (company_id, module_key, rules) values
      (cid, 'leads',
       '{"rules":[{"all":[{"type":"min_level","value":3,"ids":[]}]}]}'::jsonb)
    on conflict (company_id, module_key) do nothing;

    insert into public.module_permissions (company_id, module_key, rules) values
      (cid, 'leads.manage',
       '{"rules":[{"all":[{"type":"min_level","value":3,"ids":[]}]}]}'::jsonb)
    on conflict (company_id, module_key) do nothing;
  end loop;
end;
$$;
