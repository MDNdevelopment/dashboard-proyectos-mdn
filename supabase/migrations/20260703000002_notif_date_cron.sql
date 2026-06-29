-- Migration: daily pg_cron job for date-based notifications
-- Fires every day at 08:00 America/Caracas (12:00 UTC, UTC-4).
-- Sends in-app notifications only (email = false) for:
--   • Client anniversaries (anniversary_date, mdn_since) → 3 days before + on the day
--     Recipients: members of the client's line + level-4 employees of the company
--   • Client contact birthdays (contacts jsonb: birth_day + birth_month) → same cadence + recipients
--   • MDN employee birthdays (users.birth_date) → on the day only
--     Recipients: all users in the company
--   • MDN employee hire anniversaries (users.hire_date) → on the day only
--     Recipients: all users in the company

-- Prerequisites: enable pg_cron (do this once per project via Supabase dashboard →
-- Database → Extensions → pg_cron, or run: create extension if not exists pg_cron)
-- This migration assumes the extension is already enabled on the target project.

-- ── Helper: compute recipients for a client ─────────────────────────────────
-- Returns distinct user_ids: union of line members + level-4 employees of the company.
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
  -- Line members (from metric_lines.member_user_ids jsonb array)
  select distinct jsonb_array_elements_text(ml.member_user_ids) as user_id
    from public.metric_lines ml
   where ml.id = p_line_id
     and p_line_id is not null
  union
  -- Level-4 employees of the company
  select u.user_id
    from public.users u
   where u.company_id = p_company_id
     and u.access_level >= 4;
$$;

-- ── Main function: enqueue date notifications for today ─────────────────────
create or replace function public.enqueue_date_notifications()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_today         date := (now() at time zone 'America/Caracas')::date;
  v_today3        date := v_today + 3;
  -- months and days for the two target dates
  v_today_m       int  := extract(month from v_today)::int;
  v_today_d       int  := extract(day   from v_today)::int;
  v_today3_m      int  := extract(month from v_today3)::int;
  v_today3_d      int  := extract(day   from v_today3)::int;
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
begin

  -- ── 1. Client anniversaries & MDN-since dates ─────────────────────────────
  for v_rec in
    select c.id, c.name, c.company_id, c.line_id, c.anniversary_date, c.mdn_since
      from public.metric_clients c
     where c.anniversary_date is not null or c.mdn_since is not null
  loop

    -- Check anniversary_date for today and today+3
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
          end loop;
        end if;
      end loop;
    end if;

    -- Check mdn_since for today and today+3
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
          end loop;
        end if;
      end loop;
    end if;

  end loop;

  -- ── 2. Client contact birthdays ───────────────────────────────────────────
  -- contacts jsonb shape: [{ name, role, birth_day (int), birth_month (int) }]
  for v_rec in
    select c.id, c.name, c.company_id, c.line_id, c.contacts
      from public.metric_clients c
     where jsonb_array_length(c.contacts) > 0
  loop
    for v_contact in select jsonb_array_elements(v_rec.contacts)
    loop
      v_bday   := (v_contact->>'birth_day')::int;
      v_bmonth := (v_contact->>'birth_month')::int;
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
          end loop;
        end if;
      end loop;
    end loop;
  end loop;

  -- ── 3. MDN employee birthdays (only on the exact day) ────────────────────
  for v_rec in
    select u.user_id, u.company_id, u.first_name, u.last_name, u.birth_date
      from public.users u
     where u.birth_date is not null
       and extract(month from u.birth_date) = v_today_m
       and extract(day   from u.birth_date) = v_today_d
  loop
    -- Notify all users of the same company
    for v_recipient in
      select u2.user_id
        from public.users u2
       where u2.company_id = v_rec.company_id
    loop
      v_dkey := 'employee_birthday:' || v_rec.user_id || ':' || v_today::text || ':' || v_recipient.user_id;
      v_title := '🎂 Cumpleaños de ' || v_rec.first_name || ' ' || v_rec.last_name;
      v_body  := '¡Hoy es el cumpleaños de ' || v_rec.first_name || ' ' || v_rec.last_name || '! 🎉';

      insert into public.notifications
        (company_id, user_id, type, title, body, entity_type, entity_id, email, read, dedupe_key)
      values
        (v_rec.company_id, v_recipient.user_id, 'employee_birthday',
         v_title, v_body, 'employee', v_rec.user_id, false, false, v_dkey)
      on conflict (dedupe_key) where dedupe_key is not null do nothing;
    end loop;
  end loop;

  -- ── 4. MDN employee hire anniversaries (only on the exact day) ──────────
  for v_rec in
    select u.user_id, u.company_id, u.first_name, u.last_name, u.hire_date
      from public.users u
     where u.hire_date is not null
       and extract(month from u.hire_date) = v_today_m
       and extract(day   from u.hire_date) = v_today_d
       and u.hire_date < v_today   -- avoid notifying on the exact start day (year 0)
  loop
    for v_recipient in
      select u2.user_id
        from public.users u2
       where u2.company_id = v_rec.company_id
    loop
      v_dkey := 'employee_mdn_anniversary:' || v_rec.user_id || ':' || v_today::text || ':' || v_recipient.user_id;
      v_title := '🎊 Aniversario MDN de ' || v_rec.first_name || ' ' || v_rec.last_name;
      v_body  := v_rec.first_name || ' cumple '
                 || (extract(year from v_today) - extract(year from v_rec.hire_date))::int
                 || ' año(s) en MDN hoy. ¡Felicitaciones!';

      insert into public.notifications
        (company_id, user_id, type, title, body, entity_type, entity_id, email, read, dedupe_key)
      values
        (v_rec.company_id, v_recipient.user_id, 'employee_mdn_anniversary',
         v_title, v_body, 'employee', v_rec.user_id, false, false, v_dkey)
      on conflict (dedupe_key) where dedupe_key is not null do nothing;
    end loop;
  end loop;

end;
$$;

-- ── Schedule: run every day at 08:00 Caracas time (12:00 UTC) ────────────────
-- Requires pg_cron enabled on the project.
-- The schedule name is idempotent: re-running this migration is safe.
select cron.schedule(
  'enqueue-date-notifications',
  '0 12 * * *',
  $$select public.enqueue_date_notifications()$$
)
where not exists (
  select 1 from cron.job where jobname = 'enqueue-date-notifications'
);
