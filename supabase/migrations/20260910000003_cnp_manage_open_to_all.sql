-- Quita el requisito de nivel 2+ de `cnp.manage` (crear/editar/eliminar CNP, seed
-- original en 20260901000000_create_cnp.sql): ahora cualquier empleado puede crear CNPs,
-- sin importar su nivel de acceso. Grupo de reglas vacío ({all: []}) = capability abierta,
-- mismo patrón usado para audiovisual.manage/tareas.manage (ver ARQUITECTURA.md).
--
-- No toca `cnp.print.approve` (aprobación de impresión, restringida a Paola/Stephanie/
-- Katherine) ni la policy RLS `cnp_requests_insert`, que sigue exigiendo pertenencia a la
-- línea (task_user_in_line) o visión total (task_user_view_all), además de
-- user_can('cnp.manage') — "todos pueden crear" es sobre el nivel de acceso, no sobre
-- qué línea de cliente.
update public.module_permissions
set rules = '{"rules":[{"all":[]}]}'::jsonb
where module_key = 'cnp.manage';
