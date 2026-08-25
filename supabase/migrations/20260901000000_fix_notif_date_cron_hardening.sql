-- Blindaje del cron diario de notificaciones de fechas (cumpleaños/aniversarios).
--
-- Contexto (ver diagnóstico real en notifications.created_at): entre el 16 de julio y
-- el 20 de agosto de 2026 NO se generó ninguna notificación de fecha, pese a que sí
-- había cumpleaños/aniversarios ese rango. Causa: 11 contactos de clientes con
-- birth_day/birth_month = '' (string vacío del formulario) hacían fallar el cast
-- ''::int, y como enqueue_date_notifications() es un único bloque plpgsql sin manejo
-- de excepciones, ESE ÚNICO dato malo abortaba la función completa — cero
-- notificaciones para TODA la empresa, todos los días, hasta el parche manual del
-- 21/08 (20260829000001_fix_notif_empty_birthdate_crash.sql).
--
-- Ese parche del 21/08 arregló el crash pero fue escrito sobre el archivo desactualizado
-- del repo (20260703000002), no sobre el cuerpo real que dejó en producción
-- 20260719000001_users_soft_delete.sql. Como consecuencia perdió:
--   - el filtro `deleted_at is null` (empleados archivados volvían a notificar/recibir)
--   - los casts explícitos ::text sobre user_id/company_id (users.user_id y
--     users.company_id son uuid; notifications.user_id/company_id son text)
--
-- Esta migración redefine la función combinando lo bueno de ambas versiones y, sobre
-- todo, aísla cada evento con su propio BEGIN/EXCEPTION: un dato inesperado futuro ya
-- no puede volver a apagar el sistema completo — solo se pierde esa notificación
-- puntual, y queda registrada en notif_cron_runs para poder detectarlo.

-- ── Tabla de observabilidad: una fila por corrida del cron ──────────────────────────
create table if not exists public.notif_cron_runs (
  id                     uuid primary key default gen_random_uuid(),
  job_name               text not null default 'enqueue-date-notifications',
  ran_at                 timestamptz not null default now(),
  notifications_inserted int not null default 0,
  errors_count           int not null default 0,
  error_sample           text,
  ok                     boolean not null default true
);

alter table public.notif_cron_runs enable row level security;

drop policy if exists "notif_cron_runs_read_level4" on public.notif_cron_runs;
create policy "notif_cron_runs_read_level4"
  on public.notif_cron_runs
  for select
  to authenticated
  using (
    exists (
      select 1 from public.users u
       where u.user_id = auth.uid()
         and u.deleted_at is null
         and u.access_level >= 4
    )
  );

-- ── Recipients: versión real de producción (metric_line_members + deleted_at) ───────
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
    join public.users u on u.user_id::text = mlm.user_id
   where mlm.line_id = p_line_id
     and p_line_id is not null
     and u.deleted_at is null
  union
  select u.user_id::text
    from public.users u
   where u.company_id = p_company_id::uuid
     and u.access_level >= 4
     and u.deleted_at is null;
$$;

-- ── Main function: enqueue date notifications for today, blindada ───────────────────
create or replace function public.enqueue_date_notifications()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_today         date := (now() at time zone 'America/Caracas')::date;
  v_today3        date := v_today + 3;
  v_today_m       int  := extract(month from v_today)::int;
  v_today_d       int  := extract(day   from v_today)::int;
  v_rec           record;
  v_recipient     record;
  v_contact       jsonb;
  v_bday          int;
  v_bmonth        int;
  v_offset_days   int;
  v_target_date   date;
  v_title         text;
  v_body          text;
  v_dkey          text;
  v_inserted      int := 0;
  v_errors        int := 0;
  v_error_sample  text;
  v_rows          int;
begin

  -- ── 1. Client anniversaries & MDN-since dates ─────────────────────────────
  for v_rec in
    select c.id, c.name, c.company_id, c.line_id, c.anniversary_date, c.mdn_since
      from public.metric_clients c
     where c.deleted_at is null
       and (c.anniversary_date is not null or c.mdn_since is not null)
  loop
    begin
      if v_rec.anniversary_date is not null then
        for v_offset_days, v_target_date in
          values (0, v_today), (3, v_today3)
        loop
          if extract(month from v_rec.anniversary_date) = extract(month from v_target_date)
             and extract(day from v_rec.anniversary_date) = extract(day from v_target_date)
          then
            v_title := case v_offset_days
              when 0 then '🎂 Aniversario de cliente hoy'
              else        '📅 Aniversario de cliente en 3 días'
            end;
            v_body  := 'El cliente ' || v_rec.name || ' celebra su aniversario'
                       || case v_offset_days when 0 then ' hoy.' else ' en 3 días.' end;

            for v_recipient in
              select user_id from public.notif_client_recipients(v_rec.company_id, v_rec.line_id)
            loop
              v_dkey := 'client_anniversary:' || v_rec.id || ':' || v_target_date::text || ':' || v_recipient.user_id;
              insert into public.notifications
                (company_id, user_id, type, title, body, entity_type, entity_id, email, read, dedupe_key)
              values
                (v_rec.company_id, v_recipient.user_id, 'client_anniversary',
                 v_title, v_body, 'client', v_rec.id::text, false, false, v_dkey)
              on conflict (dedupe_key) where dedupe_key is not null do nothing;
              get diagnostics v_rows = row_count;
              v_inserted := v_inserted + v_rows;
            end loop;
          end if;
        end loop;
      end if;

      if v_rec.mdn_since is not null then
        for v_offset_days, v_target_date in
          values (0, v_today), (3, v_today3)
        loop
          if extract(month from v_rec.mdn_since) = extract(month from v_target_date)
             and extract(day from v_rec.mdn_since) = extract(day from v_target_date)
          then
            v_title := case v_offset_days
              when 0 then '🤝 Aniversario MDN de cliente hoy'
              else        '📅 Aniversario MDN de cliente en 3 días'
            end;
            v_body  := 'Hoy hace ' || (extract(year from v_today) - extract(year from v_rec.mdn_since))::int
                       || ' año(s) que ' || v_rec.name || ' trabaja con MDN'
                       || case v_offset_days when 0 then '.' else ' (en 3 días).' end;

            for v_recipient in
              select user_id from public.notif_client_recipients(v_rec.company_id, v_rec.line_id)
            loop
              v_dkey := 'client_mdn_anniversary:' || v_rec.id || ':' || v_target_date::text || ':' || v_recipient.user_id;
              insert into public.notifications
                (company_id, user_id, type, title, body, entity_type, entity_id, email, read, dedupe_key)
              values
                (v_rec.company_id, v_recipient.user_id, 'client_mdn_anniversary',
                 v_title, v_body, 'client', v_rec.id::text, false, false, v_dkey)
              on conflict (dedupe_key) where dedupe_key is not null do nothing;
              get diagnostics v_rows = row_count;
              v_inserted := v_inserted + v_rows;
            end loop;
          end if;
        end loop;
      end if;
    exception when others then
      v_errors := v_errors + 1;
      v_error_sample := coalesce(v_error_sample, 'client_anniversary client=' || v_rec.id || ': ' || sqlerrm);
    end;
  end loop;

  -- ── 2. Client contact birthdays ───────────────────────────────────────────
  -- contacts jsonb shape: [{ name, role, birth_day (int|''), birth_month (int|'') }]
  -- birth_day/birth_month pueden llegar como '' (formulario en blanco); nullif()
  -- los vuelve null para que se salteen abajo. Cada contacto va en su propio
  -- BEGIN/EXCEPTION para que un dato corrupto no tumbe el resto.
  for v_rec in
    select c.id, c.name, c.company_id, c.line_id, c.contacts
      from public.metric_clients c
     where c.deleted_at is null
       and jsonb_array_length(c.contacts) > 0
  loop
    for v_contact in select jsonb_array_elements(v_rec.contacts)
    loop
      begin
        v_bday   := nullif(v_contact->>'birth_day', '')::int;
        v_bmonth := nullif(v_contact->>'birth_month', '')::int;
        if v_bday is null or v_bmonth is null then
          continue;
        end if;

        for v_offset_days, v_target_date in
          values (0, v_today), (3, v_today3)
        loop
          if v_bmonth = extract(month from v_target_date)
             and v_bday = extract(day from v_target_date)
          then
            v_title := case v_offset_days
              when 0 then '🎂 Cumpleaños de contacto hoy'
              else        '📅 Cumpleaños de contacto en 3 días'
            end;
            v_body  := coalesce(v_contact->>'name', 'Un contacto') || ' de ' || v_rec.name
                       || ' cumple años'
                       || case v_offset_days when 0 then ' hoy.' else ' en 3 días.' end;

            for v_recipient in
              select user_id from public.notif_client_recipients(v_rec.company_id, v_rec.line_id)
            loop
              v_dkey := 'client_contact_birthday:' || v_rec.id::text
                        || ':' || coalesce(v_contact->>'name', 'unknown')
                        || ':' || v_target_date::text
                        || ':' || v_recipient.user_id;
              insert into public.notifications
                (company_id, user_id, type, title, body, entity_type, entity_id, email, read, dedupe_key)
              values
                (v_rec.company_id, v_recipient.user_id, 'client_contact_birthday',
                 v_title, v_body, 'client', v_rec.id::text, false, false, v_dkey)
              on conflict (dedupe_key) where dedupe_key is not null do nothing;
              get diagnostics v_rows = row_count;
              v_inserted := v_inserted + v_rows;
            end loop;
          end if;
        end loop;
      exception when others then
        v_errors := v_errors + 1;
        v_error_sample := coalesce(v_error_sample, 'client_contact_birthday client=' || v_rec.id || ': ' || sqlerrm);
      end;
    end loop;
  end loop;

  -- ── 3. MDN employee birthdays (solo el día exacto, empleados activos) ────────
  for v_rec in
    select u.user_id, u.company_id, u.first_name, u.last_name, u.birth_date
      from public.users u
     where u.birth_date is not null
       and u.deleted_at is null
       and extract(month from u.birth_date) = v_today_m
       and extract(day   from u.birth_date) = v_today_d
  loop
    begin
      for v_recipient in
        select u2.user_id from public.users u2
         where u2.company_id = v_rec.company_id
           and u2.deleted_at is null
      loop
        v_dkey := 'employee_birthday:' || v_rec.user_id::text || ':' || v_today::text || ':' || v_recipient.user_id::text;
        v_title := '🎂 Cumpleaños de ' || v_rec.first_name || ' ' || v_rec.last_name;
        v_body  := '¡Hoy es el cumpleaños de ' || v_rec.first_name || ' ' || v_rec.last_name || '! 🎉';

        insert into public.notifications
          (company_id, user_id, type, title, body, entity_type, entity_id, email, read, dedupe_key)
        values
          (v_rec.company_id::text, v_recipient.user_id::text, 'employee_birthday',
           v_title, v_body, 'employee', v_rec.user_id::text, false, false, v_dkey)
        on conflict (dedupe_key) where dedupe_key is not null do nothing;
        get diagnostics v_rows = row_count;
        v_inserted := v_inserted + v_rows;
      end loop;
    exception when others then
      v_errors := v_errors + 1;
      v_error_sample := coalesce(v_error_sample, 'employee_birthday user=' || v_rec.user_id || ': ' || sqlerrm);
    end;
  end loop;

  -- ── 4. MDN employee hire anniversaries (solo el día exacto, empleados activos) ──
  for v_rec in
    select u.user_id, u.company_id, u.first_name, u.last_name, u.hire_date
      from public.users u
     where u.hire_date is not null
       and u.deleted_at is null
       and extract(month from u.hire_date) = v_today_m
       and extract(day   from u.hire_date) = v_today_d
       and u.hire_date < v_today   -- evita notificar el día exacto de ingreso (año 0)
  loop
    begin
      for v_recipient in
        select u2.user_id from public.users u2
         where u2.company_id = v_rec.company_id
           and u2.deleted_at is null
      loop
        v_dkey := 'employee_mdn_anniversary:' || v_rec.user_id::text || ':' || v_today::text || ':' || v_recipient.user_id::text;
        v_title := '🎊 Aniversario MDN de ' || v_rec.first_name || ' ' || v_rec.last_name;
        v_body  := v_rec.first_name || ' cumple '
                   || (extract(year from v_today) - extract(year from v_rec.hire_date))::int
                   || ' año(s) en MDN hoy. ¡Felicitaciones!';

        insert into public.notifications
          (company_id, user_id, type, title, body, entity_type, entity_id, email, read, dedupe_key)
        values
          (v_rec.company_id::text, v_recipient.user_id::text, 'employee_mdn_anniversary',
           v_title, v_body, 'employee', v_rec.user_id::text, false, false, v_dkey)
        on conflict (dedupe_key) where dedupe_key is not null do nothing;
        get diagnostics v_rows = row_count;
        v_inserted := v_inserted + v_rows;
      end loop;
    exception when others then
      v_errors := v_errors + 1;
      v_error_sample := coalesce(v_error_sample, 'employee_mdn_anniversary user=' || v_rec.user_id || ': ' || sqlerrm);
    end;
  end loop;

  -- ── Registro de observabilidad ────────────────────────────────────────────
  insert into public.notif_cron_runs (job_name, notifications_inserted, errors_count, error_sample, ok)
  values ('enqueue-date-notifications', v_inserted, v_errors, v_error_sample, v_errors = 0);

end;
$$;

-- ── Confirmar que el schedule sigue vivo (idempotente, no lo recrea si ya existe) ───
select cron.schedule(
  'enqueue-date-notifications',
  '0 12 * * *',
  $$select public.enqueue_date_notifications()$$
)
where not exists (
  select 1 from cron.job where jobname = 'enqueue-date-notifications'
);

-- ── Limpieza de datos: normalizar contactos con birth_day/birth_month = '' a null ───
-- (la causa raíz del crash; el front (ClientModal.jsx) se corrige en el mismo commit
-- para que deje de escribir strings vacíos hacia adelante)
update public.metric_clients c
   set contacts = (
     select jsonb_agg(
       case
         when (contact->>'birth_day') = '' or (contact->>'birth_month') = ''
           then (contact - 'birth_day' - 'birth_month') || jsonb_build_object('birth_day', null, 'birth_month', null)
         else contact
       end
     )
     from jsonb_array_elements(c.contacts) as contact
   )
 where jsonb_array_length(c.contacts) > 0
   and exists (
     select 1 from jsonb_array_elements(c.contacts) as contact
      where (contact->>'birth_day') = '' or (contact->>'birth_month') = ''
   );
