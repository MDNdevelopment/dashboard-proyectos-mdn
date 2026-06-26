-- Rellena metric_lines.member_user_ids con los responsables (assignee_id) de las tareas
-- de cada línea. Combina con los miembros ya existentes para no sobrescribir cambios manuales.
-- Patrón: UNION de ids ya en el array + assignee_ids de las tareas del mismo team.
update public.metric_lines ml
set member_user_ids = (
  select coalesce(jsonb_agg(distinct uid order by uid), '[]'::jsonb)
  from (
    -- miembros ya registrados
    select jsonb_array_elements_text(ml.member_user_ids) as uid
    union
    -- responsables de tareas de esta línea
    select t.assignee_id
    from public.tasks t
    where t.team_id = ml.id
      and t.assignee_id is not null
      and t.assignee_id <> ''
  ) s
);
