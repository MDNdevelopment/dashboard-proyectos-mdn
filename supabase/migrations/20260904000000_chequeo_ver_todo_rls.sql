-- La nueva capability 'chequeo.ver_todo' (src/config/modules.js) permite dar "acceso
-- completo" al módulo Chequeo a alguien de nivel < 4 sin subirle el nivel (p. ej. Juan
-- Lauretta, o el cargo Community Manager) — pero las políticas RLS de escritura de
-- publication_checks (20260821000000_create_publication_checks.sql) solo aceptaban
-- task_user_view_all() (admin o nivel≥4) o task_user_in_line() (ser miembro real de la
-- línea) para escribir fuera de "solo mi línea". Sin este cambio, alguien con
-- chequeo.manage + chequeo.ver_todo veía todas las líneas en la UI pero la base de
-- datos igual rechazaba sus escrituras en líneas donde no es miembro.
--
-- Se agrega user_can('chequeo.ver_todo') como alternativa a task_user_view_all() en las
-- tres políticas de escritura, mismo patrón que ya usa user_can('chequeo.manage').
drop policy if exists "publication_checks_insert" on public.publication_checks;
drop policy if exists "publication_checks_update" on public.publication_checks;
drop policy if exists "publication_checks_delete" on public.publication_checks;

create policy "publication_checks_insert" on public.publication_checks
  for insert to authenticated
  with check (
    user_can('chequeo.manage')
    and (task_user_view_all() or user_can('chequeo.ver_todo') or task_user_in_line(line_id::text))
  );

create policy "publication_checks_update" on public.publication_checks
  for update to authenticated
  using (
    user_can('chequeo.manage')
    and (task_user_view_all() or user_can('chequeo.ver_todo') or task_user_in_line(line_id::text))
  )
  with check (
    user_can('chequeo.manage')
    and (task_user_view_all() or user_can('chequeo.ver_todo') or task_user_in_line(line_id::text))
  );

create policy "publication_checks_delete" on public.publication_checks
  for delete to authenticated
  using (
    user_can('chequeo.manage')
    and (task_user_view_all() or user_can('chequeo.ver_todo') or task_user_in_line(line_id::text))
  );
