-- Bloque 1.5: bug de copy/paste en metric_reports_insert — el with_check
-- comparaba mlm.line_id = mlm.line_id (siempre true) en vez de
-- mlm.line_id = metric_reports.line_id, como sí hacen correctamente
-- metric_reports_select/update/delete. Cualquier miembro de una línea podía
-- insertar reportes (con datos de nómina) en una línea ajena.

drop policy if exists "metric_reports_insert" on public.metric_reports;

create policy "metric_reports_insert"
on public.metric_reports
for insert
to authenticated
with check (
  metrics_user_view_all()
  or (
    metrics_user_can_view()
    and exists (
      select 1 from public.metric_line_members mlm
      where mlm.line_id = metric_reports.line_id
        and mlm.user_id = (auth.uid())::text
    )
  )
);
