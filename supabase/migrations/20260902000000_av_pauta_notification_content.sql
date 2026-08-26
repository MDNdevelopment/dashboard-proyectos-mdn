-- Corrige la notificación de "Nueva pauta solicitada" (20260820000001):
--   1. Ya no dispara con la pauta vacía. El botón "+ Agregar pauta" de la coordinadora
--      (AvPhaseTable.jsx → handleCreateImmediate) inserta la fila con submitted:true ANTES
--      de tener cliente/tema/grilla, así que el trigger notificaba en blanco ("sin cliente" /
--      "Sin tema") en cada clic. Ahora exige brief completo — mismo criterio que
--      briefComplete() en src/utils/audiovisual.js: client_id + (link o piezas_desc).
--   2. Dispara cuando el brief SE COMPLETA después (columnas nuevas en el `update of`),
--      no solo cuando `submitted` pasa a true — cubre el caso de la coordinadora que crea
--      vacío y completa más tarde. El dedupe_key existente evita duplicados.
--   3. Ya no auto-notifica a quien crea/completa la pauta.
--   4. El título/cuerpo ahora incluyen tema, línea y quién la solicitó — antes el body caía
--      en "Sin tema — revisa el brief para agendarla" sin más contexto.
--   5. "Pauta agendada" cambia de destinatarios: antes notificaba a quien graba
--      (graba_user_id) + asistentes (attendee_ids), datos legado que ya no se capturan en
--      el flujo actual (ver avPautasApi.js/AvPhaseTable.jsx — sin UI para esos campos desde
--      hace tiempo), así que casi nunca llegaba a nadie. Ahora notifica únicamente a
--      new.created_by: quien solicitó la pauta es quien necesita saber que ya tiene fecha.
--   6. Destinatario de "pauta solicitada" (capability 'audiovisual.notificaciones', ver
--      20260825000001_av_notificaciones_capability.sql): estaba sembrada solo con Juan
--      Lauretta (developer, módulo en pruebas) — por eso llegaban a él y no a Lizdania.
--      Se actualiza a Lizdania (967bedeb-54fa-4da1-b975-bfc4745989d9), el mismo user_id ya
--      sembrado para 'audiovisual.coordina'
--      (20260827000000_audiovisual_coordina_restrict_lizdania.sql): es la coordinadora
--      real, quien de hecho agenda/declina.
-- Mismo patrón (SECURITY DEFINER, dedupe_key, av_coordinadora_recipients) que la migración
-- original; solo se reemplaza el cuerpo de la función y se amplía el trigger.

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
      into v_creator_name from public.users where user_id = new.created_by;

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
end;
$$;

drop trigger if exists trigger_notify_av_pauta_events on public.av_pautas;

create trigger trigger_notify_av_pauta_events
  after insert or update of status, submitted, pauta_date, attendee_ids, graba_user_id,
    client_id, tema, link, piezas_desc
  on public.av_pautas
  for each row
  execute function public.notify_av_pauta_events();

-- Redirige el destinatario de "pauta solicitada" de Juan Lauretta (seed de pruebas) a
-- Lizdania, la coordinadora real — mismo user_id que 'audiovisual.coordina'.
update public.module_permissions
set rules = '{"rules":[{"all":[{"type":"user","ids":["967bedeb-54fa-4da1-b975-bfc4745989d9"]}]}]}'::jsonb
where module_key = 'audiovisual.notificaciones';
