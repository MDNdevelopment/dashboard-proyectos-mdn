-- Migration: support multiple assignees per task
-- Adds assignee_ids (text[]) alongside the existing assignee_id column.
-- assignee_id is kept (not dropped) to avoid a destructive operation; it is
-- deprecated — the application no longer writes to it after this migration.

alter table public.tasks
  add column if not exists assignee_ids text[] not null default '{}';

-- Backfill: migrate existing single-assignee rows into the new array column.
update public.tasks
  set assignee_ids = array[assignee_id]
  where assignee_id is not null
    and assignee_ids = '{}';

comment on column public.tasks.assignee_ids is 'Array of user_ids responsible for the task (replaces assignee_id)';
comment on column public.tasks.assignee_id  is 'DEPRECATED — kept for backwards compat. Use assignee_ids instead.';
