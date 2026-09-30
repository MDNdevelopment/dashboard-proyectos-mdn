-- Cuando una cuenta cambia de línea (metric_client_line_moves), las marcas de
-- fixed_task_marks de semanas anteriores conservan su line_id como snapshot de
-- quién hizo el trabajo (no se recalcula, ver 20260818000000). Hasta ahora el
-- permiso de escritura dependía exactamente de ese line_id snapshot, así que la
-- línea NUEVA dueña de la cuenta no podía corregir sus propias semanas pasadas
-- (bloqueadas por RLS) ni siquiera verlas cargadas en la grilla (TareasFijasPage
-- filtra por line_id). Se agrega una tercera vía de acceso: ser miembro de la
-- línea que hoy es dueña de la cuenta (metric_clients.line_id), sin tocar el
-- line_id ya grabado en la fila.
create or replace function public.task_user_owns_client(p_client_id uuid)
returns boolean
language sql
stable security definer
set search_path to 'public'
as $$
  select exists (
    select 1
    from public.metric_clients c
    join public.metric_line_members m on m.line_id = c.line_id
    where c.id = p_client_id
      and m.user_id = auth.uid()::text
  )
$$;

drop policy if exists "fixed_task_marks_insert" on public.fixed_task_marks;
create policy "fixed_task_marks_insert" on public.fixed_task_marks
  for insert to authenticated
  with check (
    user_can('tareas.fijas.manage')
    and (
      task_user_view_all()
      or task_user_in_line(line_id::text)
      or task_user_owns_client(client_id)
    )
  );

drop policy if exists "fixed_task_marks_update" on public.fixed_task_marks;
create policy "fixed_task_marks_update" on public.fixed_task_marks
  for update to authenticated
  using (
    user_can('tareas.fijas.manage')
    and (
      task_user_view_all()
      or task_user_in_line(line_id::text)
      or task_user_owns_client(client_id)
    )
  )
  with check (
    user_can('tareas.fijas.manage')
    and (
      task_user_view_all()
      or task_user_in_line(line_id::text)
      or task_user_owns_client(client_id)
    )
  );

drop policy if exists "fixed_task_marks_delete" on public.fixed_task_marks;
create policy "fixed_task_marks_delete" on public.fixed_task_marks
  for delete to authenticated
  using (
    user_can('tareas.fijas.manage')
    and (
      task_user_view_all()
      or task_user_in_line(line_id::text)
      or task_user_owns_client(client_id)
    )
  );
