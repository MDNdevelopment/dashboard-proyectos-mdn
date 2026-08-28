-- `vacations` nunca se agregó a la publicación `supabase_realtime` (tabla histórica externa,
-- ver 20260827000000_vacations_normalize.sql) — el canal `empresa-empleados-changes` de
-- EmployeesView.jsx se suscribe a sus cambios, pero Postgres jamás emitía el evento, así que
-- confirmar/crear/revertir/eliminar una vacación no se reflejaba en el calendario ni en los
-- paneles de otros usuarios (ni en la misma pantalla) hasta recargar la página.
alter publication supabase_realtime add table public.vacations;
