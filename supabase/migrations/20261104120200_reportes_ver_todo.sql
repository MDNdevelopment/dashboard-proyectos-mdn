-- Nueva capability 'reportes.ver_todo': ver los reportes de TODAS las líneas, solo lectura.
-- Hoy la RLS de metric_reports solo deja ver todo a nivel ≥ 4 o admin
-- (metrics_user_view_all()); el resto ve únicamente las líneas de las que es miembro.
-- Solo se amplía el SELECT: insert/update/delete siguen exigiendo ser miembro (o nivel ≥ 4),
-- así que quien tenga esta capability no puede escribir en líneas ajenas.
--
-- Una capability sin fila en module_permissions queda abierta para todos, por eso se siembra
-- explícita: solo Andrea Garcia (Administración, nivel 3). Se amplía desde Empresa → Accesos.
insert into public.module_permissions (company_id, module_key, rules)
select u.company_id,
       'reportes.ver_todo',
       jsonb_build_object(
         'deny', '[]'::jsonb,
         'rules', jsonb_build_array(
           jsonb_build_object(
             'all', jsonb_build_array(
               jsonb_build_object('ids', jsonb_build_array(u.user_id::text), 'type', 'user', 'value', 1)
             )
           )
         )
       )
from public.users u
where u.user_id = 'b0de0a55-cc32-41a5-bdbd-975102473c39'
on conflict do nothing;

drop policy if exists "metric_reports_select" on public.metric_reports;
create policy "metric_reports_select" on public.metric_reports
  for select to authenticated
  using (
    metrics_user_view_all()
    or public.user_can('reportes.ver_todo')
    or (
      metrics_user_can_view()
      and exists (
        select 1 from public.metric_line_members mlm
        where mlm.line_id = metric_reports.line_id
          and mlm.user_id = auth.uid()::text
      )
    )
  );
