-- Renombrar el estado 'Bloqueado' → 'Paralizado' en tasks.status.
-- El CHECK inline de la columna se autonombra 'tasks_status_check' en Postgres.
-- Orden: quitar el constraint → actualizar filas → volver a crear el constraint.
alter table public.tasks drop constraint if exists tasks_status_check;

update public.tasks set status = 'Paralizado' where status = 'Bloqueado';

alter table public.tasks
  add constraint tasks_status_check
  check (status in ('En proceso','Por revisar','Paralizado','Pendiente','Terminado'));
