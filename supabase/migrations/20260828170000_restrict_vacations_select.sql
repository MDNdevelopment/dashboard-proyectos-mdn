-- Restringe la lectura de `vacations` a quien tiene la capacidad
-- `empresa.vacaciones.manage` (RRHH/Sofía Lauretta, nivel ≥ 4, o admin) — antes el SELECT
-- era `using(true)` para cualquier autenticado (ver 20260907000000_rrhh_capabilities.sql,
-- que ya había restringido la escritura pero dejó la lectura abierta a propósito para la
-- tarjeta "De vacaciones ahora"). Decisión de negocio: esa tarjeta y el resto de la UI de
-- vacaciones (panel del año, botón "Vacaciones" por empleado, overlay en el calendario de
-- equipo) ahora solo deben ser visibles para quien tenga esa capacidad — el front (
-- EmployeesView.jsx) ya se ajustó para ocultar esos elementos cuando no aplica.
drop policy if exists "Authenticated users can read vacations" on vacations;

create policy "Authenticated users with capability can read vacations"
  on vacations for select
  to authenticated
  using (user_can('empresa.vacaciones.manage'));
