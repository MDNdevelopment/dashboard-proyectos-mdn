-- Migration: notificaciones del módulo Reuniones
--   1. Trigger de asignación: notifica a los participantes al crearse la reunión o al
--      agregarse nuevos participantes (mismo patrón que notify_task_assignees()).
--   2. pg_cron cada 15 minutos: recordatorio el día previo (~24h antes) y 1 hora antes.
-- Ambos insertan en public.notifications con email = true, para que el trigger existente
-- notify_dispatch_email() dispare también el correo (Resend).

-- ── 1. Trigger de asignación (al crear / agregar participantes) ─────────────

create or replace function public.notify_meeting_attendees()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_new_ids text[];
  v_id      text;
  v_title   text;
  v_body    text;
begin
  if tg_op = 'INSERT' then
    v_new_ids := coalesce(new.attendee_ids, '{}');
  else
    select array_agg(u)
      into v_new_ids
      from unnest(coalesce(new.attendee_ids, '{}')) u
     where not (u = any(coalesce(old.attendee_ids, '{}')));
  end if;

  v_title := '📅 Nueva reunión: ' || new.title;
  v_body  := coalesce(new.client_name, 'Sin cliente') || ' — '
             || to_char(new.starts_at at time zone 'America/Caracas', 'DD/MM/YYYY HH24:MI');

  foreach v_id in array coalesce(v_new_ids, '{}')
  loop
    if tg_op = 'INSERT' and v_id = coalesce(new.created_by, '') then
      continue;
    end if;

    insert into public.notifications (
      company_id, user_id, type, title, body,
      entity_type, entity_id, email, read, dedupe_key
    ) values (
      new.company_id,
      v_id,
      'meeting_invite',
      v_title,
      v_body,
      'meeting',
      new.id::text,
      true,
      false,
      'meeting_invite:' || new.id::text || ':' || v_id
    )
    on conflict (dedupe_key) where dedupe_key is not null do nothing;
  end loop;

  return new;
end;
$$;

create or replace trigger trigger_notify_meeting_attendees
  after insert or update of attendee_ids on public.meetings
  for each row
  execute function public.notify_meeting_attendees();

-- ── 2. Recordatorios: día previo (~24h) y 1 hora antes ───────────────────────
-- Corre cada 15 min y usa ventanas [+1h, +1h15m) y [+24h, +24h15m) para no perder
-- reuniones entre ejecuciones. dedupe_key incluye starts_at para que reprogramar la
-- reunión (nuevo starts_at) genere nuevos recordatorios en vez de quedar suprimido.

create or replace function public.enqueue_meeting_reminders()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now       timestamptz := now();
  v_rec       record;
  v_id        text;
  v_title     text;
  v_body      text;
  v_where     text;
begin
  -- Recordatorio: día previo (reunión entre ahora+24h y ahora+24h15m)
  for v_rec in
    select m.id, m.title, m.client_name, m.company_id, m.starts_at, m.attendee_ids,
           m.modality, m.location, m.meeting_url
      from public.meetings m
     where m.status = 'programada'
       and m.starts_at >= v_now + interval '24 hours'
       and m.starts_at <  v_now + interval '24 hours 15 minutes'
  loop
    v_title := '📅 Reunión mañana: ' || v_rec.title;
    v_where := case v_rec.modality
                 when 'videollamada' then coalesce(v_rec.meeting_url, 'Link por confirmar')
                 else coalesce(v_rec.location, 'Lugar por confirmar')
               end;
    v_body  := coalesce(v_rec.client_name, 'Sin cliente') || ' — '
               || to_char(v_rec.starts_at at time zone 'America/Caracas', 'DD/MM/YYYY HH24:MI')
               || ' — ' || v_where;

    foreach v_id in array coalesce(v_rec.attendee_ids, '{}')
    loop
      insert into public.notifications (
        company_id, user_id, type, title, body,
        entity_type, entity_id, email, read, dedupe_key
      ) values (
        v_rec.company_id, v_id, 'meeting_reminder_day', v_title, v_body,
        'meeting', v_rec.id::text, true, false,
        'meeting_reminder_day:' || v_rec.id::text || ':' || v_rec.starts_at::text || ':' || v_id
      )
      on conflict (dedupe_key) where dedupe_key is not null do nothing;
    end loop;
  end loop;

  -- Recordatorio: 1 hora antes (reunión entre ahora+1h y ahora+1h15m)
  for v_rec in
    select m.id, m.title, m.client_name, m.company_id, m.starts_at, m.attendee_ids,
           m.modality, m.location, m.meeting_url
      from public.meetings m
     where m.status = 'programada'
       and m.starts_at >= v_now + interval '1 hour'
       and m.starts_at <  v_now + interval '1 hour 15 minutes'
  loop
    v_title := '⏰ Reunión en 1 hora: ' || v_rec.title;
    v_where := case v_rec.modality
                 when 'videollamada' then coalesce(v_rec.meeting_url, 'Link por confirmar')
                 else coalesce(v_rec.location, 'Lugar por confirmar')
               end;
    v_body  := coalesce(v_rec.client_name, 'Sin cliente') || ' — '
               || to_char(v_rec.starts_at at time zone 'America/Caracas', 'HH24:MI')
               || ' — ' || v_where;

    foreach v_id in array coalesce(v_rec.attendee_ids, '{}')
    loop
      insert into public.notifications (
        company_id, user_id, type, title, body,
        entity_type, entity_id, email, read, dedupe_key
      ) values (
        v_rec.company_id, v_id, 'meeting_reminder_hour', v_title, v_body,
        'meeting', v_rec.id::text, true, false,
        'meeting_reminder_hour:' || v_rec.id::text || ':' || v_rec.starts_at::text || ':' || v_id
      )
      on conflict (dedupe_key) where dedupe_key is not null do nothing;
    end loop;
  end loop;
end;
$$;

-- Requiere pg_cron habilitado en el proyecto (ver 20260703000002_notif_date_cron.sql).
select cron.schedule(
  'enqueue-meeting-reminders',
  '*/15 * * * *',
  $$select public.enqueue_meeting_reminders()$$
)
where not exists (
  select 1 from cron.job where jobname = 'enqueue-meeting-reminders'
);
