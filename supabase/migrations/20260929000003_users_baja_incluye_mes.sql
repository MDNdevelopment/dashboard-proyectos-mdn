-- Al archivar un empleado, indica si su mes de baja aún cuenta en los reportes mensuales.
-- true  = conserva el mes de baja (trabajó parte del mes) — comportamiento histórico.
-- false = se excluye también del mes de baja (se fue en los primeros días / alta por error).
-- Solo aplica cuando deleted_at NO es null. Default true preserva el comportamiento
-- de todos los empleados ya archivados antes de esta migración.
-- Espejo de metric_clients.baja_incluye_mes (20260806000000_client_deletion_counts_month.sql);
-- lo consume src/utils/employeeInMonth.js.

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS baja_incluye_mes boolean NOT NULL DEFAULT true;
