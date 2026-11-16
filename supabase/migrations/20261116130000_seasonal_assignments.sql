-- Chequeo de temporada: personal asignado a mano por cliente y temporada.
--
-- Jefe y SM (las dos casillas con nombre que tiene la hoja) arrancan con lo que ya hay en
-- MAPPI (jefe = líder de la línea; SM = el del cliente). Cuando alguien los cambia en la
-- grilla de la temporada, se guarda UNA fila aquí y solo vale para esa temporada: no toca la
-- línea ni el cliente.
--
--  · Sin fila  → se usa el valor de MAPPI.
--  · Con fila  → manda user_id; user_id null = «Sin asignar» a propósito.
--
-- RLS: espejo de seasonal_pieces (chequeo.manage + línea propia, línea general o ver todo).

create table if not exists public.seasonal_assignments (
  id           uuid primary key default gen_random_uuid(),
  company_id   text not null,
  campaign_id  uuid not null references public.seasonal_campaigns(id) on delete cascade,
  client_id    uuid not null references public.metric_clients(id) on delete cascade,
  -- Snapshot de la línea al guardar (RLS sin join); cuentas sin línea guardan la general.
  line_id      uuid references public.metric_lines(id) on delete set null,
  role         text not null,
  user_id      text,
  updated_by   text,
  updated_at   timestamptz not null default now(),
  constraint seasonal_assignments_role_check check (
    role in ('jefe', 'sm')
  ),
  constraint seasonal_assignments_unique unique (campaign_id, client_id, role)
);

create index if not exists seasonal_assignments_company_campaign_line_idx
  on public.seasonal_assignments (company_id, campaign_id, line_id);

alter table public.seasonal_assignments enable row level security;

create policy "seasonal_assignments_select" on public.seasonal_assignments
  for select to authenticated
  using (true);

create policy "seasonal_assignments_insert" on public.seasonal_assignments
  for insert to authenticated
  with check (
    user_can('chequeo.manage')
    and (
      task_user_view_all()
      or user_can('chequeo.ver_todo')
      or task_user_in_line(line_id::text)
      or task_is_general_line(line_id::text)
    )
  );

create policy "seasonal_assignments_update" on public.seasonal_assignments
  for update to authenticated
  using (
    user_can('chequeo.manage')
    and (
      task_user_view_all()
      or user_can('chequeo.ver_todo')
      or task_user_in_line(line_id::text)
      or task_is_general_line(line_id::text)
    )
  )
  with check (
    user_can('chequeo.manage')
    and (
      task_user_view_all()
      or user_can('chequeo.ver_todo')
      or task_user_in_line(line_id::text)
      or task_is_general_line(line_id::text)
    )
  );

create policy "seasonal_assignments_delete" on public.seasonal_assignments
  for delete to authenticated
  using (
    user_can('chequeo.manage')
    and (
      task_user_view_all()
      or user_can('chequeo.ver_todo')
      or task_user_in_line(line_id::text)
      or task_is_general_line(line_id::text)
    )
  );

-- Realtime: asignaciones en vivo entre usuarios.
alter publication supabase_realtime add table public.seasonal_assignments;
