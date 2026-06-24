-- ─── teams ────────────────────────────────────────────────────────────────────
create table public.teams (
  id         uuid        primary key default gen_random_uuid(),
  name       text        not null,
  company_id text        not null,
  created_at timestamptz not null default now()
);

alter table public.teams enable row level security;

create policy "teams_authenticated_read"
  on public.teams for select
  to authenticated using (true);

create policy "teams_authenticated_insert"
  on public.teams for insert
  to authenticated with check (true);

create policy "teams_authenticated_update"
  on public.teams for update
  to authenticated using (true) with check (true);

create policy "teams_authenticated_delete"
  on public.teams for delete
  to authenticated using (true);

alter publication supabase_realtime add table public.teams;

-- ─── team_members ──────────────────────────────────────────────────────────────
create table public.team_members (
  id         uuid        primary key default gen_random_uuid(),
  team_id    uuid        not null,
  user_id    text        not null,
  created_at timestamptz not null default now(),
  unique (team_id, user_id)
);

alter table public.team_members enable row level security;

create policy "team_members_authenticated_read"
  on public.team_members for select
  to authenticated using (true);

create policy "team_members_authenticated_insert"
  on public.team_members for insert
  to authenticated with check (true);

create policy "team_members_authenticated_update"
  on public.team_members for update
  to authenticated using (true) with check (true);

create policy "team_members_authenticated_delete"
  on public.team_members for delete
  to authenticated using (true);

alter publication supabase_realtime add table public.team_members;

-- ─── tasks ─────────────────────────────────────────────────────────────────────
create table public.tasks (
  id           uuid        primary key default gen_random_uuid(),
  company_id   text        not null,
  team_id      uuid        not null,
  client       text,
  description  text,
  source       text,
  assignee_id  text,
  support_id   text,
  created_by   text,
  request_date date,
  due_date     date,
  closed_date  date,
  status       text        not null default 'En proceso'
               check (status in ('En proceso','Por revisar','Bloqueado','Pendiente','Terminado')),
  created_at   timestamptz not null default now()
);

alter table public.tasks enable row level security;

create policy "tasks_authenticated_read"
  on public.tasks for select
  to authenticated using (true);

create policy "tasks_authenticated_insert"
  on public.tasks for insert
  to authenticated with check (true);

create policy "tasks_authenticated_update"
  on public.tasks for update
  to authenticated using (true) with check (true);

create policy "tasks_authenticated_delete"
  on public.tasks for delete
  to authenticated using (true);

alter publication supabase_realtime add table public.tasks;
