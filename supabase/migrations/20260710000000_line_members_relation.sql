-- Migrate metric_lines.member_user_ids (jsonb array) to a proper relation table.
-- Also updates all DB functions and RLS policies that depended on the old column.

-- 1. Relation table
create table public.metric_line_members (
  line_id    uuid not null references public.metric_lines(id) on delete cascade,
  user_id    text not null,
  created_at timestamptz not null default now(),
  primary key (line_id, user_id)
);

alter table public.metric_line_members enable row level security;

create policy "auth users full access" on public.metric_line_members
  for all to authenticated using (true) with check (true);

-- 2. Backfill from existing jsonb column
insert into public.metric_line_members (line_id, user_id)
select id, jsonb_array_elements_text(member_user_ids)
from public.metric_lines
where member_user_ids <> '[]'::jsonb
on conflict do nothing;

-- 3. Drop policies that depend on member_user_ids before dropping the column
drop policy if exists "metric_reports_select" on public.metric_reports;
drop policy if exists "metric_reports_insert" on public.metric_reports;
drop policy if exists "metric_reports_update" on public.metric_reports;
drop policy if exists "metric_reports_delete" on public.metric_reports;

-- 4. Drop the old column
alter table public.metric_lines drop column member_user_ids;

-- 5. Fix task_user_in_line()
create or replace function public.task_user_in_line(p_team_id text)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.metric_line_members
    where line_id::text = p_team_id
      and user_id = auth.uid()::text
  )
$$;

-- 6. Fix notif_client_recipients()
create or replace function public.notif_client_recipients(
  p_company_id text,
  p_line_id    uuid
)
returns table (user_id text)
language sql
security definer
stable
set search_path = public
as $$
  select distinct mlm.user_id
    from public.metric_line_members mlm
   where mlm.line_id = p_line_id
     and p_line_id is not null
  union
  select u.user_id::text
    from public.users u
   where u.company_id = p_company_id::uuid
     and u.access_level >= 4;
$$;

-- 7. Recreate metric_reports RLS policies using metric_line_members
create policy "metric_reports_select" on public.metric_reports
  for select to authenticated
  using (
    metrics_user_view_all()
    or (
      metrics_user_can_view()
      and exists (
        select 1 from public.metric_line_members mlm
        where mlm.line_id = metric_reports.line_id
          and mlm.user_id = auth.uid()::text
      )
    )
  );

create policy "metric_reports_insert" on public.metric_reports
  for insert to authenticated
  with check (
    metrics_user_view_all()
    or (
      metrics_user_can_view()
      and exists (
        select 1 from public.metric_line_members mlm
        where mlm.line_id = line_id
          and mlm.user_id = auth.uid()::text
      )
    )
  );

create policy "metric_reports_update" on public.metric_reports
  for update to authenticated
  using (
    metrics_user_view_all()
    or (
      metrics_user_can_view()
      and exists (
        select 1 from public.metric_line_members mlm
        where mlm.line_id = metric_reports.line_id
          and mlm.user_id = auth.uid()::text
      )
    )
  )
  with check (
    metrics_user_view_all()
    or (
      metrics_user_can_view()
      and exists (
        select 1 from public.metric_line_members mlm
        where mlm.line_id = metric_reports.line_id
          and mlm.user_id = auth.uid()::text
      )
    )
  );

create policy "metric_reports_delete" on public.metric_reports
  for delete to authenticated
  using (
    metrics_user_view_all()
    or (
      metrics_user_can_view()
      and exists (
        select 1 from public.metric_line_members mlm
        where mlm.line_id = metric_reports.line_id
          and mlm.user_id = auth.uid()::text
      )
    )
  );
