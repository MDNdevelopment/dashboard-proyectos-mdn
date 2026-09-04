-- Migration: deshabilita temporalmente el CIERRE automático del día 5 en
-- enqueue_metric_report_closures() (ver 20260912000000_metric_reports_autoclose.sql).
--
-- El aviso diario a las jefas (días 1-4, in-app vía notifications + el modal
-- ReportCloseReminderModal que usa isClosureWindow()/CLOSURE_DAY en
-- src/utils/reportClosure.js) SIGUE funcionando sin cambios: solo se apaga la
-- acción de cerrar el reporte (insert/update de metric_reports con closed_at)
-- y su notificación "🔒 Reporte cerrado automáticamente" el día 5.
--
-- Reversible: para reactivar el cierre automático, poner v_autoclose_enabled
-- en true (o simplemente re-aplicar 20260912000000_metric_reports_autoclose.sql).
-- No se borra nada de la lógica original, solo queda detrás del flag.

create or replace function public.enqueue_metric_report_closures()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_autoclose_enabled constant boolean := false; -- ← poner en true para reactivar el cierre automático del día 5
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

      elsif v_autoclose_enabled then
        -- ── Día 5: cierre automático incondicional (deshabilitado, ver flag arriba) ──
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
      -- Si v_day = 5 y v_autoclose_enabled = false: no se hace nada (no cierre, no notificación de cierre).

    exception when others then
      v_errors := v_errors + 1;
      v_error_sample := coalesce(v_error_sample, 'line=' || v_line.id || ': ' || sqlerrm);
    end;
  end loop;

  insert into public.notif_cron_runs (job_name, notifications_inserted, errors_count, error_sample, ok)
  values ('enqueue-metric-report-closures', v_inserted, v_errors, v_error_sample, v_errors = 0);

end;
$$;
