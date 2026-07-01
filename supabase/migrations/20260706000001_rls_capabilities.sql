-- ─────────────────────────────────────────────────────────────────────────────
-- RLS config-driven para tablas con migraciones versionadas.
--
-- Estrategia:
--   • SELECT se mantiene PERMISIVO (using(true)) en metric_lines y metric_clients
--     porque estas tablas son leídas también por los módulos Tareas y Ads.
--     La restricción de "ver" es frontend-only (ocultar tab / redirigir).
--   • INSERT / UPDATE / DELETE se reemplazan por user_can('<capacidad>').
--   • projects también recibe gate de escritura (proyectos.manage).
--   • tasks y metric_reports conservan su RLS especializado por nivel+membresía;
--     el gate de escritura se aplica solo en frontend.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── metric_lines (empresa.lineas.manage) ─────────────────────────────────────
drop policy if exists "metric_lines_authenticated_insert" on public.metric_lines;
drop policy if exists "metric_lines_authenticated_update" on public.metric_lines;
drop policy if exists "metric_lines_authenticated_delete" on public.metric_lines;

create policy "metric_lines_manage_insert" on public.metric_lines
  for insert to authenticated
  with check (user_can('empresa.lineas.manage'));

create policy "metric_lines_manage_update" on public.metric_lines
  for update to authenticated
  using     (user_can('empresa.lineas.manage'))
  with check (user_can('empresa.lineas.manage'));

create policy "metric_lines_manage_delete" on public.metric_lines
  for delete to authenticated
  using (user_can('empresa.lineas.manage'));

-- ── metric_clients (empresa.clientes.manage) ─────────────────────────────────
drop policy if exists "metric_clients_authenticated_insert" on public.metric_clients;
drop policy if exists "metric_clients_authenticated_update" on public.metric_clients;
drop policy if exists "metric_clients_authenticated_delete" on public.metric_clients;

create policy "metric_clients_manage_insert" on public.metric_clients
  for insert to authenticated
  with check (user_can('empresa.clientes.manage'));

create policy "metric_clients_manage_update" on public.metric_clients
  for update to authenticated
  using     (user_can('empresa.clientes.manage'))
  with check (user_can('empresa.clientes.manage'));

create policy "metric_clients_manage_delete" on public.metric_clients
  for delete to authenticated
  using (user_can('empresa.clientes.manage'));

-- ── projects (proyectos.manage) ───────────────────────────────────────────────
drop policy if exists "authenticated_insert" on public.projects;
drop policy if exists "authenticated_update" on public.projects;
drop policy if exists "authenticated_delete" on public.projects;
-- Nombres alternativos que podrían existir
drop policy if exists "projects_authenticated_insert" on public.projects;
drop policy if exists "projects_authenticated_update" on public.projects;
drop policy if exists "projects_authenticated_delete" on public.projects;

create policy "projects_manage_insert" on public.projects
  for insert to authenticated
  with check (user_can('proyectos.manage'));

create policy "projects_manage_update" on public.projects
  for update to authenticated
  using     (user_can('proyectos.manage'))
  with check (user_can('proyectos.manage'));

create policy "projects_manage_delete" on public.projects
  for delete to authenticated
  using (user_can('proyectos.manage'));
