-- Corrige "operator does not exist: uuid = text" en notify_av_pauta_events (20260902000000):
-- la función comparaba `public.users.user_id` (uuid) con `av_pautas.created_by` (text) sin cast,
-- en `where user_id = new.created_by` (línea que resuelve el nombre de quien creó la pauta para
-- el título de la notificación). Postgres aborta esa comparación con error 42883.
--
-- El trigger dispara en el UPDATE de `client_id, tema, link, piezas_desc` — exactamente los
-- campos que la tabla de Solicitudes autoguarda `onBlur` — así que el UPDATE completo se
-- abortaba justo cuando el brief quedaba completo (cliente + enlace/descripción de piezas):
-- el campo que el usuario acababa de escribir no se guardaba y el mensaje crudo de Postgres
-- aparecía en rojo sobre la tabla (reportado por purdaneta@mdnpublicidad.com).
--
-- Fix: castear `user_id::text = new.created_by`, mismo patrón que el resto del archivo
-- (`x <> new.created_by::text`, `array[new.created_by::text]`) y que el precedente de este
-- mismo tipo de bug en 20260810000000_fix_campaign_autoclose_uuid_cast.sql.
--
-- Además se envuelve el cuerpo en un `exception when others` de resguardo: una notificación
-- nunca debe poder abortar el guardado de una pauta. El `raise warning` deja rastro en los logs
-- de Postgres para no ocultar en silencio un bug futuro de este mismo tipo.

create or replace function public.notify_av_pauta_events()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_recipients   text[];
  v_id           text;
  v_title        text;
  v_body         text;
  v_line_name    text;
  v_creator_name text;
  v_was_complete boolean;
  v_now_complete boolean;
begin
  v_now_complete := new.client_id is not null
    and (nullif(trim(new.link), '') is not null or nullif(trim(new.piezas_desc), '') is not null);

  if tg_op = 'UPDATE' then
    v_was_complete := old.client_id is not null
      and (nullif(trim(old.link), '') is not null or nullif(trim(old.piezas_desc), '') is not null);
  else
    v_was_complete := false;
  end if;

  -- Brief enviado y completo (antes no lo estaba) mientras sigue 'solicitada'.
  if new.submitted and new.status = 'solicitada' and v_now_complete
     and (tg_op = 'INSERT' or old.submitted is distinct from true or not v_was_complete) then

    select coalesce(name, '') into v_line_name from public.metric_lines where id = new.line_id;
    select coalesce(first_name, '') || ' ' || coalesce(last_name, '')
      into v_creator_name from public.users where user_id::text = new.created_by;

    v_recipients := array(
      select x from unnest(public.av_coordinadora_recipients(new.company_id)) x
      where new.created_by is null or x <> new.created_by::text
    );

    v_title := '🎬 Nueva pauta solicitada — ' || coalesce(new.client_name, 'sin cliente');
    v_body  := coalesce(nullif(trim(new.tema), ''), 'Sin tema')
               || case when nullif(trim(v_line_name), '') is not null then ' · Línea ' || v_line_name else '' end
               || case when nullif(trim(v_creator_name), '') is not null then ' · solicitada por ' || trim(v_creator_name) else '' end;

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

  -- Pauta agendada o reasignada (fecha nueva/cambiada) → solo quien la solicitó.
  if new.status = 'programada'
     and (
       tg_op = 'INSERT'
       or old.status is distinct from 'programada'
       or old.pauta_date is distinct from new.pauta_date
     ) then
    v_recipients := case when new.created_by is not null then array[new.created_by::text] else '{}' end;

    v_title := '📅 Pauta agendada: ' || coalesce(new.client_name, 'sin cliente');
    v_body  := coalesce(nullif(trim(new.tema), ''), 'Sin tema') || ' — '
               || coalesce(to_char(new.pauta_date, 'DD/MM/YYYY'), 'Fecha por definir')
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
exception
  when others then
    raise warning 'notify_av_pauta_events: % (pauta %)', sqlerrm, new.id;
    return new;
end;
$$;
