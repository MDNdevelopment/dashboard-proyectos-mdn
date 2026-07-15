-- Soft delete de empleados: agrega columna deleted_at e índice parcial para activos.
-- Un empleado archivado tiene deleted_at NOT NULL; activo = deleted_at IS NULL.
-- Los registros nunca se borran, preservando referencias históricas en tasks, meetings,
-- paid_campaigns, evaluation_sessions, metric_clients y reportes cerrados.
--
-- Nota: notif_client_recipients() y enqueue_date_notifications() fueron editadas
-- directamente en Supabase después de 20260703000002_notif_date_cron.sql (usan
-- metric_line_members en vez de metric_lines.member_user_ids). Esta migración redefine
-- ambas funciones a partir de su cuerpo REAL en producción (no del archivo desactualizado
-- del repo), únicamente añadiendo el filtro deleted_at is null.

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

CREATE INDEX IF NOT EXISTS users_active_idx
  ON users (company_id)
  WHERE deleted_at IS NULL;

-- ── Excluir empleados archivados como destinatarios/origen del cron de fechas ──

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

create or replace function public.enqueue_date_notifications()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_today   date := (now() at time zone 'America/Caracas')::date;
  v_today3  date := v_today + 3;
  v_today_m int  := extract(month from v_today)::int;
  v_today_d int  := extract(day   from v_today)::int;
  v_rec       record;
  v_recipient record;
  v_contact   jsonb;
  v_bday      int;
  v_bmonth    int;
  v_title     text;
  v_body      text;
  v_dkey      text;
begin

  -- ── 1. Client anniversaries ────────────────────────────────────────────────
  for v_rec in
    select c.id, c.name, c.company_id, c.line_id, c.anniversary_date, c.mdn_since
      from public.metric_clients c
     where c.anniversary_date is not null or c.mdn_since is not null
  loop
    -- anniversary_date: check today
    if v_rec.anniversary_date is not null
       and extract(month from v_rec.anniversary_date) = v_today_m
       and extract(day   from v_rec.anniversary_date) = v_today_d
    then
      for v_recipient in select user_id from public.notif_client_recipients(v_rec.company_id, v_rec.line_id)
      loop
        v_dkey := 'client_anniversary:' || v_rec.id || ':' || v_today::text || ':' || v_recipient.user_id;
        insert into public.notifications (company_id,user_id,type,title,body,entity_type,entity_id,email,read,dedupe_key)
        values (v_rec.company_id, v_recipient.user_id, 'client_anniversary',
                'Aniversario de cliente hoy',
                'El cliente ' || v_rec.name || ' celebra su aniversario hoy.',
                'client', v_rec.id::text, false, false, v_dkey)
        on conflict (dedupe_key) where dedupe_key is not null do nothing;
      end loop;
    end if;

    -- anniversary_date: check today+3
    if v_rec.anniversary_date is not null
       and extract(month from v_rec.anniversary_date) = extract(month from v_today3)
       and extract(day   from v_rec.anniversary_date) = extract(day   from v_today3)
    then
      for v_recipient in select user_id from public.notif_client_recipients(v_rec.company_id, v_rec.line_id)
      loop
        v_dkey := 'client_anniversary:' || v_rec.id || ':' || v_today3::text || ':' || v_recipient.user_id;
        insert into public.notifications (company_id,user_id,type,title,body,entity_type,entity_id,email,read,dedupe_key)
        values (v_rec.company_id, v_recipient.user_id, 'client_anniversary',
                'Aniversario de cliente en 3 días',
                'El cliente ' || v_rec.name || ' celebra su aniversario en 3 días.',
                'client', v_rec.id::text, false, false, v_dkey)
        on conflict (dedupe_key) where dedupe_key is not null do nothing;
      end loop;
    end if;

    -- mdn_since: check today
    if v_rec.mdn_since is not null
       and extract(month from v_rec.mdn_since) = v_today_m
       and extract(day   from v_rec.mdn_since) = v_today_d
    then
      for v_recipient in select user_id from public.notif_client_recipients(v_rec.company_id, v_rec.line_id)
      loop
        v_dkey := 'client_mdn_anniversary:' || v_rec.id || ':' || v_today::text || ':' || v_recipient.user_id;
        insert into public.notifications (company_id,user_id,type,title,body,entity_type,entity_id,email,read,dedupe_key)
        values (v_rec.company_id, v_recipient.user_id, 'client_mdn_anniversary',
                'Aniversario MDN de cliente hoy',
                v_rec.name || ' lleva ' || (extract(year from v_today) - extract(year from v_rec.mdn_since))::int || ' año(s) con MDN.',
                'client', v_rec.id::text, false, false, v_dkey)
        on conflict (dedupe_key) where dedupe_key is not null do nothing;
      end loop;
    end if;

    -- mdn_since: check today+3
    if v_rec.mdn_since is not null
       and extract(month from v_rec.mdn_since) = extract(month from v_today3)
       and extract(day   from v_rec.mdn_since) = extract(day   from v_today3)
    then
      for v_recipient in select user_id from public.notif_client_recipients(v_rec.company_id, v_rec.line_id)
      loop
        v_dkey := 'client_mdn_anniversary:' || v_rec.id || ':' || v_today3::text || ':' || v_recipient.user_id;
        insert into public.notifications (company_id,user_id,type,title,body,entity_type,entity_id,email,read,dedupe_key)
        values (v_rec.company_id, v_recipient.user_id, 'client_mdn_anniversary',
                'Aniversario MDN de cliente en 3 días',
                v_rec.name || ' lleva ' || (extract(year from v_today) - extract(year from v_rec.mdn_since))::int || ' año(s) con MDN (en 3 días).',
                'client', v_rec.id::text, false, false, v_dkey)
        on conflict (dedupe_key) where dedupe_key is not null do nothing;
      end loop;
    end if;
  end loop;

  -- ── 2. Client contact birthdays (birth_day + birth_month, no year) ─────────
  for v_rec in
    select c.id, c.name, c.company_id, c.line_id, c.contacts
      from public.metric_clients c
     where jsonb_array_length(c.contacts) > 0
  loop
    for v_contact in select jsonb_array_elements(v_rec.contacts)
    loop
      v_bday   := (v_contact->>'birth_day')::int;
      v_bmonth := (v_contact->>'birth_month')::int;
      if v_bday is null or v_bmonth is null then continue; end if;

      -- check today
      if v_bmonth = v_today_m and v_bday = v_today_d then
        for v_recipient in select user_id from public.notif_client_recipients(v_rec.company_id, v_rec.line_id)
        loop
          v_dkey := 'client_contact_birthday:' || v_rec.id::text || ':' || coalesce(v_contact->>'name','?')
                    || ':' || v_today::text || ':' || v_recipient.user_id;
          insert into public.notifications (company_id,user_id,type,title,body,entity_type,entity_id,email,read,dedupe_key)
          values (v_rec.company_id, v_recipient.user_id, 'client_contact_birthday',
                  'Cumpleaños de contacto hoy',
                  coalesce(v_contact->>'name','Un contacto') || ' de ' || v_rec.name || ' cumple años hoy.',
                  'client', v_rec.id::text, false, false, v_dkey)
          on conflict (dedupe_key) where dedupe_key is not null do nothing;
        end loop;
      end if;

      -- check today+3
      if v_bmonth = extract(month from v_today3)::int and v_bday = extract(day from v_today3)::int then
        for v_recipient in select user_id from public.notif_client_recipients(v_rec.company_id, v_rec.line_id)
        loop
          v_dkey := 'client_contact_birthday:' || v_rec.id::text || ':' || coalesce(v_contact->>'name','?')
                    || ':' || v_today3::text || ':' || v_recipient.user_id;
          insert into public.notifications (company_id,user_id,type,title,body,entity_type,entity_id,email,read,dedupe_key)
          values (v_rec.company_id, v_recipient.user_id, 'client_contact_birthday',
                  'Cumpleaños de contacto en 3 días',
                  coalesce(v_contact->>'name','Un contacto') || ' de ' || v_rec.name || ' cumple años en 3 días.',
                  'client', v_rec.id::text, false, false, v_dkey)
          on conflict (dedupe_key) where dedupe_key is not null do nothing;
        end loop;
      end if;
    end loop;
  end loop;

  -- ── 3. MDN employee birthdays (exact day only, empleados activos) ───────────
  -- users.company_id is uuid; cast to text for notifications.company_id
  for v_rec in
    select u.user_id, u.company_id, u.first_name, u.last_name
      from public.users u
     where u.birth_date is not null
       and u.deleted_at is null
       and extract(month from u.birth_date) = v_today_m
       and extract(day   from u.birth_date) = v_today_d
  loop
    for v_recipient in
      select u2.user_id from public.users u2
       where u2.company_id = v_rec.company_id
         and u2.deleted_at is null
    loop
      v_dkey := 'employee_birthday:' || v_rec.user_id::text || ':' || v_today::text || ':' || v_recipient.user_id::text;
      insert into public.notifications (company_id,user_id,type,title,body,entity_type,entity_id,email,read,dedupe_key)
      values (v_rec.company_id::text, v_recipient.user_id::text, 'employee_birthday',
              'Cumpleaños de ' || v_rec.first_name || ' ' || v_rec.last_name,
              '¡Hoy es el cumpleaños de ' || v_rec.first_name || ' ' || v_rec.last_name || '! 🎉',
              'employee', v_rec.user_id::text, false, false, v_dkey)
      on conflict (dedupe_key) where dedupe_key is not null do nothing;
    end loop;
  end loop;

  -- ── 4. MDN employee hire anniversaries (exact day only, empleados activos) ──
  for v_rec in
    select u.user_id, u.company_id, u.first_name, u.last_name, u.hire_date
      from public.users u
     where u.hire_date is not null
       and u.deleted_at is null
       and extract(month from u.hire_date) = v_today_m
       and extract(day   from u.hire_date) = v_today_d
       and u.hire_date < v_today
  loop
    for v_recipient in
      select u2.user_id from public.users u2
       where u2.company_id = v_rec.company_id
         and u2.deleted_at is null
    loop
      v_dkey := 'employee_mdn_anniversary:' || v_rec.user_id::text || ':' || v_today::text || ':' || v_recipient.user_id::text;
      insert into public.notifications (company_id,user_id,type,title,body,entity_type,entity_id,email,read,dedupe_key)
      values (v_rec.company_id::text, v_recipient.user_id::text, 'employee_mdn_anniversary',
              'Aniversario MDN de ' || v_rec.first_name || ' ' || v_rec.last_name,
              v_rec.first_name || ' cumple '
              || (extract(year from v_today) - extract(year from v_rec.hire_date))::int
              || ' año(s) en MDN hoy. ¡Felicitaciones!',
              'employee', v_rec.user_id::text, false, false, v_dkey)
      on conflict (dedupe_key) where dedupe_key is not null do nothing;
    end loop;
  end loop;

end;
$$;
