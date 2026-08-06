-- Fecha de fin de contrato de un cliente (marca): último día bajo contrato.
-- Distinta de deleted_at (que solo archiva de las listas activas). contract_end define
-- hasta qué mes la cuenta aparece en los reportes: el mes que la contiene cuenta completo,
-- desde el mes siguiente ya no debe haber rastro (ver src/utils/clientInMonth.js, que usa
-- `contract_end ?? deleted_at` como fecha de baja).

ALTER TABLE metric_clients
  ADD COLUMN IF NOT EXISTS contract_end date;

COMMENT ON COLUMN public.metric_clients.contract_end IS
  'Último día bajo contrato. El mes que lo contiene cuenta completo en reportes; desde el mes siguiente la cuenta deja de aparecer.';
