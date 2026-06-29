-- Agrega mensualidad a la ficha del cliente (para auto-poblar ingresos en Finanzas).
-- Nullable; se llena opcionalmente desde ClientModal.
alter table metric_clients
  add column if not exists monthly_fee numeric(12,2);
