-- Migration: tasks RLS scoped by user level
-- Level 1 users (access_level < 2 and not admin) can only see/edit tasks where they
-- are the assignee, support, or creator. Privileged users (access_level >= 2 or admin)
-- retain full access to all tasks.

-- Helper function: returns true when the calling auth user is privileged.
-- SECURITY DEFINER so it can query the users table without triggering RLS recursion.
create or replace function public.task_user_privileged()
returns boolean
language sql stable security definer set search_path = public
as $$
  select coalesce(admin, false) or coalesce(access_level, 1) >= 2
  from public.users
  where user_id = auth.uid()    -- users.user_id is uuid; auth.uid() returns uuid
$$;

-- Drop the old fully-permissive policies created in 20260622000000_create_tareas.sql
drop policy if exists "tasks_authenticated_read"   on public.tasks;
drop policy if exists "tasks_authenticated_insert" on public.tasks;
drop policy if exists "tasks_authenticated_update" on public.tasks;
drop policy if exists "tasks_authenticated_delete" on public.tasks;

-- SELECT: privileged users see all tasks; others see only their own.
create policy "tasks_select" on public.tasks
  for select to authenticated
  using (
    task_user_privileged()
    or assignee_id = auth.uid()::text
    or support_id  = auth.uid()::text
    or created_by  = auth.uid()::text
  );

-- INSERT: privileged users can assign anyone; level-1 users must be the assignee themselves.
create policy "tasks_insert" on public.tasks
  for insert to authenticated
  with check (
    task_user_privileged()
    or assignee_id = auth.uid()::text
  );

-- UPDATE: same visibility as SELECT (can edit what you can see).
create policy "tasks_update" on public.tasks
  for update to authenticated
  using (
    task_user_privileged()
    or assignee_id = auth.uid()::text
    or support_id  = auth.uid()::text
    or created_by  = auth.uid()::text
  )
  with check (
    task_user_privileged()
    or assignee_id = auth.uid()::text
    or support_id  = auth.uid()::text
    or created_by  = auth.uid()::text
  );

-- DELETE: privileged users only.
create policy "tasks_delete" on public.tasks
  for delete to authenticated
  using (task_user_privileged());
