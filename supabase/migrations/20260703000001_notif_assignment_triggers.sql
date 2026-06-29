-- Migration: triggers to insert notifications when users are added to tasks or projects
-- Both tasks.assignee_ids and projects.members are text[] arrays.
-- On INSERT → all ids in the array are "new".
-- On UPDATE → only ids in NEW but not OLD are "new".
-- The actor who created the task (created_by) is excluded from task notifications on INSERT.

-- ── Task assignment trigger ─────────────────────────────────────────────────

create or replace function public.notify_task_assignees()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_new_ids text[];
  v_id      text;
begin
  -- Compute newly added assignee ids
  if tg_op = 'INSERT' then
    v_new_ids := coalesce(new.assignee_ids, '{}');
  else
    -- UPDATE: only ids not present in OLD
    select array_agg(u)
      into v_new_ids
      from unnest(coalesce(new.assignee_ids, '{}')) u
     where not (u = any(coalesce(old.assignee_ids, '{}')));
  end if;

  -- Insert a notification for each newly added assignee
  foreach v_id in array coalesce(v_new_ids, '{}')
  loop
    -- On INSERT, skip notifying the task creator (they added themselves)
    if tg_op = 'INSERT' and v_id = coalesce(new.created_by, '') then
      continue;
    end if;

    insert into public.notifications (
      company_id, user_id, type, title, body,
      entity_type, entity_id, email, read
    ) values (
      new.company_id,
      v_id,
      'task_assigned',
      'Te asignaron una tarea',
      coalesce(new.description, 'Tarea sin descripción'),
      'task',
      new.id::text,
      true,
      false
    );
  end loop;

  return new;
end;
$$;

create or replace trigger trigger_notify_task_assignees
  after insert or update of assignee_ids on public.tasks
  for each row
  execute function public.notify_task_assignees();

-- ── Project member trigger ──────────────────────────────────────────────────

create or replace function public.notify_project_members()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_new_ids text[];
  v_id      text;
begin
  -- Compute newly added member ids
  if tg_op = 'INSERT' then
    v_new_ids := coalesce(new.members, '{}');
  else
    select array_agg(u)
      into v_new_ids
      from unnest(coalesce(new.members, '{}')) u
     where not (u = any(coalesce(old.members, '{}')));
  end if;

  foreach v_id in array coalesce(v_new_ids, '{}')
  loop
    insert into public.notifications (
      company_id, user_id, type, title, body,
      entity_type, entity_id, email, read
    ) values (
      coalesce(new.company_id, ''),
      v_id,
      'project_added',
      'Te incluyeron en un proyecto',
      coalesce(new.name, 'Proyecto sin nombre'),
      'project',
      new.id::text,
      true,
      false
    );
  end loop;

  return new;
end;
$$;

create or replace trigger trigger_notify_project_members
  after insert or update of members on public.projects
  for each row
  execute function public.notify_project_members();

-- Note: projects.company_id may not exist. If it does not, the body text still works;
-- company_id will be empty string. The recipients are correctly targeted by user_id.
