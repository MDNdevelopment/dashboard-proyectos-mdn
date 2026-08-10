-- Fix: enqueue_campaign_closures() was failing every day since it was deployed
-- (20260806000000_campaign_autoclose_cron.sql) with:
--   ERROR: COALESCE types text and uuid cannot be matched
-- because `coalesce(nullif(c.assignee, ''), c.created_by)` mixed a text column
-- (assignee) with a uuid column (created_by). The organic-tactics loop is step 1
-- of the function, so this error aborted the whole run — meaning paid ads
-- (step 2, paid_campaigns) never got auto-closed either, even though their query
-- has no such bug.
--
-- Fix: cast c.created_by to text before the coalesce.

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
        on u.user_id::text = coalesce(nullif(c.assignee, ''), c.created_by::text)
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
