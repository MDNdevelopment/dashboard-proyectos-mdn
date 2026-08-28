-- Bloque 1.8: projects, metric_lines y metric_clients seguían con
-- INSERT/UPDATE/DELETE using(true) para authenticated pese a que las
-- migraciones que debían reemplazar estas policies
-- (20260706000000/001/002, 20260707000000) nunca se aplicaron en producción
-- (deriva repo ↔ prod). Cualquier empleado de nivel 1 podía borrar
-- proyectos, líneas o clientes.
--
-- user_can() ya existe en producción (con soporte deny/negate, más completo
-- que la versión de esas migraciones), y las capabilities empresa.lineas.manage,
-- empresa.clientes.manage y proyectos.manage ya están configuradas en
-- module_permissions, así que solo hace falta aplicar el gate de escritura.
--
-- SELECT se mantiene abierto (using(true)) en las tres tablas: se usa también
-- desde Tareas y Ads, y el filtro de "ver" es frontend-only.

-- ── metric_lines (empresa.lineas.manage) ─────────────────────────────────────
drop policy if exists "metric_lines_authenticated_insert" on public.metric_lines;
drop policy if exists "metric_lines_authenticated_update" on public.metric_lines;
drop policy if exists "metric_lines_authenticated_delete" on public.metric_lines;

create policy "metric_lines_manage_insert" on public.metric_lines
  for insert to authenticated
  with check (public.user_can('empresa.lineas.manage'));

create policy "metric_lines_manage_update" on public.metric_lines
  for update to authenticated
  using     (public.user_can('empresa.lineas.manage'))
  with check (public.user_can('empresa.lineas.manage'));

create policy "metric_lines_manage_delete" on public.metric_lines
  for delete to authenticated
  using (public.user_can('empresa.lineas.manage'));

-- ── metric_clients (empresa.clientes.manage) ─────────────────────────────────
drop policy if exists "metric_clients_authenticated_insert" on public.metric_clients;
drop policy if exists "metric_clients_authenticated_update" on public.metric_clients;
drop policy if exists "metric_clients_authenticated_delete" on public.metric_clients;

create policy "metric_clients_manage_insert" on public.metric_clients
  for insert to authenticated
  with check (public.user_can('empresa.clientes.manage'));

create policy "metric_clients_manage_update" on public.metric_clients
  for update to authenticated
  using     (public.user_can('empresa.clientes.manage'))
  with check (public.user_can('empresa.clientes.manage'));

create policy "metric_clients_manage_delete" on public.metric_clients
  for delete to authenticated
  using (public.user_can('empresa.clientes.manage'));

-- ── projects (proyectos.manage) ───────────────────────────────────────────────
drop policy if exists "authenticated_insert" on public.projects;
drop policy if exists "authenticated_update" on public.projects;
drop policy if exists "authenticated_delete" on public.projects;

create policy "projects_manage_insert" on public.projects
  for insert to authenticated
  with check (public.user_can('proyectos.manage'));

create policy "projects_manage_update" on public.projects
  for update to authenticated
  using     (public.user_can('proyectos.manage'))
  with check (public.user_can('proyectos.manage'));

create policy "projects_manage_delete" on public.projects
  for delete to authenticated
  using (public.user_can('proyectos.manage'));
