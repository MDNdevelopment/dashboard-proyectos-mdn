-- Migration: update RLS policies to use assignee_ids (array) instead of assignee_id.
-- Replaces the policies from 20260629000000_tasks_level1_rls.sql.
-- The helper function task_user_privileged() is preserved unchanged.

-- Drop policies that compared against the single assignee_id column.
drop policy if exists "tasks_select" on public.tasks;
drop policy if exists "tasks_insert" on public.tasks;
drop policy if exists "tasks_update" on public.tasks;
drop policy if exists "tasks_delete" on public.tasks;

-- SELECT: privileged users see all tasks; others see only tasks where they are
-- an assignee, the support person, or the creator.
create policy "tasks_select" on public.tasks
  for select to authenticated
  using (
    task_user_privileged()
    or auth.uid()::text = any(assignee_ids)
    or support_id  = auth.uid()::text
    or created_by  = auth.uid()::text
  );

-- INSERT: privileged users can assign anyone; level-1 users must be in assignee_ids.
create policy "tasks_insert" on public.tasks
  for insert to authenticated
  with check (
    task_user_privileged()
    or auth.uid()::text = any(assignee_ids)
  );

-- UPDATE: same visibility as SELECT.
create policy "tasks_update" on public.tasks
  for update to authenticated
  using (
    task_user_privileged()
    or auth.uid()::text = any(assignee_ids)
    or support_id  = auth.uid()::text
    or created_by  = auth.uid()::text
  )
  with check (
    task_user_privileged()
    or auth.uid()::text = any(assignee_ids)
    or support_id  = auth.uid()::text
    or created_by  = auth.uid()::text
  );

-- DELETE: privileged users only (unchanged).
create policy "tasks_delete" on public.tasks
  for delete to authenticated
  using (task_user_privileged());
