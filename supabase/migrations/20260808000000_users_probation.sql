-- Empleados en período de prueba (RRHH).
-- Booleano de estado actual: true = en prueba; al pasar a fijo se desmarca.
-- Los empleados que no pasan quedan archivados (deleted_at) conservando esta marca,
-- así se puede distinguir "en prueba ahora" (activos) de "no pasó" (archivados).
alter table public.users
  add column if not exists on_probation boolean not null default false;

-- Índice parcial para listar/contar rápido a los que están en prueba por empresa.
create index if not exists users_probation_idx
  on public.users (company_id)
  where on_probation is true;
