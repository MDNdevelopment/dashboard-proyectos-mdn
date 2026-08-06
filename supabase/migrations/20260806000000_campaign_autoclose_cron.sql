-- Migration: daily pg_cron job that auto-closes campaigns past their end date.
-- Fires every day at 07:00 America/Caracas (11:00 UTC, UTC-4).
--
-- Scope: both organic tactics (`campaigns`) and paid ads (`paid_campaigns`).
-- When a row's end_date has passed (end_date < today, Caracas) and its status is
-- still 'Pendiente' or 'En Curso', it is moved to 'Finalizado'. For paid ads the
-- cron cannot capture results (reach, interactions, ...), so the row is flagged
-- `results_pending = true` and the notification reminds the owner to add them.
--
-- Notifications (in-app only, email = false) go to the responsible user plus every
-- active "Marketing Manager" of the company. Idempotent via `dedupe_key`, so a row
-- is only announced once no matter how many times the job runs.
--
-- Prerequisites: pg_cron enabled on the project (already enabled here). Mirrors the
-- pattern of 20260703000002_notif_date_cron.sql.

-- ── Marker column: paid ad auto-closed but still missing results ─────────────
alter table public.paid_campaigns
  add column if not exists results_pending boolean not null default false;

-- ── Helper: recipients for a campaign closure ───────────────────────────────
-- Distinct user_ids: the responsible user (if any) + every active Marketing
-- Manager of the company. Everything is cast to text: users.user_id/company_id are
-- uuid, while notifications.user_id/company_id, campaigns.assignee and
-- paid_campaigns.responsable_id/company_id are text.
create or replace function public.notif_campaign_recipients(
  p_company_id text,
  p_responsable text
)
returns table (user_id text)
language sql
security definer
stable
set search_path = public
as $$
  -- Marketing Managers of the company (exact match excludes "Asst. de Marketing")
  select u.user_id::text
    from public.users u
    join public.positions p on p.position_id = u.position_id
   where u.company_id::text = p_company_id
     and u.deleted_at is null
     and lower(p.position_name) = 'marketing manager'
  union
  -- The responsible user, when set
  select p_responsable
   where p_responsable is not null and p_responsable <> '';
$$;

-- ── Main function: auto-close campaigns/ads past their end date ──────────────
create or replace function public.enqueue_campaign_closures()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_today     date := (now() at time zone 'America/Caracas')::date;
  v_rec       record;
  v_recipient record;
  v_company   text;
  v_title     text;
  v_body      text;
  v_dkey      text;
begin

  -- ── 1. Organic tactics (campaigns) ────────────────────────────────────────
  -- campaigns has no company_id column; derive it from the assignee (or the
  -- creator as fallback), both of which hold users.user_id.
  for v_rec in
    select c.id, c.name, c.assignee, u.company_id
      from public.campaigns c
      left join public.users u
        on u.user_id::text = coalesce(nullif(c.assignee, ''), c.created_by)
     where c.end_date is not null
       and c.end_date < v_today
       and c.status in ('Pendiente', 'En Curso')
  loop
    update public.campaigns
       set status = 'Finalizado', updated_at = now()
     where id = v_rec.id;

    v_company := coalesce(v_rec.company_id::text, '');
    v_title   := '✅ Campaña finalizada automáticamente';
    v_body    := 'La táctica "' || v_rec.name
                 || '" llegó a su fecha de cierre y pasó a Finalizado.';

    for v_recipient in
      select r.user_id from public.notif_campaign_recipients(v_company, v_rec.assignee) r
    loop
      v_dkey := 'campaign_autoclosed:' || v_rec.id::text || ':' || v_recipient.user_id;
      insert into public.notifications
        (company_id, user_id, type, title, body, entity_type, entity_id, email, read, dedupe_key)
      values
        (v_company, v_recipient.user_id, 'campaign_autoclosed',
         v_title, v_body, 'campaign', v_rec.id::text, false, false, v_dkey)
      on conflict (dedupe_key) where dedupe_key is not null do nothing;
    end loop;
  end loop;

  -- ── 2. Paid ads (paid_campaigns) ──────────────────────────────────────────
  for v_rec in
    select p.id, p.name, p.company_id, p.responsable_id
      from public.paid_campaigns p
     where p.end_date is not null
       and p.end_date < v_today
       and p.status in ('Pendiente', 'En Curso')
  loop
    update public.paid_campaigns
       set status = 'Finalizado', results_pending = true, updated_at = now()
     where id = v_rec.id;

    v_title := '✅ Ad finalizado — faltan resultados';
    v_body  := 'El ad "' || v_rec.name
               || '" llegó a su fecha de cierre y pasó a Finalizado. '
               || 'Recuerda cargar los resultados.';

    for v_recipient in
      select r.user_id
        from public.notif_campaign_recipients(v_rec.company_id, v_rec.responsable_id) r
    loop
      v_dkey := 'ad_autoclosed:' || v_rec.id::text || ':' || v_recipient.user_id;
      insert into public.notifications
        (company_id, user_id, type, title, body, entity_type, entity_id, email, read, dedupe_key)
      values
        (v_rec.company_id, v_recipient.user_id, 'ad_autoclosed',
         v_title, v_body, 'ad', v_rec.id::text, false, false, v_dkey)
      on conflict (dedupe_key) where dedupe_key is not null do nothing;
    end loop;
  end loop;

end;
$$;

-- ── Schedule: run every day at 07:00 Caracas time (11:00 UTC) ────────────────
-- Idempotent: re-running this migration is safe.
select cron.schedule(
  'enqueue-campaign-closures',
  '0 11 * * *',
  $$select public.enqueue_campaign_closures()$$
)
where not exists (
  select 1 from cron.job where jobname = 'enqueue-campaign-closures'
);
