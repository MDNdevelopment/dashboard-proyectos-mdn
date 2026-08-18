-- Tabla "fixed_task_marks": tildes de cumplimiento de tareas fijas semanales (módulo
-- Gestión de Tareas → Tareas Fijas, sub-sección Redes-Diseño). Un tilde por
-- (cuenta, tarea, semana) del mes. Alimenta el indicador «2. Productividad — Tareas
-- Fijas» del reporte mensual de la línea (ver OperacionesView.jsx) y la sección
-- «Tareas Fijas» del perfil de cada empleado (MiPerfilV2View.jsx).
--
-- task_key: las 5 tareas recurrentes del mockup — 'metricas' (solo semana 1),
-- 'grilla'/'artes'/'plataformas' (todas las semanas), 'calendario' (solo última semana).
-- period_week: nº de semana DENTRO DEL MES (1-indexed, semana ancla = miércoles — ver
-- utils/fixedTasks.js:buildFixedWeeks). period_week se reinicia cada mes (1..5), por eso
-- el unique constraint incluye period_month: sin él, la semana 1 de enero y la semana 1
-- de febrero colisionarían en la misma fila.
--
-- line_id se denormaliza desde metric_clients.line_id al tildar (snapshot, mismo
-- patrón que meetings.line_id): si la cuenta cambia de línea después, las marcas ya
-- guardadas no se recalculan ni desaparecen del histórico de esa línea.
create table if not exists public.fixed_task_marks (
  id           uuid primary key default gen_random_uuid(),
  company_id   text not null,
  client_id    uuid not null references public.metric_clients(id) on delete cascade,
  line_id      uuid not null references public.metric_lines(id) on delete cascade,
  task_key     text not null,
  period_year  int  not null,
  period_month int  not null,
  period_week  int  not null,
  status       text not null,
  link         text,                                    -- enlace opcional cuando status='si'
  marked_by    uuid,
  marked_at    timestamptz not null default now(),
  constraint fixed_task_marks_task_key_check check (
    task_key in ('metricas', 'grilla', 'artes', 'plataformas', 'calendario')
  ),
  constraint fixed_task_marks_month_check check (period_month between 1 and 12),
  constraint fixed_task_marks_status_check check (status in ('si', 'no', 'na')),
  constraint fixed_task_marks_unique
    unique (client_id, task_key, period_year, period_month, period_week)
);

alter table public.fixed_task_marks enable row level security;

-- Lectura: cualquier autenticado (mismo criterio que metric_clients/tasks).
create policy "fixed_task_marks_select" on public.fixed_task_marks
  for select to authenticated
  using (true);

-- Escritura: gated por capability 'tareas.fijas.manage' Y visibilidad de línea —
-- nivel 4/admin (task_user_view_all) escriben cualquier línea; nivel 2/3 miembros de
-- la línea (task_user_in_line) solo la suya. Reusa los helpers security definer de
-- 20260709000000_tasks_line_scoped_rls.sql (genéricos, no específicos de `tasks`).
create policy "fixed_task_marks_insert" on public.fixed_task_marks
  for insert to authenticated
  with check (
    user_can('tareas.fijas.manage')
    and (task_user_view_all() or task_user_in_line(line_id::text))
  );

create policy "fixed_task_marks_update" on public.fixed_task_marks
  for update to authenticated
  using (
    user_can('tareas.fijas.manage')
    and (task_user_view_all() or task_user_in_line(line_id::text))
  )
  with check (
    user_can('tareas.fijas.manage')
    and (task_user_view_all() or task_user_in_line(line_id::text))
  );

create policy "fixed_task_marks_delete" on public.fixed_task_marks
  for delete to authenticated
  using (
    user_can('tareas.fijas.manage')
    and (task_user_view_all() or task_user_in_line(line_id::text))
  );

-- Realtime: grilla en vivo entre usuarios de la misma línea (patrón AppLayout/Tareas).
alter publication supabase_realtime add table public.fixed_task_marks;

create index if not exists fixed_task_marks_line_period_idx
  on public.fixed_task_marks (line_id, period_year, period_month, period_week);
create index if not exists fixed_task_marks_client_task_idx
  on public.fixed_task_marks (client_id, task_key);

-- ── Columna de configuración por cuenta: qué tareas fijas le aplican ──────────
-- Default = todas activas. Si la columna es null para una cuenta, el frontend
-- (utils/fixedTasks.js) asume que todas las tareas aplican.
alter table public.metric_clients
  add column if not exists fixed_tasks jsonb;

-- ── Seed de capacidad por defecto ────────────────────────────────────────────
-- tareas.fijas.manage → nivel 2+ (jefes y coordinadores tildan, igual que tareas.manage)
-- tareas.fijas (ver el tab) → sin reglas = abierto a todos los autenticados
do $$
declare
  cid text;
begin
  for cid in
    select distinct company_id::text from public.users where company_id is not null
  loop
    insert into public.module_permissions (company_id, module_key, rules) values
      (cid, 'tareas.fijas.manage',
       '{"rules":[{"all":[{"type":"min_level","value":2,"ids":[]}]}]}'::jsonb)
    on conflict (company_id, module_key) do nothing;
  end loop;
end;
$$;
