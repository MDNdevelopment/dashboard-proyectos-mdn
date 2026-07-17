-- Migration: grupo "Independientes" en Tareas.
-- Añade una fila oculta por empresa en metric_lines (is_general=true) que representa
-- a los empleados no asignados a ninguna línea. Su membresía se deriva en el cliente
-- (no se persiste en metric_line_members); esta migración solo habilita que las tareas
-- puedan apuntar a esa fila (team_id uuid válido) y que esos empleados vean sus tareas
-- vía RLS.

alter table public.metric_lines
  add column if not exists is_general boolean not null default false;

-- Una sola fila general por empresa.
create unique index if not exists metric_lines_one_general_per_company
  on public.metric_lines (company_id)
  where is_general;

-- Backfill: crear la fila "Independientes" para cada empresa que no la tenga aún.
-- users.company_id es uuid; metric_lines.company_id es text (sin FK formal, ver
-- convención "relaciones texto sin FK" en ARQUITECTURA.md) — se castea al comparar.
insert into public.metric_lines (company_id, name, color, sort_order, is_general)
select distinct u.company_id::text, 'Independientes', '#9CA3AF', 9999, true
from public.users u
where u.company_id is not null
  and not exists (
    select 1 from public.metric_lines l
    where l.company_id = u.company_id::text and l.is_general
  );

-- ─── RLS: permitir que empleados sin línea vean/editen tareas del grupo general ────

create or replace function public.task_is_general_line(p_team_id text)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.metric_lines
    where id::text = p_team_id
      and is_general
  )
$$;

create or replace function public.task_user_has_no_line()
returns boolean
language sql stable security definer set search_path = public
as $$
  select not exists (
    select 1 from public.metric_line_members m
    join public.metric_lines l on l.id = m.line_id
    where m.user_id = auth.uid()::text
      and coalesce(l.is_general, false) = false
  )
$$;

drop policy if exists "tasks_select" on public.tasks;
drop policy if exists "tasks_insert" on public.tasks;
drop policy if exists "tasks_update" on public.tasks;
drop policy if exists "tasks_delete" on public.tasks;

create policy "tasks_select" on public.tasks
  for select to authenticated
  using (
    task_user_view_all()
    or (task_user_access_level() >= 2 and task_user_in_line(team_id::text))
    or (task_user_access_level() >= 2 and task_is_general_line(team_id::text) and task_user_has_no_line())
    or auth.uid()::text = any(assignee_ids)
    or support_id  = auth.uid()::text
    or created_by  = auth.uid()::text
  );

create policy "tasks_insert" on public.tasks
  for insert to authenticated
  with check (
    task_user_view_all()
    or (task_user_access_level() >= 2 and task_user_in_line(team_id::text))
    or (task_user_access_level() >= 2 and task_is_general_line(team_id::text) and task_user_has_no_line())
    or auth.uid()::text = any(assignee_ids)
  );

create policy "tasks_update" on public.tasks
  for update to authenticated
  using (
    task_user_view_all()
    or (task_user_access_level() >= 2 and task_user_in_line(team_id::text))
    or (task_user_access_level() >= 2 and task_is_general_line(team_id::text) and task_user_has_no_line())
    or auth.uid()::text = any(assignee_ids)
    or support_id  = auth.uid()::text
    or created_by  = auth.uid()::text
  )
  with check (
    task_user_view_all()
    or (task_user_access_level() >= 2 and task_user_in_line(team_id::text))
    or (task_user_access_level() >= 2 and task_is_general_line(team_id::text) and task_user_has_no_line())
    or auth.uid()::text = any(assignee_ids)
    or support_id  = auth.uid()::text
    or created_by  = auth.uid()::text
  );

create policy "tasks_delete" on public.tasks
  for delete to authenticated
  using (
    task_user_view_all()
    or (task_user_access_level() >= 2 and task_user_in_line(team_id::text))
    or (task_user_access_level() >= 2 and task_is_general_line(team_id::text) and task_user_has_no_line())
  );
