-- Permite que quien crea una tarea (created_by) pueda insertarla sin necesidad de quedar
-- forzosamente en assignee_ids — mismo criterio que ya usan tasks_select/tasks_update desde
-- 20260709000000 (auth.uid()::text = created_by), que el INSERT nunca había adoptado.
--
-- Sin esta vía, un usuario nivel 1 (sin task_user_view_all ni membresía de línea) solo podía
-- insertar una tarea si auth.uid() quedaba en assignee_ids — el frontend (TaskModal.jsx) por
-- eso lo agregaba como responsable y lo bloqueaba para que no se pudiera quitar, porque
-- quitarlo hacía que el INSERT fuera rechazado por RLS. Con created_by como vía alternativa,
-- un nivel 1 puede crear una tarea y asignarla solo a otras personas del team, sin quedar él
-- atrapado como responsable. TaskModal.jsx ya no bloquea el chip del creador en ese caso
-- (ver `isCreator` en TaskModal.jsx) — sigue bloqueado solo cuando EDITA una tarea de la que
-- no es created_by (ahí assignee_ids/support_id siguen siendo la única vía que le da el RLS
-- de UPDATE).
drop policy "tasks_insert" on public.tasks;

create policy "tasks_insert" on public.tasks
  for insert to authenticated
  with check (
    task_user_view_all()
    or (task_user_access_level() >= 2 and task_user_in_line(team_id::text))
    or (task_user_access_level() >= 2 and task_is_general_line(team_id::text) and task_user_has_no_line())
    or (task_user_access_level() >= 4 and task_is_management_line(team_id::text))
    or auth.uid()::text = any(assignee_ids)
    or created_by = auth.uid()::text
  );
