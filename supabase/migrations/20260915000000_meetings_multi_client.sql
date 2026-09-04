-- Reuniones con varias marcas: un cliente con varias marcas hacía una reunión por marca
-- (misma hora, mismos participantes) porque `meetings` solo soportaba un client_id. Se
-- agregan 3 arreglos posicionales (mismo idioma que attendee_ids text[]) para permitir N
-- clientes por reunión sin duplicar filas ni requerir un join/tabla puente:
--
--   client_ids[i] / client_names[i] / line_ids[i]  → la marca i-ésima elegida por el usuario.
--
-- Las columnas escalares client_id/client_name/line_id se CONSERVAN (se siguen escribiendo
-- con la primera marca seleccionada) para no romper a los consumidores que aún leen un solo
-- cliente: el monitor de Uso (metricsApi.js), las tools de MAPPI (aiChatData.js) y cualquier
-- consulta MCP/SQL existente. Solo meetingsApi.js (countMeetingsHeldForLine/
-- loadHeldClientIdsForLine) y la UI (MeetingModal/MeetingDetail/CalendarView/HomePage) pasan
-- a leer los arreglos.
alter table public.meetings
  add column if not exists client_ids   uuid[] not null default '{}',
  add column if not exists client_names text[] not null default '{}',
  add column if not exists line_ids     uuid[] not null default '{}';

-- Backfill de las reuniones existentes desde las columnas escalares (una sola marca).
update public.meetings
   set client_ids   = array[client_id],
       client_names = array[coalesce(client_name, '')],
       line_ids     = array[line_id]
 where client_id is not null and cardinality(client_ids) = 0;

create index if not exists meetings_line_ids_idx on public.meetings using gin (line_ids);
create index if not exists meetings_client_ids_idx on public.meetings using gin (client_ids);

-- ── Notificaciones: nombrar todas las marcas + hora en formato 12h ──────────────────────
-- Mismo criterio que antes (coalesce a "Sin cliente"), pero uniendo client_names cuando hay
-- más de una marca; fallback a client_name para compatibilidad si algún día client_names
-- queda vacío. Hora: TO_CHAR con 'FMHH12:MI AM' en vez de 'HH24:MI' (24h) — 'FM' quita el
-- cero a la izquierda, ej. "2:30 PM" en vez de "02:30".

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
  v_clients text;
begin
  if tg_op = 'INSERT' then
    v_new_ids := coalesce(new.attendee_ids, '{}');
  else
    select array_agg(u)
      into v_new_ids
      from unnest(coalesce(new.attendee_ids, '{}')) u
     where not (u = any(coalesce(old.attendee_ids, '{}')));
  end if;

  v_clients := nullif(array_to_string(new.client_names, ', '), '');
  v_title := '📅 Nueva reunión: ' || new.title;
  v_body  := coalesce(v_clients, new.client_name, 'Sin cliente') || ' — '
             || to_char(new.starts_at at time zone 'America/Caracas', 'DD/MM/YYYY FMHH12:MI AM');

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
  v_clients   text;
begin
  -- Recordatorio: día previo (reunión entre ahora+24h y ahora+24h15m)
  for v_rec in
    select m.id, m.title, m.client_name, m.client_names, m.company_id, m.starts_at, m.attendee_ids,
           m.modality, m.location, m.meeting_url
      from public.meetings m
     where m.status = 'programada'
       and m.starts_at >= v_now + interval '24 hours'
       and m.starts_at <  v_now + interval '24 hours 15 minutes'
  loop
    v_clients := nullif(array_to_string(v_rec.client_names, ', '), '');
    v_title := '📅 Reunión mañana: ' || v_rec.title;
    v_where := case v_rec.modality
                 when 'videollamada' then coalesce(v_rec.meeting_url, 'Link por confirmar')
                 else coalesce(v_rec.location, 'Lugar por confirmar')
               end;
    v_body  := coalesce(v_clients, v_rec.client_name, 'Sin cliente') || ' — '
               || to_char(v_rec.starts_at at time zone 'America/Caracas', 'DD/MM/YYYY FMHH12:MI AM')
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
    select m.id, m.title, m.client_name, m.client_names, m.company_id, m.starts_at, m.attendee_ids,
           m.modality, m.location, m.meeting_url
      from public.meetings m
     where m.status = 'programada'
       and m.starts_at >= v_now + interval '1 hour'
       and m.starts_at <  v_now + interval '1 hour 15 minutes'
  loop
    v_clients := nullif(array_to_string(v_rec.client_names, ', '), '');
    v_title := '⏰ Reunión en 1 hora: ' || v_rec.title;
    v_where := case v_rec.modality
                 when 'videollamada' then coalesce(v_rec.meeting_url, 'Link por confirmar')
                 else coalesce(v_rec.location, 'Lugar por confirmar')
               end;
    v_body  := coalesce(v_clients, v_rec.client_name, 'Sin cliente') || ' — '
               || to_char(v_rec.starts_at at time zone 'America/Caracas', 'FMHH12:MI AM')
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
