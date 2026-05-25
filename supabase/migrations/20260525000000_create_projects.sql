create table public.projects (
  id           uuid        primary key default gen_random_uuid(),
  name         text        not null,
  team         text,
  requirements text,
  status       text        not null default 'Pendiente'
               check (status in ('Pendiente','En proceso','Completado')),
  departments  text[]      not null default '{}',
  phases       jsonb       not null default '[]'::jsonb,
  created_at   timestamptz not null default now()
);

alter table public.projects enable row level security;

create policy "authenticated_read"
  on public.projects for select
  to authenticated using (true);

create policy "authenticated_insert"
  on public.projects for insert
  to authenticated with check (true);

create policy "authenticated_update"
  on public.projects for update
  to authenticated using (true) with check (true);

create policy "authenticated_delete"
  on public.projects for delete
  to authenticated using (true);

-- Enable realtime for cross-user live updates
alter publication supabase_realtime add table public.projects;
