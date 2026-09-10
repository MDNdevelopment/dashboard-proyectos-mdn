-- Migration: no notificar a un usuario que se auto-asigna una tarea, ni al crearla
-- ni al reasignarla después. `created_by` se preserva en updates (no identifica al
-- actor de una reasignación), así que se usa auth.uid() como actor real de la
-- operación; se conserva la comparación con created_by en INSERT como red de
-- seguridad para escrituras sin sesión (service_role, backfills).

create or replace function public.notify_task_assignees()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_new_ids text[];
  v_id      text;
  v_actor   text := coalesce(auth.uid()::text, '');
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
    -- Skip notifying whoever performed this insert/update (self-assignment)
    if v_id = v_actor then
      continue;
    end if;

    -- On INSERT without a session (service_role, backfills), fall back to created_by
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
