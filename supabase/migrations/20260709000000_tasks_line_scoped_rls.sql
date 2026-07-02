-- Migration: tasks RLS scoped por línea según nivel de usuario.
-- Reemplaza las políticas de 20260702000002_tasks_multi_assignee_rls.sql.
-- Nivel 4/admin: todas las tareas. Nivel 2/3: solo tareas de su línea (metric_lines.member_user_ids).
-- Nivel 1: solo tareas donde es assignee/support/creator (sin cambios respecto a antes).

create or replace function public.task_user_view_all()
returns boolean
language sql stable security definer set search_path = public
as $$
  select coalesce(admin, false) or coalesce(access_level, 1) >= 4
  from public.users
  where user_id = auth.uid()
$$;

create or replace function public.task_user_access_level()
returns int
language sql stable security definer set search_path = public
as $$
  select coalesce(access_level, 1)
  from public.users
  where user_id = auth.uid()
$$;

create or replace function public.task_user_in_line(p_team_id text)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.metric_lines
    where id::text = p_team_id
      and member_user_ids ? auth.uid()::text
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
    or auth.uid()::text = any(assignee_ids)
    or support_id  = auth.uid()::text
    or created_by  = auth.uid()::text
  );

create policy "tasks_insert" on public.tasks
  for insert to authenticated
  with check (
    task_user_view_all()
    or (task_user_access_level() >= 2 and task_user_in_line(team_id::text))
    or auth.uid()::text = any(assignee_ids)
  );

create policy "tasks_update" on public.tasks
  for update to authenticated
  using (
    task_user_view_all()
    or (task_user_access_level() >= 2 and task_user_in_line(team_id::text))
    or auth.uid()::text = any(assignee_ids)
    or support_id  = auth.uid()::text
    or created_by  = auth.uid()::text
  )
  with check (
    task_user_view_all()
    or (task_user_access_level() >= 2 and task_user_in_line(team_id::text))
    or auth.uid()::text = any(assignee_ids)
    or support_id  = auth.uid()::text
    or created_by  = auth.uid()::text
  );

create policy "tasks_delete" on public.tasks
  for delete to authenticated
  using (
    task_user_view_all()
    or (task_user_access_level() >= 2 and task_user_in_line(team_id::text))
  );
