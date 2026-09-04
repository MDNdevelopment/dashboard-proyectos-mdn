-- Migration: separa "Alta Gerencia" de "Independientes" en Tareas.
-- Hasta ahora todo empleado sin línea (metric_lines.is_general) caía en el mismo grupo
-- "Independientes", así que las tareas de dirección quedaban visibles para cualquier
-- independiente. Se agrega una segunda fila oculta por empresa (is_management=true) para
-- dirección (access_level >= 4), separada de is_general (columna propia porque el índice
-- único metric_lines_one_general_per_company solo permite UNA fila general por empresa, y
-- is_general ya tiene semántica propia en Chequeo/CNP/TaskModal — no se reutiliza).
--
-- Igual que Independientes, su membresía NO se persiste en metric_line_members: se deriva
-- en el cliente (ver withDerivedGeneralMembers en lineMembers.js). Por eso el aislamiento en
-- RLS no puede apoyarse en membresía — se apoya directamente en access_level >= 4, que es la
-- definición misma del grupo.

alter table public.metric_lines
  add column if not exists is_management boolean not null default false;

-- Una sola fila de Alta Gerencia por empresa.
create unique index if not exists metric_lines_one_management_per_company
  on public.metric_lines (company_id)
  where is_management;

-- Backfill: crear la fila "Alta Gerencia" para cada empresa que no la tenga aún.
insert into public.metric_lines (company_id, name, color, sort_order, is_management)
select distinct u.company_id::text, 'Alta Gerencia', '#6B7280', 9998, true
from public.users u
where u.company_id is not null
  and not exists (
    select 1 from public.metric_lines l
    where l.company_id = u.company_id::text and l.is_management
  );

-- ─── RLS: permitir que dirección (access_level >= 4) vea/edite tareas de Alta Gerencia ──

create or replace function public.task_is_management_line(p_team_id text)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.metric_lines
    where id::text = p_team_id
      and is_management
  )
$$;

drop policy if exists "tasks_select" on public.tasks;
drop policy if exists "tasks_insert" on public.tasks;
drop policy if exists "tasks_update" on public.tasks;
drop policy if exists "tasks_delete" on public.tasks;

create policy "tasks_select" on public.tasks
  for select to authenticated
  using (
    task_user_view_all()
    or (task_user_access_level() >= 2 and task_user_in_line(team_id::text))
    or (task_user_access_level() >= 2 and task_is_general_line(team_id::text) and task_user_has_no_line())
    or (task_user_access_level() >= 4 and task_is_management_line(team_id::text))
    or auth.uid()::text = any(assignee_ids)
    or support_id  = auth.uid()::text
    or created_by  = auth.uid()::text
  );

create policy "tasks_insert" on public.tasks
  for insert to authenticated
  with check (
    task_user_view_all()
    or (task_user_access_level() >= 2 and task_user_in_line(team_id::text))
    or (task_user_access_level() >= 2 and task_is_general_line(team_id::text) and task_user_has_no_line())
    or (task_user_access_level() >= 4 and task_is_management_line(team_id::text))
    or auth.uid()::text = any(assignee_ids)
  );

create policy "tasks_update" on public.tasks
  for update to authenticated
  using (
    task_user_view_all()
    or (task_user_access_level() >= 2 and task_user_in_line(team_id::text))
    or (task_user_access_level() >= 2 and task_is_general_line(team_id::text) and task_user_has_no_line())
    or (task_user_access_level() >= 4 and task_is_management_line(team_id::text))
    or auth.uid()::text = any(assignee_ids)
    or support_id  = auth.uid()::text
    or created_by  = auth.uid()::text
  )
  with check (
    task_user_view_all()
    or (task_user_access_level() >= 2 and task_user_in_line(team_id::text))
    or (task_user_access_level() >= 2 and task_is_general_line(team_id::text) and task_user_has_no_line())
    or (task_user_access_level() >= 4 and task_is_management_line(team_id::text))
    or auth.uid()::text = any(assignee_ids)
    or support_id  = auth.uid()::text
    or created_by  = auth.uid()::text
  );

create policy "tasks_delete" on public.tasks
  for delete to authenticated
  using (
    task_user_view_all()
    or (task_user_access_level() >= 2 and task_user_in_line(team_id::text))
    or (task_user_access_level() >= 2 and task_is_general_line(team_id::text) and task_user_has_no_line())
    or (task_user_access_level() >= 4 and task_is_management_line(team_id::text))
  );

-- Excluir Alta Gerencia del autocierre mensual de reportes (no es una línea operativa con
-- reportes/clientes; mismo criterio que ya aplica a is_general). Recrea
-- enqueue_metric_report_closures() (20260912000000_metric_reports_autoclose.sql) sin más
-- cambio que sumar "and coalesce(is_management, false) = false" al cursor de líneas.
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
       and coalesce(is_management, false) = false
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
