-- Migration: metric_reports RLS scoped by user level and team membership
-- Nivel 3+ (o admin) pueden acceder al módulo Métricas.
-- Nivel 3 solo ve/edita los reportes de su propia línea (membership vía metric_lines.member_user_ids).
-- Nivel 4+ y admin ven y editan todos los reportes.
-- metric_lines y metric_clients conservan su RLS permisivo (son compartidas por Tareas/Empresa/Ads).

-- ─── Helpers security definer ─────────────────────────────────────────────────
-- Patrón idéntico a task_user_privileged() (20260629000000_tasks_level1_rls.sql).

-- ¿El usuario tiene acceso al módulo Métricas? (nivel 3+ o admin)
create or replace function public.metrics_user_can_view()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(admin, false) or coalesce(access_level, 1) >= 3
  from public.users where user_id = auth.uid()
$$;

-- ¿El usuario puede ver TODOS los teams? (nivel 4+ o admin)
create or replace function public.metrics_user_view_all()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(admin, false) or coalesce(access_level, 1) >= 4
  from public.users where user_id = auth.uid()
$$;

-- ─── Reemplazar políticas permisivas de metric_reports ────────────────────────
-- Las originales se crearon en 20260625000000_create_metricas.sql con using(true).

drop policy if exists "metric_reports_authenticated_read"   on public.metric_reports;
drop policy if exists "metric_reports_authenticated_insert" on public.metric_reports;
drop policy if exists "metric_reports_authenticated_update" on public.metric_reports;
drop policy if exists "metric_reports_authenticated_delete" on public.metric_reports;

-- Predicado compartido:
--   view_all  → puede ver/editar cualquier reporte
--   can_view  → nivel 3, solo si es miembro de la línea del reporte
-- member_user_ids es jsonb con strings de user_id; auth.uid() es uuid → cast a text.

create policy "metric_reports_select" on public.metric_reports
  for select to authenticated
  using (
    metrics_user_view_all()
    or (
      metrics_user_can_view()
      and exists (
        select 1 from public.metric_lines ml
        where ml.id = metric_reports.line_id
          and ml.member_user_ids ? auth.uid()::text
      )
    )
  );

create policy "metric_reports_insert" on public.metric_reports
  for insert to authenticated
  with check (
    metrics_user_view_all()
    or (
      metrics_user_can_view()
      and exists (
        select 1 from public.metric_lines ml
        where ml.id = line_id
          and ml.member_user_ids ? auth.uid()::text
      )
    )
  );

create policy "metric_reports_update" on public.metric_reports
  for update to authenticated
  using (
    metrics_user_view_all()
    or (
      metrics_user_can_view()
      and exists (
        select 1 from public.metric_lines ml
        where ml.id = metric_reports.line_id
          and ml.member_user_ids ? auth.uid()::text
      )
    )
  )
  with check (
    metrics_user_view_all()
    or (
      metrics_user_can_view()
      and exists (
        select 1 from public.metric_lines ml
        where ml.id = metric_reports.line_id
          and ml.member_user_ids ? auth.uid()::text
      )
    )
  );

create policy "metric_reports_delete" on public.metric_reports
  for delete to authenticated
  using (
    metrics_user_view_all()
    or (
      metrics_user_can_view()
      and exists (
        select 1 from public.metric_lines ml
        where ml.id = metric_reports.line_id
          and ml.member_user_ids ? auth.uid()::text
      )
    )
  );
