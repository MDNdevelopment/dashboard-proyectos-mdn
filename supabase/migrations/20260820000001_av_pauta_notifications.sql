-- Migration: notificaciones de la sub-sección Audiovisual (Tareas Fijas → Audiovisual)
--   1. Trigger: notifica a la coordinadora de audiovisual (+ dirección) cuando una jefa
--      envía el brief de una solicitud; notifica a quien graba + asistentes cuando la
--      coordinadora agenda la pauta (fecha fijada/cambiada).
--   2. pg_cron: recordatorio de cierre de agenda semanal (jueves, refuerzo viernes antes
--      de las 05:00pm) a la coordinadora — la agenda de la semana siguiente debe armarse
--      antes de ese plazo (ver utils/audiovisual.js:avNextDeadline).
-- Ambos insertan en public.notifications con email = true, para que el trigger existente
-- notify_dispatch_email() dispare también el correo (Resend). Mismo patrón que
-- 20260717000001_meeting_notifications.sql.
--
-- av_coordinadora_recipients() replica el criterio por defecto de la capability
-- 'audiovisual.coordina' sembrada en 20260820000000_create_av_pautas.sql (depto
-- Audiovisual nivel≥2, o dirección nivel≥4/admin). Es un helper de notificación, no un
-- límite de seguridad — la escritura real sigue gated por user_can('audiovisual.coordina')
-- en RLS. Si el criterio de esa capability cambia sustancialmente en producción (vía
-- PermisosView), revisar este helper para que las notificaciones sigan alcanzando a la
-- persona correcta.

create or replace function public.av_coordinadora_recipients(p_company_id text)
returns text[]
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(array_agg(u.user_id::text), '{}')
    from public.users u
   where u.company_id::text = p_company_id
     and u.deleted_at is null
     and (
       (u.department_id = 2 and coalesce(u.access_level, 1) >= 2)
       or coalesce(u.access_level, 1) >= 4
       or coalesce(u.admin, false)
     )
$$;

-- ── 1. Trigger: solicitud enviada → coordinadora · pauta agendada → graba + asistentes ──

create or replace function public.notify_av_pauta_events()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_recipients text[];
  v_id         text;
  v_title      text;
  v_body       text;
begin
  -- Brief enviado (submitted pasa a true) mientras sigue 'solicitada'.
  if new.submitted and new.status = 'solicitada'
     and (tg_op = 'INSERT' or old.submitted is distinct from true) then
    v_recipients := public.av_coordinadora_recipients(new.company_id);
    v_title := '🎬 Nueva pauta solicitada: ' || coalesce(new.client_name, 'sin cliente');
    v_body  := coalesce(new.tema, 'Sin tema') || ' — revisa el brief para agendarla';

    foreach v_id in array v_recipients
    loop
      insert into public.notifications (
        company_id, user_id, type, title, body, entity_type, entity_id, email, read, dedupe_key
      ) values (
        new.company_id, v_id, 'av_pauta_solicitada', v_title, v_body,
        'av_pauta', new.id::text, true, false,
        'av_pauta_solicitada:' || new.id::text || ':' || v_id
      )
      on conflict (dedupe_key) where dedupe_key is not null do nothing;
    end loop;
  end if;

  -- Pauta agendada o reasignada (fecha nueva/cambiada) → recurso que graba + asistentes.
  if new.status = 'programada'
     and (
       tg_op = 'INSERT'
       or old.status is distinct from 'programada'
       or old.pauta_date is distinct from new.pauta_date
     ) then
    v_recipients := array(
      select distinct x from unnest(
        coalesce(new.attendee_ids, '{}')
        || case when new.graba_user_id is not null then array[new.graba_user_id::text] else '{}' end
      ) x
    );

    v_title := '📅 Pauta agendada: ' || coalesce(new.client_name, 'sin cliente');
    v_body  := coalesce(to_char(new.pauta_date, 'DD/MM/YYYY'), 'Fecha por definir')
               || case when new.salida is not null then ' — ' || to_char(new.salida, 'HH24:MI') else '' end
               || coalesce(' — ' || new.place, '');

    foreach v_id in array v_recipients
    loop
      insert into public.notifications (
        company_id, user_id, type, title, body, entity_type, entity_id, email, read, dedupe_key
      ) values (
        new.company_id, v_id, 'av_pauta_programada', v_title, v_body,
        'av_pauta', new.id::text, true, false,
        'av_pauta_programada:' || new.id::text || ':' || coalesce(new.pauta_date::text, 'sf') || ':' || v_id
      )
      on conflict (dedupe_key) where dedupe_key is not null do nothing;
    end loop;
  end if;

  return new;
end;
$$;

create or replace trigger trigger_notify_av_pauta_events
  after insert or update of status, submitted, pauta_date, attendee_ids, graba_user_id
  on public.av_pautas
  for each row
  execute function public.notify_av_pauta_events();

-- ── 2. Recordatorio de cierre de agenda: jueves + refuerzo viernes ──────────────────────
-- La agenda de la semana siguiente se arma el jueves, máximo el viernes 05:00pm
-- (America/Caracas, UTC-4). Corre una vez a las 9:00am de cada día (13:00 UTC).

create or replace function public.enqueue_av_agenda_reminder()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cid        text;
  v_recipients text[];
  v_id         text;
  v_title      text := '⏰ Cierre de agenda audiovisual';
  v_body       text := 'La agenda de pautas de la próxima semana debe quedar cerrada hoy antes de las 05:00pm.';
  v_today      date := (now() at time zone 'America/Caracas')::date;
begin
  for v_cid in
    select distinct company_id::text from public.users where company_id is not null
  loop
    v_recipients := public.av_coordinadora_recipients(v_cid);

    foreach v_id in array v_recipients
    loop
      insert into public.notifications (
        company_id, user_id, type, title, body, entity_type, entity_id, email, read, dedupe_key
      ) values (
        v_cid, v_id, 'av_agenda_reminder', v_title, v_body,
        'av_pauta', null, true, false,
        'av_agenda_reminder:' || v_cid || ':' || v_today::text || ':' || v_id
      )
      on conflict (dedupe_key) where dedupe_key is not null do nothing;
    end loop;
  end loop;
end;
$$;

-- Requiere pg_cron habilitado en el proyecto (ver 20260703000002_notif_date_cron.sql).
select cron.schedule(
  'enqueue-av-agenda-reminder',
  '0 13 * * 4,5',
  $$select public.enqueue_av_agenda_reminder()$$
)
where not exists (
  select 1 from cron.job where jobname = 'enqueue-av-agenda-reminder'
);
