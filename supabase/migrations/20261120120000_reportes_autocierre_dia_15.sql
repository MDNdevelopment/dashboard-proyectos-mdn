-- Autocierre de reportes mensuales: se reactiva y pasa del día 5 al día 15.
-- NO aplicar a producción sin confirmación del desarrollador.
--
-- Cambios respecto a la versión vigente (20260904000000, con el cierre apagado):
--  * El reporte del mes anterior se cierra solo el día 15 (hora de Caracas), con closed_auto = true.
--  * Avisos diarios a la jefa del día 10 al 14 (antes días 1-4).
--  * Si la línea no tiene reporte del mes, NO se crea uno vacío cerrado: un reporte cerrado ahora
--    solo lo reabre un admin, y un mes en blanco congelado no aporta nada.
-- No es retroactivo: solo mira el mes calendario anterior, así que los meses ya pasados no se tocan.
-- Los reportes que cierra el cron son inmutables igual que los manuales (20261120110000); el cron
-- corre sin usuario (auth.uid() nulo), por eso el trigger de INSERT no lo bloquea.

create or replace function public.enqueue_metric_report_closures()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  c_close_day    constant int := 15;
  c_remind_from  constant int := 10;
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
  -- Fuera de la ventana de avisos y cierre (días 10-15): no hay nada que hacer.
  if v_day < c_remind_from or v_day > c_close_day then
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
  v_days_left   := c_close_day - v_day;

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

      if v_day < c_close_day then
        -- ── Recordatorio diario a la jefa ────────────────────────────────────
        v_title := '📋 Tu reporte de ' || initcap(v_month_label) || ' cierra el día ' || c_close_day;
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
        -- ── Día 15: cierre automático, solo de reportes que existen ───────────
        if not found then
          continue;
        end if;

        update public.metric_reports
           set closed_at = now(), closed_by = null, closed_auto = true
         where id = v_report.id;

        v_title := '🔒 Reporte cerrado automáticamente';
        v_body  := 'El reporte de ' || v_line.name || ' · ' || initcap(v_month_label) || ' ' || v_year
                   || ' se cerró automáticamente el día ' || c_close_day
                   || ' y ya no puede editarse. Solo un administrador puede desbloquearlo.';

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
