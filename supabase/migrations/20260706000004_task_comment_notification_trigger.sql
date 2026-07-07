-- Trigger: notify assignees and support person when a new task comment is created.
-- Fires AFTER INSERT on task_comments; inserts one notification per recipient
-- (excluding the comment author). email=true so the notify-dispatch edge function
-- also sends an email via Resend.

create or replace function public.notify_task_comment()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_task        record;
  v_recipient   text;
  v_recipients  text[];
  v_body        text;
begin
  -- Fetch assignee_ids and support_id from the related task
  select assignee_ids, support_id
    into v_task
    from public.tasks
   where id = NEW.task_id;

  if not found then
    return NEW;
  end if;

  -- Build recipients: assignee_ids + support_id, deduped, nulls removed
  v_recipients := array(
    select distinct unnest
      from unnest(
        coalesce(v_task.assignee_ids, '{}') ||
        array[v_task.support_id]
      ) as unnest
     where unnest is not null
       and unnest <> NEW.author_id
  );

  if array_length(v_recipients, 1) is null then
    return NEW;
  end if;

  v_body := left(NEW.content, 120);

  foreach v_recipient in array v_recipients loop
    insert into public.notifications (
      company_id,
      user_id,
      type,
      title,
      body,
      entity_type,
      entity_id,
      email,
      read
    ) values (
      NEW.company_id,
      v_recipient,
      'task_comment',
      'Nuevo comentario en tarea',
      v_body,
      'task',
      NEW.task_id::text,
      true,
      false
    );
  end loop;

  return NEW;
end;
$$;

create trigger trg_notify_task_comment
  after insert on public.task_comments
  for each row
  execute function public.notify_task_comment();
