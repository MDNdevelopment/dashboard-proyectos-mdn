-- Razón de bloqueo en tasks
alter table public.tasks
  add column if not exists blocked_reason text;

-- Comentarios de tareas
create table public.task_comments (
  id         uuid        primary key default gen_random_uuid(),
  task_id    uuid        not null references public.tasks(id) on delete cascade,
  company_id text        not null,
  author_id  text        not null,
  content    text        not null,
  created_at timestamptz not null default now()
);

alter table public.task_comments enable row level security;

create policy "task_comments_read"
  on public.task_comments for select
  to authenticated using (true);

create policy "task_comments_insert"
  on public.task_comments for insert
  to authenticated with check (true);

create policy "task_comments_delete"
  on public.task_comments for delete
  to authenticated using (true);
