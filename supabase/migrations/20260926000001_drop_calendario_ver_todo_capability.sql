-- El calendario de fechas del Home ("Fechas del equipo y clientes") dejó de filtrar por
-- línea: ahora cualquier empleado logueado ve los aniversarios de todos los clientes (ver
-- ARQUITECTURA.md §"Fechas del equipo y clientes"). La capacidad `empresa.calendario.ver_todo`
-- (sembrada en 20260907000000_rrhh_capabilities.sql) ya no la consume ningún código —
-- se elimina la clave del listado de capabilities (src/config/modules.js) y aquí sus filas
-- de `module_permissions` para no dejar permisos huérfanos en la UI de Empresa → Permisos.
delete from public.module_permissions
where module_key = 'empresa.calendario.ver_todo';
