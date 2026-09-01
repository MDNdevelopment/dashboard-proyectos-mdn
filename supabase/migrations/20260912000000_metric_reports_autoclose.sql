-- Migration: cierre automático de reportes mensuales + aviso diario a las jefas.
--
-- Hasta ahora metric_reports solo se cerraba manualmente (closed_at/closed_by, ver
-- 20260715185715_metric_reports_close.sql), y solo con la capability reportes.close
-- (nivel 4/admin). Las jefas de línea (metric_line_members.is_lead) no podían cerrar su
-- propio reporte, así que los meses quedaban abiertos indefinidamente.
--
-- Nuevo modelo (ver ARQUITECTURA.md §2.5):
--   - Del día 1 al 5 del mes, la jefa de cada línea recibe un aviso diario in-app
--     recordando que el reporte del mes anterior cierra el día 5.
--   - El día 5, el reporte se cierra AUTOMÁTICAMENTE tal como esté (incluso vacío/sin
--     fila todavía) — no hay condición de "completo": cerrar es irreversible por diseño
--     (trigger prevent_closed_report_edit) y no existe heurística de completitud en el
--     código, así que el cierre automático no intenta inventar una.
--   - La jefa puede además cerrar su propio reporte antes ("marcar como listo") desde el
--     frontend — eso no toca esta migración, solo requiere que closeReport() siga
--     funcionando para nivel 3 (ya lo hace, vía metrics_user_can_view()).
--
-- Modelado 1:1 sobre el molde ya probado en 20260806000000_campaign_autoclose_cron.sql
-- (recipients + función security definer con dedupe_key + cron.schedule idempotente),
-- con el blindaje por-evento (BEGIN/EXCEPTION) documentado en
-- 20260901000000_fix_notif_date_cron_hardening.sql y su tabla notif_cron_runs.

-- ── Columna nueva: distingue cierre automático de cierre manual ────────────────────
alter table public.metric_reports
  add column if not exists closed_auto boolean not null default false;

-- ── Helper: destinatarios del aviso/cierre de una línea ─────────────────────────────
-- Siempre la jefa de la línea (is_lead=true, activa). Si p_include_managers, además
-- todo nivel >= 4 de la empresa (solo se usa en el aviso de CIERRE efectivo, día 5).
create or replace function public.metric_report_close_recipients(
  p_line_id          uuid,
  p_company_id       text,
  p_include_managers boolean
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
     and mlm.is_lead = true
     and u.deleted_at is null
  union
  select u.user_id::text
    from public.users u
   where p_include_managers
     and u.company_id::text = p_company_id
     and u.access_level >= 4
     and u.deleted_at is null;
$$;

-- ── Main function: avisos diarios (día 1-4) + cierre automático (día 5) ─────────────
create or replace function public.enqueue_metric_report_closures()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_today        date := (now() at time zone 'America/Caracas')::date;
  v_day          int  := extract(day from v_today)::int;
  v_month_names  text[] := array['enero','febrero','marzo','abril','mayo','junio','julio',
                                  'agosto','septiembre','octubre','noviembre','diciembre'];
  v_year         int;
  v_month        int;
  v_month_label  text;
  v_line         record;
  v_report       record;
  v_recipient    record;
  v_title        text;
  v_body         text;
  v_dkey         text;
  v_entity_id    text;
  v_inserted     int := 0;
  v_errors       int := 0;
  v_error_sample text;
  v_rows         int;
  v_days_left    int;
begin
  -- Fuera de la ventana de cierre (día 1-5): no hay nada que hacer.
  if v_day > 5 then
    return;
  end if;

  -- Periodo que se está por cerrar: el mes calendario anterior a hoy.
  if extract(month from v_today) = 1 then
    v_year  := extract(year from v_today)::int - 1;
    v_month := 12;
  else
    v_year  := extract(year from v_today)::int;
    v_month := extract(month from v_today)::int - 1;
  end if;
  v_month_label := v_month_names[v_month];
  v_days_left   := 5 - v_day;

  for v_line in
    select id, company_id, name
      from public.metric_lines
     where coalesce(is_general, false) = false
  loop
    begin
      select id, closed_at
        into v_report
        from public.metric_reports
       where line_id = v_line.id and year = v_year and month = v_month;

      -- Ya cerrado (manual o automático): nada que avisar ni que cerrar.
      if found and v_report.closed_at is not null then
        continue;
      end if;

      v_entity_id := v_line.id::text || ':' || v_year::text || ':' || v_month::text;

      if v_day < 5 then
        -- ── Recordatorio diario a la jefa ────────────────────────────────────
        v_title := '📋 Tu reporte de ' || initcap(v_month_label) || ' cierra el día 5';
        v_body  := 'Faltan ' || v_days_left || ' día(s) para el cierre automático del '
                   || 'reporte de ' || v_line.name || ' · ' || initcap(v_month_label) || ' ' || v_year
                   || '. Si ya está listo, marcalo como listo para cerrarlo ahora.';

        for v_recipient in
          select user_id from public.metric_report_close_recipients(v_line.id, v_line.company_id, false)
        loop
          v_dkey := 'report_close_reminder:' || v_line.id::text || ':' || v_year || '-' || v_month
                    || ':' || v_today::text || ':' || v_recipient.user_id;
          insert into public.notifications
            (company_id, user_id, type, title, body, entity_type, entity_id, email, read, dedupe_key)
          values
            (v_line.company_id, v_recipient.user_id, 'report_close_reminder',
             v_title, v_body, 'metric_report', v_entity_id, false, false, v_dkey)
          on conflict (dedupe_key) where dedupe_key is not null do nothing;
          get diagnostics v_rows = row_count;
          v_inserted := v_inserted + v_rows;
        end loop;

      else
        -- ── Día 5: cierre automático incondicional ───────────────────────────
        if not found then
          insert into public.metric_reports
            (company_id, line_id, year, month, data, closed_at, closed_by, closed_auto)
          values
            (v_line.company_id, v_line.id, v_year, v_month,
             jsonb_build_object(
               'reuniones', jsonb_build_object('realizadas', null, 'meta', 0, 'comentario', null, 'justificativos', '{}'::jsonb),
               'productividad', jsonb_build_object('tareas', '[]'::jsonb),
               'crecimiento', jsonb_build_object('items', '[]'::jsonb),
               'solicitudes', jsonb_build_object('solicitudes', null, 'editadas', null),
               'pautas', jsonb_build_object('items', '[]'::jsonb),
               'piezas', jsonb_build_object('piezas', null, 'editadas', null),
               'feedback', jsonb_build_object('items', '[]'::jsonb),
               'finanzas', jsonb_build_object('ingresos', '[]'::jsonb, 'gastosOperativos', '[]'::jsonb, 'sueldos', '[]'::jsonb, 'otrosGastos', '[]'::jsonb)
             ),
             now(), null, true);
        else
          update public.metric_reports
             set closed_at = now(), closed_by = null, closed_auto = true
           where id = v_report.id;
        end if;

        v_title := '🔒 Reporte cerrado automáticamente';
        v_body  := 'El reporte de ' || v_line.name || ' · ' || initcap(v_month_label) || ' ' || v_year
                   || ' se cerró automáticamente el día 5 y ya no puede editarse.';

        for v_recipient in
          select user_id from public.metric_report_close_recipients(v_line.id, v_line.company_id, true)
        loop
          v_dkey := 'report_autoclosed:' || v_line.id::text || ':' || v_year || '-' || v_month
                    || ':' || v_recipient.user_id;
          insert into public.notifications
            (company_id, user_id, type, title, body, entity_type, entity_id, email, read, dedupe_key)
          values
            (v_line.company_id, v_recipient.user_id, 'report_autoclosed',
             v_title, v_body, 'metric_report', v_entity_id, false, false, v_dkey)
          on conflict (dedupe_key) where dedupe_key is not null do nothing;
          get diagnostics v_rows = row_count;
          v_inserted := v_inserted + v_rows;
        end loop;
      end if;

    exception when others then
      v_errors := v_errors + 1;
      v_error_sample := coalesce(v_error_sample, 'line=' || v_line.id || ': ' || sqlerrm);
    end;
  end loop;

  insert into public.notif_cron_runs (job_name, notifications_inserted, errors_count, error_sample, ok)
  values ('enqueue-metric-report-closures', v_inserted, v_errors, v_error_sample, v_errors = 0);

end;
$$;

-- ── Schedule: 07:30 Caracas (11:30 UTC), no colisiona con los otros crons diarios ───
select cron.schedule(
  'enqueue-metric-report-closures',
  '30 11 * * *',
  $$select public.enqueue_metric_report_closures()$$
)
where not exists (
  select 1 from cron.job where jobname = 'enqueue-metric-report-closures'
);
