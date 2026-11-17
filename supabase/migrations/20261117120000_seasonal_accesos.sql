-- Chequeo de temporada: acceso de lectura y de edición gestionable desde Empresa → Accesos.
--
-- Hasta ahora la sección usaba las capacidades del Chequeo normal (`chequeo.manage` para editar
-- y nada para ver). Se separan dos capacidades propias:
--   · tareas.chequeo.temporada   — ver el Chequeo de temporada (botón, ruta y lectura de datos).
--   · chequeo.temporada.manage   — editar piezas y personal de la temporada.
--
-- Defaults para que NADIE gane ni pierda acceso al aplicar la migración:
--   · ver: abierta (como estaba: cualquiera con acceso a Gestión de Tareas). Fila explícita
--     para que se vea y se pueda cambiar en Accesos; una capability sin fila queda abierta.
--   · editar: copia de las reglas actuales de `chequeo.manage` de cada empresa (en prod están
--     personalizadas), con nivel 2+ como respaldo si esa fila no existe.
--
-- RLS: las policies de seasonal_pieces y seasonal_assignments pasan de `chequeo.manage` a
-- `chequeo.temporada.manage` (el alcance por línea no cambia) y los SELECT de las tres tablas
-- de la temporada exigen `tareas.chequeo.temporada`. `user_can` de una capability sin fila
-- devuelve true, así que el orden con el seed no deja a nadie fuera.

do $$
declare
  cid text;
  v_manage jsonb;
begin
  for cid in
    select distinct company_id::text from public.users where company_id is not null
  loop
    select rules into v_manage
      from public.module_permissions
     where company_id = cid and module_key = 'chequeo.manage';

    insert into public.module_permissions (company_id, module_key, rules) values
      (cid, 'tareas.chequeo.temporada', '{"deny":[],"rules":[{"all":[]}]}'::jsonb),
      (cid, 'chequeo.temporada.manage',
       coalesce(v_manage, '{"rules":[{"all":[{"type":"min_level","value":2,"ids":[]}]}]}'::jsonb))
    on conflict (company_id, module_key) do nothing;
  end loop;
end;
$$;

-- ── Lectura ──────────────────────────────────────────────────────────────────
drop policy if exists "seasonal_campaigns_select" on public.seasonal_campaigns;
create policy "seasonal_campaigns_select" on public.seasonal_campaigns
  for select to authenticated
  using (user_can('tareas.chequeo.temporada'));

-- ── seasonal_pieces ────────────────────────────────────────────────────────────────
drop policy if exists "seasonal_pieces_select" on public.seasonal_pieces;
drop policy if exists "seasonal_pieces_insert" on public.seasonal_pieces;
drop policy if exists "seasonal_pieces_update" on public.seasonal_pieces;
drop policy if exists "seasonal_pieces_delete" on public.seasonal_pieces;

create policy "seasonal_pieces_select" on public.seasonal_pieces
  for select to authenticated
  using (user_can('tareas.chequeo.temporada'));

create policy "seasonal_pieces_insert" on public.seasonal_pieces
  for insert to authenticated
  with check (
    user_can('chequeo.temporada.manage')
    and (
      task_user_view_all()
      or user_can('chequeo.ver_todo')
      or task_user_in_line(line_id::text)
      or task_is_general_line(line_id::text)
    )
  );

create policy "seasonal_pieces_update" on public.seasonal_pieces
  for update to authenticated
  using (
    user_can('chequeo.temporada.manage')
    and (
      task_user_view_all()
      or user_can('chequeo.ver_todo')
      or task_user_in_line(line_id::text)
      or task_is_general_line(line_id::text)
    )
  )
  with check (
    user_can('chequeo.temporada.manage')
    and (
      task_user_view_all()
      or user_can('chequeo.ver_todo')
      or task_user_in_line(line_id::text)
      or task_is_general_line(line_id::text)
    )
  );

create policy "seasonal_pieces_delete" on public.seasonal_pieces
  for delete to authenticated
  using (
    user_can('chequeo.temporada.manage')
    and (
      task_user_view_all()
      or user_can('chequeo.ver_todo')
      or task_user_in_line(line_id::text)
      or task_is_general_line(line_id::text)
    )
  );

-- ── seasonal_assignments ────────────────────────────────────────────────────────────────
drop policy if exists "seasonal_assignments_select" on public.seasonal_assignments;
drop policy if exists "seasonal_assignments_insert" on public.seasonal_assignments;
drop policy if exists "seasonal_assignments_update" on public.seasonal_assignments;
drop policy if exists "seasonal_assignments_delete" on public.seasonal_assignments;

create policy "seasonal_assignments_select" on public.seasonal_assignments
  for select to authenticated
  using (user_can('tareas.chequeo.temporada'));

create policy "seasonal_assignments_insert" on public.seasonal_assignments
  for insert to authenticated
  with check (
    user_can('chequeo.temporada.manage')
    and (
      task_user_view_all()
      or user_can('chequeo.ver_todo')
      or task_user_in_line(line_id::text)
      or task_is_general_line(line_id::text)
    )
  );

create policy "seasonal_assignments_update" on public.seasonal_assignments
  for update to authenticated
  using (
    user_can('chequeo.temporada.manage')
    and (
      task_user_view_all()
      or user_can('chequeo.ver_todo')
      or task_user_in_line(line_id::text)
      or task_is_general_line(line_id::text)
    )
  )
  with check (
    user_can('chequeo.temporada.manage')
    and (
      task_user_view_all()
      or user_can('chequeo.ver_todo')
      or task_user_in_line(line_id::text)
      or task_is_general_line(line_id::text)
    )
  );

create policy "seasonal_assignments_delete" on public.seasonal_assignments
  for delete to authenticated
  using (
    user_can('chequeo.temporada.manage')
    and (
      task_user_view_all()
      or user_can('chequeo.ver_todo')
      or task_user_in_line(line_id::text)
      or task_is_general_line(line_id::text)
    )
  );
