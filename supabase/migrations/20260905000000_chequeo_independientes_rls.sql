-- Chequeo: nuevo team "Independientes" para las cuentas sin línea.
--
-- La UI (ChequeoPage/ChequeoGrid) ahora carga la línea general is_general=true
-- (metric_lines "Independientes") y agrupa ahí tanto las cuentas explícitamente movidas a
-- esa línea como las que tienen line_id=null (metric_clients.line_id es nullable desde
-- 20260626000000_clients_lines_refactor.sql, con FK ON DELETE SET NULL). Al guardar un
-- chequeo de una de esas cuentas, se persiste publication_checks.line_id = id de la línea
-- general (ver effectiveLineId en src/utils/chequeo.js) — nunca null.
--
-- Las policies de escritura de publication_checks (20260821000000, endurecidas en
-- 20260904000000_chequeo_ver_todo_rls.sql) solo aceptaban task_user_view_all() (nivel≥4
-- o admin), user_can('chequeo.ver_todo') o task_user_in_line(line_id) (ser miembro real de
-- esa línea) — pero nadie es "miembro" de la línea general (su membresía se deriva en el
-- cliente, no se persiste en metric_line_members), así que cualquier usuario sin esas dos
-- capabilities habría visto el team en la UI pero no habría podido guardar. Se agrega
-- task_is_general_line(line_id::text) como alternativa: el mismo helper que ya usa Tareas
-- desde 20260717000001_metric_lines_independientes.sql para su propio grupo
-- "Independientes", ahora reutilizado aquí. A diferencia de Tareas, aquí no se exige
-- además task_user_has_no_line() — la decisión de producto es que el team sea visible y
-- editable por cualquiera con chequeo.manage, no solo por quienes no tienen línea.
drop policy if exists "publication_checks_insert" on public.publication_checks;
drop policy if exists "publication_checks_update" on public.publication_checks;
drop policy if exists "publication_checks_delete" on public.publication_checks;

create policy "publication_checks_insert" on public.publication_checks
  for insert to authenticated
  with check (
    user_can('chequeo.manage')
    and (
      task_user_view_all()
      or user_can('chequeo.ver_todo')
      or task_user_in_line(line_id::text)
      or task_is_general_line(line_id::text)
    )
  );

create policy "publication_checks_update" on public.publication_checks
  for update to authenticated
  using (
    user_can('chequeo.manage')
    and (
      task_user_view_all()
      or user_can('chequeo.ver_todo')
      or task_user_in_line(line_id::text)
      or task_is_general_line(line_id::text)
    )
  )
  with check (
    user_can('chequeo.manage')
    and (
      task_user_view_all()
      or user_can('chequeo.ver_todo')
      or task_user_in_line(line_id::text)
      or task_is_general_line(line_id::text)
    )
  );

create policy "publication_checks_delete" on public.publication_checks
  for delete to authenticated
  using (
    user_can('chequeo.manage')
    and (
      task_user_view_all()
      or user_can('chequeo.ver_todo')
      or task_user_in_line(line_id::text)
      or task_is_general_line(line_id::text)
    )
  );
