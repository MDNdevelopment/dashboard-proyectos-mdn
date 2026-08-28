-- Bloque 1.4: metric_line_members tenía "for all using(true)" para
-- authenticated. Esta tabla es la llave de task_user_in_line(), que gobierna
-- el RLS de tareas, tareas fijas, chequeo, CNP, pautas y reportes: cualquier
-- nivel 1 podía auto-insertarse en la línea que quisiera y leer sus finanzas.
--
-- SELECT queda abierto (se usa en toda la app para listar el equipo de cada
-- línea: LinesView, metricsApi, FinanzasView, Tareas, CNP). La escritura
-- (insert/update/delete) pasa a requerir la capability 'empresa.lineas.manage'
-- (hoy min_level 3 + Sofía Lauretta, configurable desde Empresa → Permisos).

drop policy if exists "auth users full access" on public.metric_line_members;

create policy "metric_line_members_select"
on public.metric_line_members
for select
to authenticated
using (true);

create policy "metric_line_members_insert"
on public.metric_line_members
for insert
to authenticated
with check (public.user_can('empresa.lineas.manage'));

create policy "metric_line_members_update"
on public.metric_line_members
for update
to authenticated
using (public.user_can('empresa.lineas.manage'))
with check (public.user_can('empresa.lineas.manage'));

create policy "metric_line_members_delete"
on public.metric_line_members
for delete
to authenticated
using (public.user_can('empresa.lineas.manage'));
