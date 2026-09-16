-- Un jefe de una línea puede asignarle un CNP a un diseñador de otra línea (el picker de
-- Responsable en CnpModal.jsx lo permite a propósito: todo el departamento Diseño es
-- asignable sin importar la línea del CNP). Pero la policy de UPDATE nunca contempló ese
-- caso: solo dejaba escribir a quien viera TODAS las líneas (task_user_view_all()) o
-- perteneciera a la línea del CNP (task_user_in_line()) — el responsable asignado desde
-- fuera de su línea no podía cambiar el estado ni marcar piezas entregadas de su propio
-- CNP.
--
-- Se añaden dos casos al OR de acceso (tanto en `using` como en `with check`, para que la
-- condición se siga cumpliendo después del UPDATE):
--   (a) el responsable siempre puede trabajar el CNP que tiene asignado, sea de la línea
--       que sea.
--   (b) las líneas generales ("Independientes"/"Alta Gerencia") nunca tienen su
--       membresía persistida en metric_line_members (se derivan client-side, ver
--       withDerivedGeneralMembers en src/utils/lineMembers.js), así que
--       task_user_in_line() siempre da false ahí — hoy nadie sin task_user_view_all()
--       puede editar un CNP de esas líneas. task_is_general_line()/task_user_has_no_line()
--       ya resuelven este mismo caso en tasks (20260717000001_metric_lines_independientes.sql).
--
-- Nota: con (a) en el `with check`, un usuario que solo tiene acceso por ser el
-- responsable no puede reasignar el CNP a otra persona (perdería el acceso en el mismo
-- UPDATE). Es intencional — reasignar sigue siendo de quien gestiona la línea. La UI
-- refleja esto mostrando el responsable como texto fijo en ese caso (CnpModal.jsx).

drop policy if exists "cnp_requests_update" on public.cnp_requests;

create policy "cnp_requests_update" on public.cnp_requests
  for update to authenticated
  using (
    user_can('cnp.manage')
    and (
      task_user_view_all()
      or task_user_in_line(line_id::text)
      or assignee_id = auth.uid()::text
      or (task_is_general_line(line_id::text) and task_user_has_no_line())
    )
  )
  with check (
    user_can('cnp.manage')
    and (
      task_user_view_all()
      or task_user_in_line(line_id::text)
      or assignee_id = auth.uid()::text
      or (task_is_general_line(line_id::text) and task_user_has_no_line())
    )
  );
