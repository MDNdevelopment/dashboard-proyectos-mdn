-- Add per-user flag to bypass task team scoping without changing access_level.
-- Use case: a user at level 3 with no line membership needs to see all tasks
-- (e.g. Katherine Mora), but must keep level 3 in other modules.

-- 1. Add column
alter table public.users
  add column if not exists tasks_view_all boolean not null default false;

-- 2. Update task_user_view_all() to include the new flag
create or replace function public.task_user_view_all()
returns boolean
language sql stable security definer set search_path = public
as $$
  select coalesce(admin, false)
      or coalesce(access_level, 1) >= 4
      or coalesce(tasks_view_all, false)
  from public.users
  where user_id = auth.uid()
$$;

-- 3. Grant visibility to Katherine Mora
--    Verify first: run the SELECT below and confirm it returns exactly one row
--    before the UPDATE executes.
do $$
declare
  matched_count int;
begin
  select count(*) into matched_count
  from public.users
  where first_name ilike 'katherine' and last_name ilike 'mora';

  if matched_count = 1 then
    update public.users
    set tasks_view_all = true
    where first_name ilike 'katherine' and last_name ilike 'mora';
  elsif matched_count = 0 then
    raise notice 'tasks_view_all: no user found matching Katherine Mora — flag not set.';
  else
    raise exception 'tasks_view_all: % users match Katherine Mora — set flag manually to avoid ambiguity.', matched_count;
  end if;
end;
$$;
