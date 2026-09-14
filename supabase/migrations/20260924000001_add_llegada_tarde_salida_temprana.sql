-- Amplía el vocabulario de `employee_permissions.type` con dos tipos nuevos: llegada
-- tarde y salida temprana. A diferencia de permiso/ausencia/reposo (día completo no
-- trabajado), estos son eventos de UN día SÍ trabajado con una hora puntual — se agrega
-- `event_time` (nullable, solo aplica a estos dos tipos) para registrarla. La lógica de
-- "días ausente" del reporte mensual (`src/utils/employeePermissions.js`, `fullDay:
-- false` para estos dos tipos) los excluye de la columna "Días" a propósito.
--
-- Mismo criterio que `vacations_status_check`: reescribir el CHECK, sin migrar filas ni
-- columnas — ver comentario en la migración original (`20260924000000_...`).

alter table public.employee_permissions
  add column event_time time;

alter table public.employee_permissions
  drop constraint employee_permissions_type_check;

alter table public.employee_permissions
  add constraint employee_permissions_type_check
  check (type in ('permiso', 'ausencia', 'reposo', 'llegada_tarde', 'salida_temprana'));
