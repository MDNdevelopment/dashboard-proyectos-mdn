-- Diseñador transversal: Juan Pedro Sierra no pertenece a una sola línea operativa,
-- se le deben poder asignar CNPs, tareas y cuentas de cualquier línea.
--
-- Enfoque: sacarlo de su línea actual (Team Georgina) para que caiga en el pool
-- "Independientes" (metric_lines.is_general — derivado en el cliente, ver
-- withDerivedGeneralMembers en src/utils/lineMembers.js), que ahora es asignable
-- desde cualquier línea (ver assignableUsers en src/utils/lineFilters.js).
--
-- Además se le activa tasks_view_all (mismo flag creado para Katherine Mora en
-- 20260713000001_tasks_view_all_flag.sql) para que vea tareas/CNP/pautas/chequeo de
-- todas las líneas. Los reportes (metric_reports) NO se ven afectados: exigen
-- access_level >= 3 (metrics_user_can_view en 20260704000000_metric_reports_team_rls.sql)
-- y Juan es nivel 2 — quedan fuera de alcance sin trabajo adicional.

do $$
declare
  v_user_id uuid;
  matched_count int;
begin
  select count(*) into matched_count
  from public.users
  where first_name ilike 'juan pedro' and last_name ilike 'sierra';

  if matched_count = 0 then
    raise notice 'disenador_transversal: no se encontró a Juan Pedro Sierra — no se aplicó ningún cambio.';
    return;
  elsif matched_count > 1 then
    raise exception 'disenador_transversal: % usuarios coinciden con Juan Pedro Sierra — aplicar el cambio manualmente para evitar ambigüedad.', matched_count;
  end if;

  select user_id into v_user_id
  from public.users
  where first_name ilike 'juan pedro' and last_name ilike 'sierra';

  -- 1. Sacarlo de cualquier línea real (Team Georgina) → cae al pool "Independientes".
  -- metric_line_members.user_id es text (sin FK formal a users.user_id, que es uuid).
  delete from public.metric_line_members
  where user_id = v_user_id::text;

  -- 2. Bypass de visibilidad por línea (no toca reportes, ver comentario arriba).
  update public.users
  set tasks_view_all = true
  where user_id = v_user_id;
end;
$$;
