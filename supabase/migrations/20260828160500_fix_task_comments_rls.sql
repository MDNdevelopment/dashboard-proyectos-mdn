-- Bloque 1.7: task_comments tenía SELECT/INSERT/DELETE using(true) para
-- authenticated: filtraba el contenido de tareas que el RLS de tasks sí
-- oculta, y cualquiera podía borrar comentarios ajenos.
--
-- SELECT/INSERT quedan condicionados a que el usuario pueda ver la tarea
-- padre (misma condición que tasks_select). DELETE se limita al autor del
-- comentario.

drop policy if exists "task_comments_read" on public.task_comments;
drop policy if exists "task_comments_insert" on public.task_comments;
drop policy if exists "task_comments_delete" on public.task_comments;

create policy "task_comments_select"
on public.task_comments
for select
to authenticated
using (
  exists (
    select 1 from public.tasks t
    where t.id = task_comments.task_id
      and (
        task_user_view_all()
        or (task_user_access_level() >= 2 and task_user_in_line((t.team_id)::text))
        or (task_user_access_level() >= 2 and task_is_general_line((t.team_id)::text) and task_user_has_no_line())
        or (auth.uid())::text = any (t.assignee_ids)
        or t.support_id = (auth.uid())::text
        or t.created_by = (auth.uid())::text
      )
  )
);

create policy "task_comments_insert"
on public.task_comments
for insert
to authenticated
with check (
  author_id = (auth.uid())::text
  and exists (
    select 1 from public.tasks t
    where t.id = task_comments.task_id
      and (
        task_user_view_all()
        or (task_user_access_level() >= 2 and task_user_in_line((t.team_id)::text))
        or (task_user_access_level() >= 2 and task_is_general_line((t.team_id)::text) and task_user_has_no_line())
        or (auth.uid())::text = any (t.assignee_ids)
        or t.support_id = (auth.uid())::text
        or t.created_by = (auth.uid())::text
      )
  )
);

create policy "task_comments_delete"
on public.task_comments
for delete
to authenticated
using (author_id = (auth.uid())::text);
