-- Migración: conectar el módulo de Tareas a las líneas de Empresa
--
-- Las tareas antes apuntaban a la tabla `teams` (tasks.team_id → teams.id).
-- Las líneas reales ahora viven en `metric_lines` y se gestionan desde Empresa.
-- Este script re-apunta tasks.team_id al id de la línea cuyo nombre coincida
-- con el nombre del team que tenía la tarea (matching por nombre, case-insensitive).
--
-- Tareas cuyo team no tenga línea homónima conservan el team_id antiguo y
-- quedan "sin línea" en la UI hasta ser reasignadas manualmente.
--
-- Las tablas `teams` y `team_members` NO se eliminan aquí; quedan inertes
-- y se pueden limpiar en una migración posterior tras verificar que todo esté correcto.

update public.tasks t
set team_id = ml.id
from public.teams old
join public.metric_lines ml
  on  ml.company_id = old.company_id
  and lower(trim(ml.name)) = lower(trim(old.name))
where t.team_id = old.id;
