-- ─────────────────────────────────────────────────────────────────────────────
-- Datos privados de contacto del cliente (teléfono + correo de la cuenta de
-- Instagram). Sensibles: solo visibles/editables por nivel 3, 4 o admin.
--
-- Se guardan en tabla aparte (no como columnas de metric_clients) porque RLS
-- de Postgres es por fila, no por columna: metric_clients tiene lectura
-- abierta a cualquier autenticado (metric_clients_authenticated_read), así
-- que ocultar columnas en la UI no impediría que igual viajen al navegador
-- de un usuario de nivel bajo. Aislarlas en su propia tabla con su propia
-- policy de SELECT es la única forma de que el dato no salga de la base.
-- ─────────────────────────────────────────────────────────────────────────────

create table public.metric_client_private (
  client_id       uuid primary key references public.metric_clients(id) on delete cascade,
  phone           text,
  instagram_email text,
  updated_at      timestamptz not null default now()
);

alter table public.metric_client_private enable row level security;

-- Predicado de acceso: nivel >= 3 o admin (mismo patrón que task_user_view_all
-- en 20260709000000_tasks_line_scoped_rls.sql).
create or replace function public.client_private_can_access()
returns boolean
language sql stable security definer set search_path = public
as $$
  select coalesce(admin, false) or coalesce(access_level, 1) >= 3
  from public.users
  where user_id = auth.uid()
$$;

comment on function public.client_private_can_access() is
  'true si el usuario autenticado es admin o tiene access_level >= 3. '
  'Gate de acceso a metric_client_private (datos privados de contacto del cliente).';

-- Lectura: solo nivel 3/4/admin
create policy "client_private_read" on public.metric_client_private
  for select to authenticated
  using (client_private_can_access());

-- Escritura: requiere la capability de gestión de clientes Y nivel 3/4/admin
create policy "client_private_write_insert" on public.metric_client_private
  for insert to authenticated
  with check (user_can('empresa.clientes.manage') and client_private_can_access());

create policy "client_private_write_update" on public.metric_client_private
  for update to authenticated
  using     (user_can('empresa.clientes.manage') and client_private_can_access())
  with check (user_can('empresa.clientes.manage') and client_private_can_access());

create policy "client_private_write_delete" on public.metric_client_private
  for delete to authenticated
  using (user_can('empresa.clientes.manage') and client_private_can_access());
