-- Bug real: Lizdania (nivel 2, sin línea real asignada) no podía crear un CNP para
-- Credimara (cliente sin línea → cae en la línea general "Independientes") — RLS
-- rechazaba el INSERT con "new row violates row-level security policy for table
-- cnp_requests".
--
-- Causa: `cnp_requests_insert` (seed en 20260901000000_create_cnp.sql) solo aceptaba
-- task_user_view_all() o task_user_in_line(line_id) — pero las líneas generales
-- ("Independientes"/"Alta Gerencia") nunca tienen su membresía persistida en
-- metric_line_members (se derivan client-side, ver withDerivedGeneralMembers en
-- src/utils/lineMembers.js), así que task_user_in_line() siempre da false ahí. La
-- policy de UPDATE ya se corrigió para este mismo caso en
-- 20260922000000_cnp_assignee_can_update.sql con
-- task_is_general_line(line_id) and task_user_has_no_line(); este fix aplica el mismo
-- criterio a INSERT y DELETE (que tenían el mismo hueco).
drop policy if exists "cnp_requests_insert" on public.cnp_requests;
drop policy if exists "cnp_requests_delete" on public.cnp_requests;

create policy "cnp_requests_insert" on public.cnp_requests
  for insert to authenticated
  with check (
    user_can('cnp.manage')
    and (
      task_user_view_all()
      or task_user_in_line(line_id::text)
      or (task_is_general_line(line_id::text) and task_user_has_no_line())
    )
  );

create policy "cnp_requests_delete" on public.cnp_requests
  for delete to authenticated
  using (
    user_can('cnp.manage')
    and (
      task_user_view_all()
      or task_user_in_line(line_id::text)
      or (task_is_general_line(line_id::text) and task_user_has_no_line())
    )
  );
